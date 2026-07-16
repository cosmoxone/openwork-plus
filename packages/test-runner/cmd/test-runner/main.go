// test-runner：跨平台测试执行 CLI，输出统一 JSON 供 AI / test-db-mcp 消费。
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/openwork/test-runner/internal/runner"
	"github.com/openwork/test-runner/internal/store"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(2)
	}
	ctx := context.Background()
	switch os.Args[1] {
	case "run":
		fs := flag.NewFlagSet("run", flag.ExitOnError)
		framework := fs.String("framework", "jest", "jest|pytest|junit")
		path := fs.String("path", ".", "测试目录")
		record := fs.String("record", "", "写入测试结果库路径（默认可设 OPENWORK_TEST_DB）")
		_ = fs.Parse(os.Args[2:])
		rec := *record
		if rec == "" {
			rec = store.DefaultPath()
		}
		res, err := runner.Run(ctx, *framework, *path, rec)
		emit(res, err)
	case "coverage":
		fs := flag.NewFlagSet("coverage", flag.ExitOnError)
		framework := fs.String("framework", "jest", "jest|pytest")
		path := fs.String("path", ".", "测试目录")
		_ = fs.Parse(os.Args[2:])
		res, err := runner.Coverage(ctx, *framework, *path)
		emit(res, err)
	case "list-failures":
		fs := flag.NewFlagSet("list-failures", flag.ExitOnError)
		since := fs.String("since", "24h", "时间窗口，如 24h、7d")
		dbPath := fs.String("db", "", "测试结果库路径")
		_ = fs.Parse(os.Args[2:])
		dur, err := parseSince(*since)
		if err != nil {
			fatal(err)
		}
		db, err := store.Open(*dbPath)
		if err != nil {
			fatal(err)
		}
		fails, err := db.ListFailures(dur)
		emit(map[string]any{"since": since, "db": db.Path(), "failures": fails}, err)
	case "compare":
		fs := flag.NewFlagSet("compare", flag.ExitOnError)
		base := fs.String("base", "main", "基准 git 引用")
		current := fs.String("current", "HEAD", "当前 git 引用")
		path := fs.String("path", ".", "仓库根目录")
		_ = fs.Parse(os.Args[2:])
		res, err := runner.Compare(ctx, *base, *current, *path)
		emit(res, err)
	case "version":
		fmt.Println("test-runner 0.1.0")
	default:
		printUsage()
		os.Exit(2)
	}
}

func printUsage() {
	fmt.Fprintf(os.Stderr, `test-runner 0.1.0 — 统一 JSON 测试执行 CLI

用法:
  test-runner run       --framework jest|pytest|junit --path <dir> [--record <db>]
  test-runner coverage  --framework jest|pytest --path <dir>
  test-runner list-failures --since 24h [--db <path>]
  test-runner compare   --base main --current HEAD [--path <repo>]
  test-runner version
`)
}

func emit(v any, err error) {
	if err != nil {
		fatal(err)
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		fatal(err)
	}
}

func fatal(err error) {
	_ = json.NewEncoder(os.Stderr).Encode(map[string]string{"error": err.Error()})
	os.Exit(1)
}

func parseSince(s string) (time.Duration, error) {
	s = strings.TrimSpace(strings.ToLower(s))
	if strings.HasSuffix(s, "h") {
		var n int
		_, err := fmt.Sscanf(s, "%dh", &n)
		if err != nil {
			return 0, err
		}
		return time.Duration(n) * time.Hour, nil
	}
	if strings.HasSuffix(s, "d") {
		var n int
		_, err := fmt.Sscanf(s, "%dd", &n)
		if err != nil {
			return 0, err
		}
		return time.Duration(n) * 24 * time.Hour, nil
	}
	return time.ParseDuration(s)
}
