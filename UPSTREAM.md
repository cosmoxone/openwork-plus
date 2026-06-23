# Upstream relationship

OpenWork Plus is an **independent enhanced distribution** built on top of [OpenWork](https://github.com/different-ai/openwork) (upstream). It is not a replacement for upstream OpenWork and is not affiliated with OpenWork Labs commercial offerings unless explicitly stated.

## Baseline

| Item | Value |
|------|-------|
| Upstream repository | `https://github.com/different-ai/openwork` |
| Fork baseline tag | `v0.11.212` / `v0.11.213` |
| Plus development branch | `feat/unified-platform` → `main` (open source release) |
| Engine | [OpenCode](https://opencode.ai) |

Plus keeps upstream's core runtime model:

- **OpenCode** is the agent engine.
- **OpenWork server / orchestrator** host local workspaces.
- **Tauri + SolidJS** desktop shell (unchanged stack).

## What Plus adds (not in upstream)

These capabilities are the reason Plus exists as a separate project:

| Area | Plus-only packages / surfaces |
|------|------------------------------|
| Industry bundles | `bundles/`, Bundle Hub, Settings › Bundles |
| GUI / RPA automation | `packages/gui-operate-mcp`, `packages/rpa-host` |
| Test automation | `packages/test-db-mcp`, `packages/test-runner`, test-automation bundle |
| Knowledge management | `packages/knowledge-wiki`, knowledge-mgmt bundle |
| Local sandbox bootstrap | `packages/sandbox-bootstrap` |
| Task scheduling | `packages/task-scheduler` |
| Host API / exec policy | `packages/host-api-adapter`, `packages/appserver-contract` |
| Metering | `packages/metering-store` |

See `docs/convergence-acceptance-status.md` for implementation status.

## What Plus does **not** ship (first open-source release)

The following were removed from the public tree because they use Fair Source License (FSL) or enterprise-only surfaces:

- `ee/` — Den cloud API, Den web app, landing, worker proxy
- Hosted OpenWork Cloud checkout / SSO flows tied to Den

Connect **remote** OpenWork-compatible servers by URL + token still works; only the proprietary cloud stack is excluded.

## Sync strategy

Plus intentionally **does not** track upstream release tags in order. We cherry-pick by product priority (see `docs/22-release-and-upstream-fusion-plan.md`).

| Wave | Plus target | Upstream reference | Focus |
|------|-------------|-------------------|-------|
| Shipped | v0.12.x CorePlus | — | Bundles, Hub, convergence smoke |
| Next | v0.14.0-auto | upstream v0.15.0 | UI Control Tools |
| Next | v0.14.1-stable | v0.13.4–v0.15.x | Session reliability patches |
| Later | v0.15.0-mobile | v0.15.0 | Session workflows, artifacts |
| Later | v0.16.0-browser | v0.13.4 + v0.13.12 | Browser automation (no Electron shell) |

**Do not** merge upstream wholesale. Prefer:

1. Read upstream PR / commit for a single capability.
2. Port tests and behavior into Plus packages.
3. Run `pnpm run test:convergence` before merging.

## Contributing back to upstream

Changes that are generally upstream-friendly:

- Bug fixes in `apps/server`, `apps/app` core session flows
- OpenCode plugin compatibility
- i18n, accessibility, documentation

Keep Plus-specific in this repository:

- Industry bundle schema and installer
- RPA / gui-operate / sandbox-bootstrap
- Bundle Hub catalog and CDN ops
- Internal fusion roadmaps under `docs/`

## Version numbering

| Stream | Example | Meaning |
|--------|---------|---------|
| Plus app | `0.12.0-plus.1` or `0.12.0` | Plus desktop + server release |
| Upstream reference | `0.11.213` | Last shared baseline in `package.json` |
| Bundle packages | `0.1.0` | Independent bundle semver |

Document the upstream commit hash in release notes when syncing.

## Side-by-side install with upstream OpenWork

Plus uses a **different application identity** so it can coexist with upstream OpenWork:

| | Upstream OpenWork | OpenWork Plus |
|--|-------------------|---------------|
| Bundle ID | `com.differentai.openwork` | `com.openwork.plus` |
| Product name | OpenWork | OpenWork Plus |
| Deep link (prod) | `openwork://` | `openwork-plus://` |
| Deep link (dev) | `openwork-dev://` | `openwork-plus-dev://` |

## Links

- Upstream: https://github.com/different-ai/openwork
- Plus site (planned): https://openwork.plus
- Plus releases: https://github.com/comoxone/openwork-plus/releases
- OpenCode: https://opencode.ai
