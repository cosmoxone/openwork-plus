package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/openwork/test-runner/internal/store"
)

// CoverageResult 是 coverage 命令输出。
type CoverageResult struct {
	Framework string          `json:"framework"`
	Path      string          `json:"path"`
	Coverage  store.Coverage  `json:"coverage"`
	Stdout    string          `json:"stdout,omitempty"`
	Stderr    string          `json:"stderr,omitempty"`
}

// Coverage 采集覆盖率（jest/pytest）。
func Coverage(ctx context.Context, framework, testPath string) (*CoverageResult, error) {
	framework = strings.ToLower(strings.TrimSpace(framework))
	if framework == "" {
		framework = "jest"
	}
	abs, _ := filepath.Abs(testPath)
	out := &CoverageResult{Framework: framework, Path: abs}

	switch framework {
	case "jest":
		cmd := exec.CommandContext(ctx, "npx", "--yes", "jest", "--coverage", "--coverageReporters=json-summary", "--passWithNoTests")
		cmd.Dir = abs
		combined, err := cmd.CombinedOutput()
		out.Stdout = string(combined)
		summary := filepath.Join(abs, "coverage", "coverage-summary.json")
		if b, rerr := readFile(summary); rerr == nil {
			var raw map[string]any
			if json.Unmarshal(b, &raw) == nil {
				out.Coverage.Raw = raw
				if total, ok := raw["total"].(map[string]any); ok {
					if lines, ok := total["lines"].(map[string]any); ok {
						if pct, ok := lines["pct"].(float64); ok {
							out.Coverage.Lines = pct
						}
					}
				}
			}
		}
		if err != nil {
			out.Stderr = err.Error()
		}
	case "pytest":
		cmd := exec.CommandContext(ctx, "python", "-m", "pytest", abs, "--cov", abs, "--cov-report=json")
		combined, err := cmd.CombinedOutput()
		out.Stdout = string(combined)
		covFile := filepath.Join(abs, "coverage.json")
		if b, rerr := readFile(covFile); rerr == nil {
			var raw map[string]any
			if json.Unmarshal(b, &raw) == nil {
				out.Coverage.Raw = raw
				if totals, ok := raw["totals"].(map[string]any); ok {
					if pct, ok := totals["percent_covered"].(float64); ok {
						out.Coverage.Lines = pct
					}
				}
			}
		}
		if err != nil {
			out.Stderr = err.Error()
		}
	default:
		return nil, fmt.Errorf("coverage 暂不支持 framework: %s", framework)
	}
	return out, nil
}

func readFile(p string) ([]byte, error) {
	return os.ReadFile(p)
}
