use std::fs;
use std::path::PathBuf;

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunRow {
    pub id: String,
    pub framework: String,
    pub passed: i64,
    pub failed: i64,
    pub skipped: i64,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestTrendPoint {
    pub day: String,
    pub passed: i64,
    pub failed: i64,
    pub runs: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestAutomationDashboard {
    pub ok: bool,
    pub db_path: String,
    pub runs: Vec<TestRunRow>,
    pub trend: Vec<TestTrendPoint>,
}

fn results_path(workspace_path: &str) -> PathBuf {
    PathBuf::from(workspace_path)
        .join(".openwork")
        .join("test-results.json")
}

fn day_bucket(started_at: &str) -> Option<String> {
    if started_at.len() >= 10 {
        return Some(started_at[..10].to_string());
    }
    None
}

fn build_trend(runs: &[TestRunRow]) -> Vec<TestTrendPoint> {
    use std::collections::BTreeMap;

    let mut buckets: BTreeMap<String, TestTrendPoint> = BTreeMap::new();
    for run in runs {
        let Some(started) = run.started_at.as_deref() else {
            continue;
        };
        let Some(day) = day_bucket(started) else {
            continue;
        };
        let entry = buckets.entry(day.clone()).or_insert(TestTrendPoint {
            day,
            passed: 0,
            failed: 0,
            runs: 0,
        });
        entry.passed += run.passed;
        entry.failed += run.failed;
        entry.runs += 1;
    }
    buckets.into_values().collect()
}

#[tauri::command]
pub fn test_automation_read_dashboard(workspace_path: String) -> Result<TestAutomationDashboard, String> {
    let db_path = results_path(&workspace_path);
    let db_display = db_path.to_string_lossy().to_string();

    if !db_path.exists() {
        return Ok(TestAutomationDashboard {
            ok: true,
            db_path: db_display,
            runs: vec![],
            trend: vec![],
        });
    }

    let raw = fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let mut runs = Vec::new();

    if let Some(list) = parsed.get("runs").and_then(|v| v.as_array()) {
        for item in list {
            runs.push(TestRunRow {
                id: item
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("run")
                    .to_string(),
                framework: item
                    .get("framework")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                passed: item.get("passed").and_then(|v| v.as_i64()).unwrap_or(0),
                failed: item.get("failed").and_then(|v| v.as_i64()).unwrap_or(0),
                skipped: item.get("skipped").and_then(|v| v.as_i64()).unwrap_or(0),
                started_at: item
                    .get("startedAt")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                finished_at: item
                    .get("finishedAt")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            });
        }
    }

    runs.reverse();
    let trend = build_trend(&runs);

    Ok(TestAutomationDashboard {
        ok: true,
        db_path: db_display,
        runs: runs.into_iter().take(20).collect(),
        trend,
    })
}
