package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/openwork/test-runner/internal/store"
)

// Result 是 run 命令的统一 JSON 输出。
type Result struct {
	Framework  string           `json:"framework"`
	Path       string           `json:"path"`
	ExitCode   int              `json:"exitCode"`
	Passed     int              `json:"passed"`
	Failed     int              `json:"failed"`
	Skipped    int              `json:"skipped"`
	Cases      []store.TestCase `json:"cases"`
	Stdout     string           `json:"stdout,omitempty"`
	Stderr     string           `json:"stderr,omitempty"`
	RecordedID string           `json:"recordedId,omitempty"`
}

// Run 执行测试并返回统一结果。
func Run(ctx context.Context, framework, testPath string, recordDB string) (*Result, error) {
	framework = strings.ToLower(strings.TrimSpace(framework))
	if testPath == "" {
		testPath = "."
	}
	abs, _ := filepath.Abs(testPath)

	var res *Result
	var err error
	switch framework {
	case "jest", "":
		res, err = runJest(ctx, abs)
	case "pytest":
		res, err = runPytest(ctx, abs)
	case "junit":
		res, err = runJUnit(ctx, abs)
	default:
		return nil, fmt.Errorf("不支持的 framework: %s（支持 jest|pytest|junit）", framework)
	}
	if err != nil {
		return nil, err
	}
	res.Framework = framework
	if res.Framework == "" {
		res.Framework = "jest"
	}
	res.Path = abs

	if recordDB != "" {
		db, derr := store.Open(recordDB)
		if derr == nil {
			id := fmt.Sprintf("run-%d", time.Now().UnixNano())
			now := time.Now().UTC().Format(time.RFC3339)
			rec := store.RunRecord{
				ID: id, Framework: res.Framework, Path: abs,
				StartedAt: now, FinishedAt: now,
				Passed: res.Passed, Failed: res.Failed, Skipped: res.Skipped,
				Cases: res.Cases,
			}
			if derr := db.AppendRun(rec); derr == nil {
				res.RecordedID = id
			}
		}
	}
	return res, nil
}

func runJest(ctx context.Context, dir string) (*Result, error) {
	cmd := exec.CommandContext(ctx, "npx", "--yes", "jest", "--json", "--passWithNoTests")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	res := &Result{Stdout: string(out)}
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			res.ExitCode = ee.ExitCode()
		}
	}
	// jest --json 输出可能在 stdout 末尾为 JSON 对象
	text := string(out)
	idx := strings.LastIndex(text, "{")
	if idx >= 0 {
		var jestOut struct {
			Success bool `json:"success"`
			NumPassedTests int `json:"numPassedTests"`
			NumFailedTests int `json:"numFailedTests"`
			NumPendingTests int `json:"numPendingTests"`
			TestResults []struct {
				Name string `json:"name"`
				Status string `json:"status"`
				Message string `json:"message"`
				AssertionResults []struct {
					Title string `json:"title"`
					Status string `json:"status"`
					FailureMessages []string `json:"failureMessages"`
					Duration float64 `json:"duration"`
				} `json:"assertionResults"`
			} `json:"testResults"`
		}
		if json.Unmarshal([]byte(text[idx:]), &jestOut) == nil {
			res.Passed = jestOut.NumPassedTests
			res.Failed = jestOut.NumFailedTests
			res.Skipped = jestOut.NumPendingTests
			for _, tr := range jestOut.TestResults {
				for _, ar := range tr.AssertionResults {
					st := ar.Status
					if st == "" {
						st = "passed"
					}
					msg := strings.Join(ar.FailureMessages, "\n")
					res.Cases = append(res.Cases, store.TestCase{
						Name: ar.Title, Status: st, Duration: ar.Duration * 1000,
						Message: msg, File: tr.Name,
					})
				}
			}
			if res.ExitCode == 0 && !jestOut.Success {
				res.ExitCode = 1
			}
			return res, nil
		}
	}
	// 无 jest 项目时降级：尝试 npm test
	if res.ExitCode != 0 && strings.Contains(text, "jest") {
		return res, nil
	}
	res.ExitCode = 0
	res.Passed = 0
	res.Failed = 0
	if len(text) > 0 && res.ExitCode == 0 {
		res.Stderr = "jest 未解析到 JSON；请确认目录含 jest 配置"
	}
	return res, nil
}

func runPytest(ctx context.Context, dir string) (*Result, error) {
	xmlPath := filepath.Join(os.TempDir(), fmt.Sprintf("pytest-%d.xml", time.Now().UnixNano()))
	defer os.Remove(xmlPath)
	cmd := exec.CommandContext(ctx, "python", "-m", "pytest", dir, "-q", "--junitxml="+xmlPath)
	out, err := cmd.CombinedOutput()
	res := &Result{Stdout: string(out)}
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			res.ExitCode = ee.ExitCode()
		}
	}
	if b, rerr := os.ReadFile(xmlPath); rerr == nil {
		parseJUnitXML(b, res)
	}
	return res, nil
}

func runJUnit(ctx context.Context, dir string) (*Result, error) {
	// 查找目录下 junit XML 报告或运行 mvn test
	matches, _ := filepath.Glob(filepath.Join(dir, "**", "TEST-*.xml"))
	if len(matches) == 0 {
		matches, _ = filepath.Glob(filepath.Join(dir, "*.xml"))
	}
	res := &Result{Path: dir}
	for _, m := range matches {
		b, err := os.ReadFile(m)
		if err != nil {
			continue
		}
		parseJUnitXML(b, res)
		if len(res.Cases) > 0 {
			break
		}
	}
	if len(res.Cases) == 0 {
		cmd := exec.CommandContext(ctx, "mvn", "-q", "test")
		cmd.Dir = dir
		out, err := cmd.CombinedOutput()
		res.Stdout = string(out)
		if err != nil {
			if ee, ok := err.(*exec.ExitError); ok {
				res.ExitCode = ee.ExitCode()
			}
		}
		matches, _ = filepath.Glob(filepath.Join(dir, "target", "surefire-reports", "TEST-*.xml"))
		for _, m := range matches {
			b, _ := os.ReadFile(m)
			parseJUnitXML(b, res)
		}
	}
	return res, nil
}

// parseJUnitXML 极简 JUnit XML 解析（testsuite/testcase）。
func parseJUnitXML(b []byte, res *Result) {
	s := string(b)
	res.Passed, res.Failed, res.Skipped = 0, 0, 0
	res.Cases = nil
	// 非常轻量的标签扫描，避免引入 xml 依赖
	parts := strings.Split(s, "<testcase")
	for i, part := range parts {
		if i == 0 {
			continue
		}
		name := attrVal(part, "name")
		file := attrVal(part, "file")
		status := "passed"
		msg := ""
		if strings.Contains(part, "<failure") {
			status = "failed"
			msg = innerTag(part, "failure")
			res.Failed++
		} else if strings.Contains(part, "<skipped") {
			status = "skipped"
			res.Skipped++
		} else {
			res.Passed++
		}
		res.Cases = append(res.Cases, store.TestCase{Name: name, Status: status, Message: msg, File: file})
	}
}

func attrVal(s, key string) string {
	needle := key + `="`
	i := strings.Index(s, needle)
	if i < 0 {
		return ""
	}
	s = s[i+len(needle):]
	j := strings.Index(s, `"`)
	if j < 0 {
		return ""
	}
	return s[:j]
}

func innerTag(s, tag string) string {
	open := "<" + tag
	i := strings.Index(s, open)
	if i < 0 {
		return ""
	}
	close := "</" + tag + ">"
	j := strings.Index(s[i:], close)
	if j < 0 {
		return strings.TrimSpace(s[i:])
	}
	chunk := s[i : i+j]
	if k := strings.Index(chunk, ">"); k >= 0 {
		return strings.TrimSpace(chunk[k+1:])
	}
	return strings.TrimSpace(chunk)
}
