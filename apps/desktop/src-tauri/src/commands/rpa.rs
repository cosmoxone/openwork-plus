use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::paths::home_dir;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RpaStatus {
    pub data_dir: String,
    pub sandbox_mode: String,
    pub sandbox_bootstrapped: bool,
    pub automation_enabled: bool,
    pub automation_updated_at: Option<String>,
    pub screenshot_count: usize,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationEntry {
    pub app_name: String,
    pub index: i64,
    pub x: f64,
    pub y: f64,
    pub operation: String,
    pub timestamp: i64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub path: String,
    pub display_index: u32,
    pub summary: String,
}

#[derive(Debug, Deserialize)]
struct BootstrapState {
    mode: Option<String>,
    #[serde(rename = "completedAt")]
    completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AutomationState {
    enabled: Option<bool>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
}

fn unix_iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

fn system_time_iso(time: SystemTime) -> String {
    let secs = time.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    format!("{secs}")
}

#[derive(Debug, Deserialize)]
struct ClickHistoryFile {
    #[serde(rename = "appName")]
    app_name: Option<String>,
    clicks: Option<Vec<ClickEntry>>,
}

#[derive(Debug, Deserialize)]
struct ClickEntry {
    index: Option<i64>,
    x_normalized: Option<f64>,
    y_normalized: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    operation: Option<String>,
    timestamp: Option<i64>,
    count: Option<i64>,
}

fn resolve_openwork_data_dir() -> PathBuf {
    if let Ok(dir) = env::var("OPENWORK_DATA_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    if let Some(home) = home_dir() {
        if cfg!(target_os = "windows") {
            if let Ok(appdata) = env::var("APPDATA") {
                if !appdata.trim().is_empty() {
                    return PathBuf::from(appdata).join("openwork");
                }
            }
        }
        return home.join(".openwork");
    }

    PathBuf::from(".openwork")
}

fn read_bootstrap_mode(data_dir: &Path) -> (String, bool) {
    let file = data_dir.join("sandbox-bootstrap.json");
    let Ok(raw) = fs::read_to_string(file) else {
        return ("unknown".to_string(), false);
    };
    let Ok(state) = serde_json::from_str::<BootstrapState>(&raw) else {
        return ("unknown".to_string(), false);
    };
    (
        state.mode.unwrap_or_else(|| "unknown".to_string()),
        state.completed_at.is_some(),
    )
}

fn read_automation(data_dir: &Path) -> (bool, Option<String>) {
    let file = data_dir.join("rpa-automation.json");
    let Ok(raw) = fs::read_to_string(file) else {
        return (false, None);
    };
    let Ok(state) = serde_json::from_str::<AutomationState>(&raw) else {
        return (false, None);
    };
    (state.enabled.unwrap_or(false), state.updated_at)
}

fn count_screenshots(data_dir: &Path) -> usize {
    let dir = data_dir.join("gui_operate").join("screenshots");
    let Ok(read_dir) = fs::read_dir(dir) else {
        return 0;
    };
    read_dir
        .flatten()
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| {
                    matches!(
                        ext.to_ascii_lowercase().as_str(),
                        "png" | "jpg" | "jpeg" | "webp"
                    )
                })
                .unwrap_or(false)
        })
        .count()
}

fn list_screenshot_entries(data_dir: &Path, limit: usize) -> Result<Vec<ScreenshotEntry>, String> {
    let dir = data_dir.join("gui_operate").join("screenshots");
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.ends_with(".png")
            && !name.ends_with(".jpg")
            && !name.ends_with(".jpeg")
            && !name.ends_with(".webp")
        {
            continue;
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let modified_at = meta
            .modified()
            .map(system_time_iso)
            .unwrap_or_default();
        entries.push(ScreenshotEntry {
            name: name.to_string(),
            path: path.to_string_lossy().to_string(),
            size: meta.len(),
            modified_at,
        });
    }
    entries.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    entries.truncate(limit);
    Ok(entries)
}

fn list_operation_entries(data_dir: &Path, limit: usize) -> Result<Vec<OperationEntry>, String> {
    let apps_dir = data_dir.join("gui_apps");
    if !apps_dir.exists() {
        return Ok(Vec::new());
    }

    let mut rows = Vec::new();
    for entry in fs::read_dir(&apps_dir).map_err(|e| e.to_string())?.flatten() {
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let history_path = entry.path().join("click_history.json");
        if !history_path.exists() {
            continue;
        }
        let raw = fs::read_to_string(&history_path).map_err(|e| e.to_string())?;
        let history: ClickHistoryFile =
            serde_json::from_str(&raw).map_err(|e| format!("invalid click history: {e}"))?;
        let app_name = history
            .app_name
            .clone()
            .unwrap_or_else(|| entry.file_name().to_string_lossy().to_string());
        for click in history.clicks.unwrap_or_default() {
            rows.push(OperationEntry {
                app_name: app_name.clone(),
                index: click.index.unwrap_or(0),
                x: click.x_normalized.or(click.x).unwrap_or(0.0),
                y: click.y_normalized.or(click.y).unwrap_or(0.0),
                operation: click.operation.unwrap_or_else(|| "click".to_string()),
                timestamp: click.timestamp.unwrap_or(0),
                count: click.count.unwrap_or(1),
            });
        }
    }
    rows.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    rows.truncate(limit);
    Ok(rows)
}

fn rpa_host_script_path() -> Option<PathBuf> {
    if let Ok(root) = env::var("OPENWORK_MONOREPO_ROOT") {
        let trimmed = root.trim();
        if !trimmed.is_empty() {
            let script = PathBuf::from(trimmed)
                .join("packages")
                .join("rpa-host")
                .join("bin")
                .join("rpa-host.mjs");
            if script.exists() {
                return Some(script);
            }
        }
    }
    None
}

#[tauri::command]
pub fn rpa_status() -> Result<RpaStatus, String> {
    let data_dir = resolve_openwork_data_dir();
    let (sandbox_mode, sandbox_bootstrapped) = read_bootstrap_mode(&data_dir);
    let (automation_enabled, automation_updated_at) = read_automation(&data_dir);
    Ok(RpaStatus {
        data_dir: data_dir.to_string_lossy().to_string(),
        sandbox_mode,
        sandbox_bootstrapped,
        automation_enabled,
        automation_updated_at,
        screenshot_count: count_screenshots(&data_dir),
        platform: env::consts::OS.to_string(),
    })
}

#[tauri::command]
pub fn rpa_list_screenshots() -> Result<Vec<ScreenshotEntry>, String> {
    list_screenshot_entries(&resolve_openwork_data_dir(), 20)
}

#[tauri::command]
pub fn rpa_list_operations() -> Result<Vec<OperationEntry>, String> {
    list_operation_entries(&resolve_openwork_data_dir(), 50)
}

#[tauri::command]
pub fn rpa_set_automation_enabled(enabled: bool) -> Result<AutomationState, String> {
    let data_dir = resolve_openwork_data_dir();
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let updated_at = unix_iso_now();
    let state = AutomationState {
        enabled: Some(enabled),
        updated_at: Some(updated_at.clone()),
    };
    fs::write(
        data_dir.join("rpa-automation.json"),
        serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(state)
}

#[tauri::command]
pub fn rpa_capture_screenshot(display_index: Option<u32>) -> Result<CaptureResult, String> {
    let data_dir = resolve_openwork_data_dir();
    let script = rpa_host_script_path().ok_or_else(|| {
        "rpa-host script not found (set OPENWORK_MONOREPO_ROOT in dev)".to_string()
    })?;

    let display = display_index.unwrap_or(0);
    let output = Command::new("node")
        .arg(&script)
        .arg("capture")
        .arg("--json")
        .arg("--data-dir")
        .arg(data_dir.to_string_lossy().to_string())
        .arg("--display")
        .arg(display.to_string())
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    serde_json::from_slice(&output.stdout).map_err(|e| format!("invalid capture output: {e}"))
}
