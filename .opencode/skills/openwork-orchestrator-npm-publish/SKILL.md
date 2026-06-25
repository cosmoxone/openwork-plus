---
name: openworkplus-orchestrator-npm-publish
description: |
  Publish the openworkplus-orchestrator npm package with clean git hygiene.

  Triggers when user mentions:
  - "openworkplus-orchestrator npm publish"
  - "publish openworkplus-orchestrator"
  - "bump openworkplus-orchestrator"
---

## Quick usage (already configured)

1. Ensure you are on the default branch and the tree is clean.
2. Bump versions via the shared release bump (this keeps `openworkplus-orchestrator` aligned with the app/desktop release).

```bash
pnpm bump:patch
# or: pnpm bump:minor
# or: pnpm bump:major
# or: pnpm bump:set -- X.Y.Z
```

3. Commit the bump.
4. Preferred: publish via the "Release App" GitHub Actions workflow by tagging `vX.Y.Z`.

Manual recovery path (sidecars + npm) below.

```bash
pnpm --filter openworkplus-orchestrator build:sidecars
gh release create openworkplus-orchestrator-vX.Y.Z packages/orchestrator/dist/sidecars/* \
  --repo comoxone/openwork-plus \
  --title "openworkplus-orchestrator vX.Y.Z sidecars" \
  --notes "Sidecar binaries and manifest for openworkplus-orchestrator vX.Y.Z"
```

5. Build openworkplus-orchestrator binaries for all supported platforms.

```bash
pnpm --filter openworkplus-orchestrator build:bin:all
```

6. Publish `openworkplus-orchestrator` as a meta package + platform packages (optionalDependencies).

```bash
node packages/orchestrator/scripts/publish-npm.mjs
```

7. Verify the published version.

```bash
npm view openworkplus-orchestrator version
```

---

## Scripted publish

```bash
./.opencode/skills/openworkplus-orchestrator-npm-publish/scripts/publish-openworkplus-orchestrator.sh
```

---

## First-time setup (if not configured)

Authenticate with npm before publishing.

```bash
npm login
```

Alternatively, export an npm token in your environment (see `.env.example`).

---

## Notes

- `openworkplus-orchestrator` is published as:
  - `openworkplus-orchestrator` (wrapper + optionalDependencies)
  - `openworkplus-orchestrator-darwin-arm64`, `openworkplus-orchestrator-darwin-x64`, `openworkplus-orchestrator-linux-arm64`, `openworkplus-orchestrator-linux-x64`, `openworkplus-orchestrator-windows-x64` (platform binaries)
- `openworkplus-orchestrator` is versioned in lockstep with OpenWork app/desktop releases.
- openworkplus-orchestrator downloads sidecars from `openworkplus-orchestrator-vX.Y.Z` release assets by default.
