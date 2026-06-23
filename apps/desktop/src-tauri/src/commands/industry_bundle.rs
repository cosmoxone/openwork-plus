use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::orchestrator::resolve_orchestrator_data_dir;
use crate::paths::sidecar_path_candidates;

const DEFAULT_CATALOG_URL: &str = "https://hub.openwork.ai/catalog.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndustryBundleCatalogEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    pub source: Option<String>,
    pub path: Option<String>,
    pub sha256: Option<String>,
    pub download_url: Option<String>,
    pub installed: bool,
    pub installed_version: Option<String>,
    pub installed_at: Option<String>,
    pub update_available: bool,
    pub status: String,
    pub featured: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndustryBundleInstalledRecord {
    pub id: String,
    pub version: String,
    pub name: Option<String>,
    pub installed_at: Option<String>,
    pub workspace_root: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct CatalogEnvelope {
    ok: bool,
    error: Option<String>,
    bundles: Option<Vec<IndustryBundleCatalogEntry>>,
}

#[derive(Debug, Clone, Deserialize)]
struct InstalledEnvelope {
    ok: bool,
    error: Option<String>,
    bundles: Option<Vec<IndustryBundleInstalledRecord>>,
}

#[derive(Debug, Clone, Deserialize)]
struct ActionEnvelope<T> {
    ok: bool,
    error: Option<String>,
    result: Option<T>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndustryBundleInstallResult {
    pub id: String,
    pub version: String,
}

fn dev_mode() -> bool {
    env::var("OPENWORK_DEV_MODE").ok().as_deref() == Some("1")
}

fn monorepo_root() -> Option<PathBuf> {
    env::var("OPENWORK_MONOREPO_ROOT")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            if dev_mode() {
                // dev: cwd often apps/desktop
                let cwd = env::current_dir().ok()?;
                for ancestor in cwd.ancestors() {
                    if ancestor.join("pnpm-workspace.yaml").is_file() {
                        return Some(ancestor.to_path_buf());
                    }
                }
            }
            None
        })
}

fn desktop_cli_script() -> Option<PathBuf> {
    monorepo_root().map(|root| {
        root.join("apps")
            .join("orchestrator")
            .join("src")
            .join("bundle")
            .join("desktop-cli.mjs")
    })
}

fn resolve_builtin_catalog(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("bundles").join("catalog.builtin.json");
        if bundled.is_file() {
            return Some(bundled);
        }
    }
    monorepo_root().map(|root| {
        root.join("apps")
            .join("desktop")
            .join("src-tauri")
            .join("resources")
            .join("bundles")
            .join("catalog.builtin.json")
    })
}

fn resolve_builtin_zip(app: &AppHandle, rel_path: &str) -> Option<PathBuf> {
    if rel_path.contains("..") || rel_path.contains(':') {
        return None;
    }
    if let Ok(dir) = app.path().resource_dir() {
        let p = dir.join("bundles").join(rel_path);
        if p.is_file() {
            return Some(p);
        }
    }
    monorepo_root().map(|root| {
        root.join("apps")
            .join("desktop")
            .join("src-tauri")
            .join("resources")
            .join("bundles")
            .join(rel_path)
    })
}

fn resolve_data_dir(override_dir: Option<String>) -> String {
    override_dir
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(resolve_orchestrator_data_dir)
}

fn resolve_remote_catalog_url(override_url: Option<String>) -> String {
    if let Some(url) = override_url.filter(|v| !v.trim().is_empty()) {
        return url;
    }
    if let Ok(url) = env::var("OPENWORK_BUNDLE_CATALOG_URL") {
        if !url.trim().is_empty() {
            return url;
        }
    }
    DEFAULT_CATALOG_URL.to_string()
}

fn run_node_cli(script: &Path, args: &[String]) -> Result<String, String> {
    let output = Command::new("node")
        .arg(script)
        .args(args)
        .output()
        .map_err(|e| format!("failed to spawn node: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        if let Ok(env) = serde_json::from_str::<ActionEnvelope<serde_json::Value>>(&stdout) {
            if let Some(err) = env.error {
                return Err(err);
            }
        }
        return Err(if stderr.is_empty() {
            format!("bundle cli failed (status {})", output.status)
        } else {
            stderr
        });
    }

    Ok(stdout)
}

fn run_orchestrator_bundle(app: &AppHandle, args: Vec<String>) -> Result<String, String> {
    if let Some(script) = desktop_cli_script() {
        if script.is_file() {
            return run_node_cli(&script, &args);
        }
    }

    let resource_dir = app.path().resource_dir().ok();
    let current_bin_dir = tauri::process::current_binary(&app.env())
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.to_path_buf()));
    let candidates = sidecar_path_candidates(resource_dir.as_deref(), current_bin_dir.as_deref());
    let bin_name = if cfg!(target_os = "windows") {
        "openwork-plus-orchestrator.exe"
    } else {
        "openwork-orchestrator"
    };

    for dir in candidates {
        let bin = dir.join(bin_name);
        if !bin.is_file() {
            continue;
        }
        let mut full_args = vec!["bundle".to_string()];
        full_args.extend(args.clone());
        full_args.push("--json".to_string());
        let output = Command::new(&bin)
            .args(&full_args)
            .output()
            .map_err(|e| format!("orchestrator bundle failed: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if output.status.success() {
            return Ok(stdout);
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("orchestrator bundle failed (status {})", output.status)
        } else {
            stderr
        });
    }

    Err("openwork-plus-orchestrator not found (dev: set OPENWORK_MONOREPO_ROOT)".to_string())
}

fn parse_catalog(stdout: &str) -> Result<Vec<IndustryBundleCatalogEntry>, String> {
    let env: CatalogEnvelope =
        serde_json::from_str(stdout).map_err(|e| format!("invalid catalog json: {e}"))?;
    if !env.ok {
        return Err(env.error.unwrap_or_else(|| "catalog failed".to_string()));
    }
    Ok(env.bundles.unwrap_or_default())
}

#[tauri::command]
pub fn industry_bundle_list_catalog(
    app: AppHandle,
    workspace_path: String,
    data_dir: Option<String>,
    remote_url: Option<String>,
) -> Result<Vec<IndustryBundleCatalogEntry>, String> {
    let catalog = resolve_builtin_catalog(&app).ok_or_else(|| "builtin catalog not found".to_string())?;
    let url = resolve_remote_catalog_url(remote_url);

    let stdout = run_orchestrator_bundle(
        &app,
        vec![
            "catalog".to_string(),
            "--builtin".to_string(),
            catalog.to_string_lossy().to_string(),
            "--remote-url".to_string(),
            url,
            "--workspace".to_string(),
            workspace_path,
            "--data-dir".to_string(),
            resolve_data_dir(data_dir),
        ],
    )?;
    parse_catalog(&stdout)
}

#[tauri::command]
pub fn industry_bundle_list_installed(
    app: AppHandle,
    workspace_path: String,
    data_dir: Option<String>,
) -> Result<Vec<IndustryBundleInstalledRecord>, String> {
    let stdout = run_orchestrator_bundle(
        &app,
        vec![
            "installed".to_string(),
            "--workspace".to_string(),
            workspace_path,
            "--data-dir".to_string(),
            resolve_data_dir(data_dir),
        ],
    )?;
    let env: InstalledEnvelope =
        serde_json::from_str(&stdout).map_err(|e| format!("invalid json: {e}"))?;
    if !env.ok {
        return Err(env.error.unwrap_or_else(|| "installed failed".to_string()));
    }
    Ok(env.bundles.unwrap_or_default())
}

#[tauri::command]
pub fn industry_bundle_install(
    app: AppHandle,
    workspace_path: String,
    source: String,
    data_dir: Option<String>,
    replace: Option<bool>,
) -> Result<IndustryBundleInstallResult, String> {
    let mut args = vec![
        "install".to_string(),
        "--source".to_string(),
        source,
        "--workspace".to_string(),
        workspace_path,
        "--data-dir".to_string(),
        resolve_data_dir(data_dir),
    ];
    if replace.unwrap_or(false) {
        args.push("--replace".to_string());
    }

    let stdout = run_orchestrator_bundle(&app, args)?;
    let env: ActionEnvelope<IndustryBundleInstallResult> =
        serde_json::from_str(&stdout).map_err(|e| format!("invalid install json: {e}"))?;
    if !env.ok {
        return Err(env.error.unwrap_or_else(|| "install failed".to_string()));
    }
    env.result.ok_or_else(|| "install missing result".to_string())
}

#[tauri::command]
pub fn industry_bundle_install_builtin(
    app: AppHandle,
    workspace_path: String,
    bundle_id: String,
    data_dir: Option<String>,
    replace: Option<bool>,
) -> Result<IndustryBundleInstallResult, String> {
    let catalog_path = resolve_builtin_catalog(&app).ok_or_else(|| "builtin catalog not found".to_string())?;
    let raw = std::fs::read_to_string(&catalog_path).map_err(|e| e.to_string())?;
    let catalog: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let bundles = catalog
        .get("bundles")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "invalid catalog".to_string())?;

    let entry = bundles
        .iter()
        .find(|b| b.get("id").and_then(|v| v.as_str()) == Some(bundle_id.as_str()))
        .ok_or_else(|| format!("builtin bundle not found: {bundle_id}"))?;

    let rel = entry
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("catalog missing path for {bundle_id}"))?;

    let zip = resolve_builtin_zip(&app, rel).ok_or_else(|| format!("zip missing: {rel}"))?;

    industry_bundle_install(
        app,
        workspace_path,
        zip.to_string_lossy().to_string(),
        data_dir,
        replace,
    )
}

#[tauri::command]
pub fn industry_bundle_install_from_catalog(
    app: AppHandle,
    workspace_path: String,
    bundle_id: String,
    data_dir: Option<String>,
    remote_url: Option<String>,
    replace: Option<bool>,
) -> Result<IndustryBundleInstallResult, String> {
    let catalog = resolve_builtin_catalog(&app).ok_or_else(|| "builtin catalog not found".to_string())?;
    let url = resolve_remote_catalog_url(remote_url);

    let mut args = vec![
        "install-catalog".to_string(),
        "--id".to_string(),
        bundle_id,
        "--builtin".to_string(),
        catalog.to_string_lossy().to_string(),
        "--workspace".to_string(),
        workspace_path,
        "--data-dir".to_string(),
        resolve_data_dir(data_dir),
        "--remote-url".to_string(),
        url,
    ];
    if replace.unwrap_or(false) {
        args.push("--replace".to_string());
    }

    let stdout = run_orchestrator_bundle(&app, args)?;
    let env: ActionEnvelope<IndustryBundleInstallResult> =
        serde_json::from_str(&stdout).map_err(|e| format!("invalid install-catalog json: {e}"))?;
    if !env.ok {
        return Err(env.error.unwrap_or_else(|| "install-catalog failed".to_string()));
    }
    env.result.ok_or_else(|| "install-catalog missing result".to_string())
}

#[tauri::command]
pub fn industry_bundle_uninstall(
    app: AppHandle,
    bundle_id: String,
    data_dir: Option<String>,
) -> Result<serde_json::Value, String> {
    let stdout = run_orchestrator_bundle(
        &app,
        vec![
            "uninstall".to_string(),
            "--id".to_string(),
            bundle_id,
            "--data-dir".to_string(),
            resolve_data_dir(data_dir),
        ],
    )?;
    let env: ActionEnvelope<serde_json::Value> =
        serde_json::from_str(&stdout).map_err(|e| format!("invalid json: {e}"))?;
    if !env.ok {
        return Err(env.error.unwrap_or_else(|| "uninstall failed".to_string()));
    }
    Ok(env.result.unwrap_or(serde_json::json!({})))
}

#[tauri::command]
pub fn industry_bundle_check_updates(
    app: AppHandle,
    workspace_path: String,
    data_dir: Option<String>,
    remote_url: Option<String>,
) -> Result<Vec<IndustryBundleCatalogEntry>, String> {
    industry_bundle_list_catalog(app, workspace_path, data_dir, remote_url)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndustryBundleUiManifest {
    pub schema_version: Option<String>,
    pub bundles: Vec<IndustryBundleUiEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndustryBundleUiEntry {
    pub id: String,
    pub name: Option<String>,
    pub version: Option<String>,
    pub routes: Option<Vec<String>>,
}

#[tauri::command]
pub fn industry_bundle_read_ui_manifest(workspace_path: String) -> Result<IndustryBundleUiManifest, String> {
    let file = PathBuf::from(workspace_path)
        .join(".openwork")
        .join("bundle-ui.json");
    if !file.is_file() {
        return Ok(IndustryBundleUiManifest {
            schema_version: Some("1.0.0".to_string()),
            bundles: vec![],
        });
    }
    let raw = std::fs::read_to_string(&file).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("invalid bundle-ui.json: {e}"))
}
