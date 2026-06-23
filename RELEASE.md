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
   - `pnpm --filter @openwork-plus/desktop run prepare:sidecar`
4. Commit the version bump.
5. Tag and push:
   - `git tag vX.Y.Z`
   - `git push origin vX.Y.Z`

## openwork-plus-orchestrator (npm + sidecars)

1. Bump versions (includes `packages/orchestrator/package.json`):
   - `pnpm bump:patch` or `pnpm bump:minor` or `pnpm bump:major`
2. Build sidecar assets and manifest:
   - `pnpm --filter openwork-plus-orchestrator build:sidecars`
3. Create the GitHub release for sidecars:
   - `gh release create openwork-plus-orchestrator-vX.Y.Z packages/orchestrator/dist/sidecars/* --repo comoxone/openwork-plus`
4. Publish the package:
   - `pnpm --filter openwork-plus-orchestrator publish --access public`

## openwork-plus-server + openwork-plus-opencode-router (if version changed)

- `pnpm --filter openwork-plus-server publish --access public`
- `pnpm --filter openwork-plus-opencode-router publish --access public`

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

If you want `Release App` to publish `openwork-plus-orchestrator`, `openwork-plus-server`, and `openwork-plus-opencode-router` to npm, configure:

- GitHub Actions secret: `NPM_TOKEN` (npm automation token)

If `NPM_TOKEN` is not set, the npm publish job is skipped.
