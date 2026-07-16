package runner

import (
	"context"
	"os/exec"
	"strings"
)

// CompareResult 是 compare 命令输出。
type CompareResult struct {
	Base    string   `json:"base"`
	Current string   `json:"current"`
	Added   []string `json:"addedTestFiles"`
	Removed []string `json:"removedTestFiles"`
}

// Compare 比较两个 git 引用之间的测试文件差异。
func Compare(ctx context.Context, base, current, root string) (*CompareResult, error) {
	if base == "" {
		base = "main"
	}
	if current == "" {
		current = "HEAD"
	}
	if root == "" {
		root = "."
	}
	out := &CompareResult{Base: base, Current: current}
	baseFiles, _ := gitListTestFiles(ctx, root, base)
	curFiles, _ := gitListTestFiles(ctx, root, current)
	baseSet := map[string]bool{}
	for _, f := range baseFiles {
		baseSet[f] = true
	}
	curSet := map[string]bool{}
	for _, f := range curFiles {
		curSet[f] = true
	}
	for f := range curSet {
		if !baseSet[f] {
			out.Added = append(out.Added, f)
		}
	}
	for f := range baseSet {
		if !curSet[f] {
			out.Removed = append(out.Removed, f)
		}
	}
	return out, nil
}

func gitListTestFiles(ctx context.Context, root, ref string) ([]string, error) {
	cmd := exec.CommandContext(ctx, "git", "ls-tree", "-r", "--name-only", ref)
	cmd.Dir = root
	b, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var files []string
	for _, line := range strings.Split(string(b), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		lower := strings.ToLower(line)
		if strings.Contains(lower, "test") || strings.HasSuffix(lower, "_test.go") ||
			strings.HasSuffix(lower, ".spec.ts") || strings.HasSuffix(lower, ".spec.js") ||
			strings.HasSuffix(lower, ".test.ts") || strings.HasSuffix(lower, ".test.js") ||
			strings.HasSuffix(lower, "test_") && strings.HasSuffix(lower, ".py") {
			files = append(files, line)
		}
	}
	return files, nil
}
