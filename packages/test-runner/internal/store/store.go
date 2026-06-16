// Package store 提供测试结果 JSON 持久化（与 @openwork/test-db-mcp 共用文件格式）。
package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// TestCase 是一条用例结果。
type TestCase struct {
	Name     string `json:"name"`
	Status   string `json:"status"` // passed|failed|skipped
	Duration float64 `json:"durationMs,omitempty"`
	Message  string `json:"message,omitempty"`
	File     string `json:"file,omitempty"`
}

// RunRecord 是一次测试运行记录。
type RunRecord struct {
	ID        string     `json:"id"`
	Framework string     `json:"framework"`
	Path      string     `json:"path"`
	StartedAt string     `json:"startedAt"`
	FinishedAt string    `json:"finishedAt"`
	Passed    int        `json:"passed"`
	Failed    int        `json:"failed"`
	Skipped   int        `json:"skipped"`
	Cases     []TestCase `json:"cases"`
	Coverage  *Coverage  `json:"coverage,omitempty"`
}

// Coverage 是覆盖率摘要。
type Coverage struct {
	Lines   float64 `json:"linesPercent,omitempty"`
	Branches float64 `json:"branchesPercent,omitempty"`
	Raw     any     `json:"raw,omitempty"`
}

// DB 是 JSON 文件后端。
type DB struct {
	path string
}

// File 默认测试结果库路径。
func DefaultPath() string {
	if p := os.Getenv("OPENWORK_TEST_DB"); p != "" {
		return p
	}
	home, _ := os.UserHomeDir()
	if os.Getenv("APPDATA") != "" || filepath.Separator == '\\' {
		base := os.Getenv("APPDATA")
		if base == "" {
			base = filepath.Join(home, "AppData", "Roaming")
		}
		return filepath.Join(base, "openwork", "test-results.json")
	}
	return filepath.Join(home, ".openwork", "test-results.json")
}

// Open 打开或创建 DB。
func Open(path string) (*DB, error) {
	if path == "" {
		path = DefaultPath()
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	return &DB{path: path}, nil
}

type fileData struct {
	Runs []RunRecord `json:"runs"`
}

func (d *DB) load() (fileData, error) {
	var data fileData
	b, err := os.ReadFile(d.path)
	if err != nil {
		if os.IsNotExist(err) {
			return data, nil
		}
		return data, err
	}
	if err := json.Unmarshal(b, &data); err != nil {
		return data, err
	}
	return data, nil
}

func (d *DB) save(data fileData) error {
	b, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(d.path, b, 0o644)
}

// AppendRun 追加一次运行记录。
func (d *DB) AppendRun(r RunRecord) error {
	data, err := d.load()
	if err != nil {
		return err
	}
	data.Runs = append(data.Runs, r)
	return d.save(data)
}

// ListFailures 返回 since 之后的失败用例。
func (d *DB) ListFailures(since time.Duration) ([]RunRecord, error) {
	data, err := d.load()
	if err != nil {
		return nil, err
	}
	cutoff := time.Now().Add(-since)
	var out []RunRecord
	for i := len(data.Runs) - 1; i >= 0; i-- {
		r := data.Runs[i]
		t, err := time.Parse(time.RFC3339, r.StartedAt)
		if err != nil || t.Before(cutoff) {
			continue
		}
		if r.Failed > 0 {
			failed := r
			failed.Cases = nil
			for _, c := range r.Cases {
				if c.Status == "failed" {
					failed.Cases = append(failed.Cases, c)
				}
			}
			out = append(out, failed)
		}
	}
	return out, nil
}

// Path 返回数据库文件路径。
func (d *DB) Path() string { return d.path }
