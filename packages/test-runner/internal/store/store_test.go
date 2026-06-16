package store

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAppendAndListFailures(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "test-results.json"))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := db.AppendRun(RunRecord{
		ID: "r1", Framework: "jest", Path: ".", StartedAt: now, FinishedAt: now,
		Passed: 1, Failed: 1,
		Cases: []TestCase{{Name: "ok", Status: "passed"}, {Name: "bad", Status: "failed", Message: "x"}},
	}); err != nil {
		t.Fatal(err)
	}
	fails, err := db.ListFailures(24 * time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if len(fails) != 1 || len(fails[0].Cases) != 1 {
		t.Fatalf("期望 1 条失败记录含 1 case, 实际 %+v", fails)
	}
}

func TestDefaultPath(t *testing.T) {
	_ = os.Getenv("APPDATA")
	if p := DefaultPath(); p == "" {
		t.Fatal("DefaultPath 不应为空")
	}
}
