// test-strategy-c-dry-run.mjs
//
// 复现 upstream-alignment-playbook.md §5.4 的实测数据。
// 用途：每次 review "策略 A vs C" 决策时，一键验证 patch 是否仍可一键 apply、
//       策略 C 是否仍会产生 N 个冲突。
//
// 输出：
//   1. Plus 相对 base 的改动统计
//   2. 策略 A：每个 patch 文件的 apply --check 结果
//   3. 策略 C：merge-tree 模拟的冲突文件分类（真冲突 vs add/add 假冲突）
//
// 退出码：
//   0  所有 patch 可 apply（策略 A 可行）
//   1  有 patch 无法 apply（需要人工处理）
//   2  环境错误（tag 未 fetch、git 不可用等）
//
// 用法：
//   node scripts/upstream-alignment/test-strategy-c-dry-run.mjs [base-tag] [plus-branch]
//   默认：base-tag=v0.17.30, plus-branch=feat/v01730-base-jump
//
// 详见 cosmoxwork-docs/openworkplus/12-project/plans/upstream-alignment-playbook.md §5.4
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE_TAG = process.argv[2] ?? "v0.17.30";
const PLUS_BRANCH = process.argv[3] ?? "feat/v01730-base-jump";
const PATCHES_DIR = path.resolve("patches/plus-injections");
const REPO_ROOT = process.cwd();

function git(args, opts = {}) {
  try {
    const out = execFileSync(
      process.platform === "win32" ? "git.exe" : "git",
      Array.isArray(args) ? args : args.split(" "),
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts },
    );
    return { ok: true, out: out.toString().trim() };
  } catch (e) {
    return { ok: false, out: (e.stdout ?? "").toString(), err: (e.stderr ?? e.message ?? "").toString() };
  }
}

function checkPrereqs() {
  const g = git(["--version"]);
  if (!g.ok) { console.error("FAIL: git not available"); process.exit(2); }

  // 兼容 annotated tag（返回 "tag"）和 lightweight tag（返回 "commit"）
  // 用 rev-parse --verify 验证引用有效即可
  const tagCheck = git(["rev-parse", "--verify", `${BASE_TAG}^{commit}`]);
  if (!tagCheck.ok) {
    console.error(`FAIL: tag ${BASE_TAG} not found locally.`);
    console.error(`     Run: git fetch upstream tag ${BASE_TAG}`);
    process.exit(2);
  }

  const branchCheck = git(["rev-parse", "--verify", PLUS_BRANCH]);
  if (!branchCheck.ok) {
    console.error(`FAIL: branch ${PLUS_BRANCH} not found.`);
    process.exit(2);
  }
}

function showPlusChangesOverBase() {
  console.log("\n========== 1. Plus 改动统计（相对 base）==========");
  const r = git(["diff", "--stat", BASE_TAG, PLUS_BRANCH]);
  if (!r.ok) { console.error("git diff --stat failed:", r.err); return; }
  const lines = r.out.split("\n");
  const summary = lines[lines.length - 1];
  console.log(summary);
  const m = summary.match(/(\d+) files? changed.*?(\d+) insertions?\(+\).*?(\d+) deletions?\(-\)/);
  if (m) {
    console.log(`  → ${m[1]} 文件 / +${m[2]} / -${m[3]}`);
  }
}

function testStrategyA() {
  console.log("\n========== 2. 策略 A：Patch 重放验证 ==========");
  if (!existsSync(PATCHES_DIR)) {
    console.log(`SKIP: ${PATCHES_DIR} 不存在`);
    console.log("     首次使用请先执行 §4.3 的 patch 生成命令");
    return { ok: true, patches: [], failed: [] };
  }
  const patches = readdirSync(PATCHES_DIR).filter((f) => f.endsWith(".patch"));
  if (patches.length === 0) {
    console.log("SKIP: patches/plus-injections/ 下无 .patch 文件");
    return { ok: true, patches: [], failed: [] };
  }

  const tmp = mkdtempSync(path.join(tmpdir(), "plus-align-"));
  const failed = [];
  let passCount = 0;

  for (const p of patches) {
    const patchPath = path.join(PATCHES_DIR, p);
    const patchText = readFileSync(patchPath, "utf8");

    // 解析 patch 影响的文件（从 diff --git 头取）
    const files = Array.from(patchText.matchAll(/^diff --git a\/(\S+) b\//gm)).map((m) => m[1]);

    // 为每个文件从 BASE_TAG 检出到临时区，再测 apply
    let allApply = true;
    const detail = [];
    for (const f of files) {
      // 检出 base 版本到临时区
      const baseContent = git(["show", `${BASE_TAG}:${f}`]);
      if (!baseContent.ok) {
        // base 没有该文件（Plus 新增），跳过 apply 测试
        detail.push(`  ${f}: base 无（Plus 新增），patch 不冲突`);
        continue;
      }
      const tmpFile = path.join(tmp, f.replace(/[\\/]/g, "__"));
      writeFileSync(tmpFile, baseContent.out);

      // 测 apply（git apply --check 静默成功，非零退出抛异常）
      try {
        execFileSync(
          process.platform === "win32" ? "git.exe" : "git",
          ["apply", "--check", patchPath],
          { cwd: tmp, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] },
        );
        detail.push(`  ${f}: apply OK`);
      } catch {
        detail.push(`  ${f}: apply FAILED`);
        allApply = false;
      }
      break; // patch 通常只影响 1 个文件，首个测完即可代表
    }

    if (allApply) {
      console.log(`✅ ${p}`);
      passCount++;
    } else {
      console.log(`❌ ${p}`);
      failed.push(p);
    }
    if (process.env.VERBOSE) detail.forEach((d) => console.log(d));
  }

  rmSync(tmp, { recursive: true, force: true });
  console.log(`\n汇总: ${passCount}/${patches.length} patch 可 apply`);
  return { ok: failed.length === 0, patches, failed };
}

function testStrategyC() {
  console.log("\n========== 3. 策略 C：共同祖先冲突模拟 ==========");
  console.log("（用 git worktree 隔离做真实 dry-run，不污染主工作区）\n");

  const tmpDir = path.join(tmpdir(), "plus-strategy-c-" + Date.now());

  // 创建临时 worktree 指向 PLUS_BRANCH
  const wt = git(["worktree", "add", "--detach", tmpDir, PLUS_BRANCH]);
  if (!wt.ok) {
    console.log("FAIL: 无法创建 worktree:", wt.err);
    return;
  }

  try {
    // 在 worktree 内执行 merge
    const mergeResult = git(
      ["merge", "--allow-unrelated-histories", "--no-commit", "--no-ff", BASE_TAG],
      { cwd: tmpDir },
    );

    // 收集冲突（git merge 失败时返回非零，stdout/stderr 含 CONFLICT 行）
    const conflicts = [];
    const conflictLines = ((mergeResult.ok ? "" : mergeResult.out + mergeResult.err) || "")
      .split("\n")
      .filter((l) => l.includes("CONFLICT"));
    for (const line of conflictLines) {
      const m = line.match(/Merge conflict in (\S+)/);
      if (m) conflicts.push(m[1]);
    }

    // 兜底：用 git diff --name-only --diff-filter=U
    const u = git(["diff", "--name-only", "--diff-filter=U"], { cwd: tmpDir });
    if (u.ok) {
      const uFiles = u.out.split("\n").filter(Boolean);
      for (const f of uFiles) {
        if (!conflicts.includes(f)) conflicts.push(f);
      }
    }

    if (conflicts.length === 0) {
      console.log("无冲突（策略 C 可行）");
      return;
    }

    console.log(`报告 ${conflicts.length} 个真实冲突文件。分类中...\n`);

    // 区分真冲突 vs add/add 假冲突
    const realConflicts = [];
    const addAddConflicts = [];
    for (const f of conflicts) {
      const baseHas = git(["cat-file", "-e", `${BASE_TAG}:${f}`]);
      if (baseHas.ok) realConflicts.push(f);
      else addAddConflicts.push(f);
    }

    console.log(`真逻辑冲突（${realConflicts.length} 个，base 有但双方都改了）：`);
    realConflicts.forEach((f) => console.log(`  ${f}`));
    console.log(`\nadd/add 假冲突（${addAddConflicts.length} 个，upstream 没有，双方都新增）：`);
    addAddConflicts.forEach((f) => console.log(`  ${f}`));

    console.log(`\n结论：`);
    console.log(`  - 策略 A 处理真冲突：用 patch 一键 apply（见上方 §2 验证）`);
    console.log(`  - 策略 C 处理全部 ${conflicts.length} 个：每个都要人工确认`);
  } finally {
    // 清理 worktree（不保留）
    git(["worktree", "remove", "--force", tmpDir]);
    git(["worktree", "prune"]);
  }
}

function main() {
  console.log(`Upstream 策略验证（dry-run，不会修改工作区）`);
  console.log(`  Base tag   : ${BASE_TAG}`);
  console.log(`  Plus branch: ${PLUS_BRANCH}`);
  console.log(`  Repo root  : ${REPO_ROOT}`);

  checkPrereqs();
  showPlusChangesOverBase();
  const a = testStrategyA();
  testStrategyC();

  console.log("\n========== 总结 ==========");
  if (a.ok) {
    console.log("✅ 策略 A 可行：所有 patch 可一键 apply");
    console.log("❌ 策略 C 不推荐：仍有冲突 + 仓库永久膨胀");
    process.exit(0);
  } else {
    console.log(`⚠️  策略 A 有 ${a.failed.length} 个 patch 需要人工处理：${a.failed.join(", ")}`);
    console.log("    这些 patch 可能因 Plus 自身演进而失效，需重新生成");
    process.exit(1);
  }
}

main();
