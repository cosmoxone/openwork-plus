# Release checklist

OpenWork releases should be deterministic, easy to reproduce, and fully verifiable with CLI tooling.

## Preflight

- Sync the default branch (currently `dev`).
- Run `pnpm release:review` and fix any mismatches.
- If you are building sidecar assets, set `SOURCE_DATE_EPOCH` to the tag timestamp for deterministic manifests.

## App release (desktop)

1. Bump versions (app + desktop + Tauri + Cargo):
    - `pnpm bump:patch` or `pnpm bump:minor` or `pnpm bump:major`
2. Re-run `pnpm release:review`.
3. Build sidecars for the desktop bundle:
   - `pnpm --filter @openworkplus/desktop run prepare:sidecar`
4. Commit the version bump.
5. Tag and push:
   - `git tag vX.Y.Z`
   - `git push origin vX.Y.Z`

## openworkplus-orchestrator (npm + sidecars)

1. Bump versions (includes `packages/orchestrator/package.json`):
   - `pnpm bump:patch` or `pnpm bump:minor` or `pnpm bump:major`
2. Build sidecar assets and manifest:
   - `pnpm --filter openworkplus-orchestrator build:sidecars`
3. Create the GitHub release for sidecars:
   - `gh release create openworkplus-orchestrator-vX.Y.Z packages/orchestrator/dist/sidecars/* --repo comoxone/openwork-plus`
4. Publish the package:
   - `pnpm --filter openworkplus-orchestrator publish --access public`

## openworkplus-server + openworkplus-opencode-router (if version changed)

- `pnpm --filter openworkplus-server publish --access public`
- `pnpm --filter openworkplus-opencode-router publish --access public`

## Verification

- `openwork start --workspace /path/to/workspace --check --check-events`
- `gh run list --repo comoxone/openwork-plus --workflow "Release App" --limit 5`
- `gh release view vX.Y.Z --repo comoxone/openwork-plus`

Use `pnpm release:review --json` when automating these checks in scripts or agents.

## AUR

`Release App` publishes the Arch AUR package automatically after the Linux `.deb` asset is uploaded.

For local AMD64 Arch builds without Docker, see `packaging/aur/README.md`.

Required repo config:

- GitHub Actions secret: `AUR_SSH_PRIVATE_KEY` (SSH key with push access to the AUR package repo)
- Optional repo variable: `AUR_REPO` (defaults to `openwork`)

## npm publishing

If you want `Release App` to publish `openworkplus-orchestrator`, `openworkplus-server`, and `openworkplus-opencode-router` to npm, configure:

- GitHub Actions secret: `NPM_TOKEN` (npm automation token)

If `NPM_TOKEN` is not set, the npm publish job is skipped.
