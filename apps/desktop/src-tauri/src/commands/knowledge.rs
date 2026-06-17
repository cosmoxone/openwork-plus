use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

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

fn knowledge_cli_script() -> Option<PathBuf> {
    monorepo_root().map(|root| {
        root.join("packages")
            .join("knowledge-wiki")
            .join("bin")
            .join("knowledge-wiki.mjs")
    })
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
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&stdout) {
            if let Some(err) = parsed.get("error").and_then(|v| v.as_str()) {
                return Err(err.to_string());
            }
        }
        return Err(if stderr.is_empty() {
            format!("knowledge-wiki cli failed (status {})", output.status)
        } else {
            stderr
        });
    }

    Ok(stdout)
}

fn run_knowledge_cli(args: Vec<String>) -> Result<String, String> {
    let script = knowledge_cli_script().ok_or_else(|| "knowledge-wiki script not found".to_string())?;
    if !script.is_file() {
        return Err(format!("missing cli: {}", script.display()));
    }
    run_node_cli(&script, &args)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeScanEntry {
    pub path: String,
    pub relative_path: String,
    pub size: u64,
    pub mtime_ms: f64,
    pub sha256: String,
    pub ext: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIngestLogEntry {
    pub at: String,
    pub source_path: String,
    pub summary_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeState {
    pub version: String,
    pub updated_at: String,
    pub scan_roots: Vec<String>,
    pub scan_manifest: Vec<KnowledgeScanEntry>,
    pub ingest_log: Vec<KnowledgeIngestLogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeScanResult {
    pub ok: bool,
    pub roots: Vec<String>,
    pub total: usize,
    pub pending: usize,
    pub ingested: usize,
    pub manifest: Vec<KnowledgeScanEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIngestResult {
    pub ok: bool,
    pub source_path: String,
    pub archive_path: String,
    pub summary_path: String,
    pub summary_rel: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeStateResult {
    pub ok: bool,
    pub state: KnowledgeState,
    pub index_preview: String,
}

#[tauri::command]
pub fn knowledge_init(workspace_path: String) -> Result<serde_json::Value, String> {
    let stdout = run_knowledge_cli(vec![
        "init".to_string(),
        "--workspace".to_string(),
        workspace_path,
    ])?;
    serde_json::from_str(&stdout).map_err(|e| format!("invalid json: {e}"))
}

#[tauri::command]
pub fn knowledge_scan(
    workspace_path: String,
    roots: Vec<String>,
) -> Result<KnowledgeScanResult, String> {
    let roots_csv = if roots.is_empty() {
        workspace_path.clone()
    } else {
        roots.join(",")
    };
    let stdout = run_knowledge_cli(vec![
        "scan".to_string(),
        "--workspace".to_string(),
        workspace_path,
        "--roots".to_string(),
        roots_csv,
    ])?;
    serde_json::from_str(&stdout).map_err(|e| format!("invalid json: {e}"))
}

#[tauri::command]
pub fn knowledge_ingest(
    workspace_path: String,
    file_path: String,
    title: Option<String>,
) -> Result<KnowledgeIngestResult, String> {
    let mut args = vec![
        "ingest".to_string(),
        "--workspace".to_string(),
        workspace_path,
        "--file".to_string(),
        file_path,
    ];
    if let Some(t) = title.filter(|v| !v.trim().is_empty()) {
        args.push("--title".to_string());
        args.push(t);
    }
    let stdout = run_knowledge_cli(args)?;
    serde_json::from_str(&stdout).map_err(|e| format!("invalid json: {e}"))
}

#[tauri::command]
pub fn knowledge_read_state(workspace_path: String) -> Result<KnowledgeStateResult, String> {
    let stdout = run_knowledge_cli(vec![
        "state".to_string(),
        "--workspace".to_string(),
        workspace_path,
    ])?;
    serde_json::from_str(&stdout).map_err(|e| format!("invalid json: {e}"))
}
