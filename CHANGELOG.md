# Changelog

All notable changes to OpenWork Plus are documented here.
This project follows [Keep a Changelog](https://keepachangelog.com/) and uses [Semantic Versioning](https://semver.org/).

## [Unreleased] — v0.17.30-plus.0 (base jump, re-based)

The `v0.17.30-plus.0` release is a **base jump**: Plus moves from the legacy v0.11.213 base (Tauri + SolidJS, on `feat/unified-platform`) to upstream v0.17.30 (Electron 35 + React 19) as a new foundation. Plus-only capabilities are re-injected as independent packages on top of the new base.

**2026-07-16 re-base:** Originally jumped to `v0.17.2` (commit `30f0fe1`, 2026-06-23). Re-based to `v0.17.30` (commit `a179554`, 2026-07-15) because v0.17.2 was the 2nd patch of the series and already 294 commits / 17 days behind v0.17.20. The re-base brings 432 upstream commits (MCP OAuth hardening, Telegram/MS365/Codex/ChatGPT connect, enterprise branding, native notifications, email sign-in, XLSX attachments, OpenCode SDK in dev mode) at near-zero Plus-side cost because Plus injection points (cli.ts, desktop-cloud-sync.ts) froze after v0.17.20.

### Base jump

- **New base:** upstream OpenWork `v0.17.30` (commit `a179554`, 2026-07-15), imported as an orphan branch `feat/v01730-base-jump` (no upstream git history, snapshot only).
- **Previous base:** `v0.17.2` (commit `30f0fe1`, 2026-06-23) — superseded.
- **Desktop shell:** Electron 35 + React 19 (follows upstream v0.17.30). The legacy Tauri + SolidJS shell is preserved on `feat/unified-platform` only.
- **Engine:** OpenCode v1.17.3.
- **Branding:** application identity changed to `com.openwork.plus` (side-by-side install with upstream OpenWork), deep link `openwork-plus://`, releases at `cosmoxone/openwork-plus`.

### Wave 2 — Bundle system (three-track)

- Ported the Plus Bundle engine (11 self-contained `.mjs` modules, zero npm deps) into `apps/orchestrator/src/bundle/`.
- Ported example bundles: `computer-use`, `knowledge-mgmt`, `test-automation`.
- Integrated `ow bundle` subcommand into orchestrator CLI (`apps/orchestrator/src/cli.ts`).
- Bundle config storage kept as JSON (compatible with v0.17.30's SQLite TEXT column — no migration needed).

### Wave 3 — Plus-only packages port

All 11 packages ported with smoke tests passing (11/11):

| Package | Purpose | Smoke |
|---|---|---|
| `sqlite-vec-mcp` | Vector search MCP | PASS |
| `test-db-mcp` | Test automation MCP | PASS |
| `test-runner` | Go sidecar source (binaries in bundle) | n/a (Go) |
| `knowledge-wiki` | LLM Wiki corpus/ingest | PASS (K0–K4) |
| `task-scheduler` | SQLite cron scheduler | PASS (incl. P3-3 WSL integration) |
| `rpa-host` | RPA control panel Host API | PASS |
| `sandbox-bootstrap` | WSL2/Lima sandbox init | PASS (WSL mode) |
| `appserver-contract` | JSON-RPC 2.0 contract | PASS |
| `appserver-stub` | Contract test stub | PASS (P0-ARC-1) |
| `host-api-adapter` | Exec policy hub | PASS (4 smoke suites) |
| `metering-store` | Metering persistence | PASS |
| `gui-operate-mcp` | OS-level RPA (17 tools) | PASS (tools/list 17 tools) |

### Wave 4 — Upstream features activated

- **4.1 computer-use dual providers** (corrected from "replace"): `openwork-ui-mcp` (app-level UI control, 4 tools) + `gui-operate-mcp` (OS-level RPA, 17 tools) coexist as complementary providers.
- 4.2 runtime DB — verified compatible with Bundle JSON storage (Wave 2.3).
- 4.3 `desktop-cloud-sync.ts` — code retained, Plus does not connect to official Den by default.
- 4.4–4.9 — Session groups, Artifact panel, Anthropic adaptive thinking, Claude plugin compat, Extension Manifest foundation, HandsFree, Google Workspace, OpenAI Image Gen — all present in base jump (upstream features, no porting needed).

### Wave 5 — CloudAgent integration (designed, execution pending)

- Den cloud worker layer to be replaced by [CloudAgent](https://github.com/cosmoxone/cloudagent) (independent Apache-2.0 project).
- Plus consumes CloudAgent XC-2 via `@cloudagent/sdk` (no Den compatibility routes in CloudAgent).
- C-class capabilities (LLM provider / marketplace / skills / desktop policies) assigned to cosmoxwork platform (XC-COSMOX contract).
- Den identity layer code retained, decoupled from cloud worker layer.
- See `cosmoxwork-docs/cosmoxwork/03-requirements/cloudagent-integration-design.md` for full alignment spec.

### Wave 6 — Tests / docs / release

- Plus package smoke tests: 11/11 PASS (re-verified on v0.17.30 base, 2026-07-16).
- UPSTREAM.md, CHANGELOG.md, doc 33 updated for v0.17.30 re-base.
- Bundle e2e + installer production pending full desktop/CI environment.

---

## Legacy — v0.12.x CorePlus (pre-jump, on `feat/unified-platform`)

Pre-base-jump releases on the Tauri + SolidJS shell. Tagged `v0.11.213-legacy`. See `CHANGELOG/release-tracker-*.md` for historical release tracking.
