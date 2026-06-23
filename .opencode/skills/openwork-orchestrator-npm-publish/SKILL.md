---
name: openwork-plus-orchestrator-npm-publish
description: |
  Publish the openwork-plus-orchestrator npm package with clean git hygiene.

  Triggers when user mentions:
  - "openwork-plus-orchestrator npm publish"
  - "publish openwork-plus-orchestrator"
  - "bump openwork-plus-orchestrator"
---

## Quick usage (already configured)

1. Ensure you are on the default branch and the tree is clean.
2. Bump versions via the shared release bump (this keeps `openwork-plus-orchestrator` aligned with the app/desktop release).

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
pnpm --filter openwork-plus-orchestrator build:sidecars
gh release create openwork-plus-orchestrator-vX.Y.Z packages/orchestrator/dist/sidecars/* \
  --repo comoxone/openwork-plus \
  --title "openwork-plus-orchestrator vX.Y.Z sidecars" \
  --notes "Sidecar binaries and manifest for openwork-plus-orchestrator vX.Y.Z"
```

5. Build openwork-plus-orchestrator binaries for all supported platforms.

```bash
pnpm --filter openwork-plus-orchestrator build:bin:all
```

6. Publish `openwork-plus-orchestrator` as a meta package + platform packages (optionalDependencies).

```bash
node packages/orchestrator/scripts/publish-npm.mjs
```

7. Verify the published version.

```bash
npm view openwork-plus-orchestrator version
```

---

## Scripted publish

```bash
./.opencode/skills/openwork-plus-orchestrator-npm-publish/scripts/publish-openwork-plus-orchestrator.sh
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

- `openwork-plus-orchestrator` is published as:
  - `openwork-plus-orchestrator` (wrapper + optionalDependencies)
  - `openwork-plus-orchestrator-darwin-arm64`, `openwork-plus-orchestrator-darwin-x64`, `openwork-plus-orchestrator-linux-arm64`, `openwork-plus-orchestrator-linux-x64`, `openwork-plus-orchestrator-windows-x64` (platform binaries)
- `openwork-plus-orchestrator` is versioned in lockstep with OpenWork app/desktop releases.
- openwork-plus-orchestrator downloads sidecars from `openwork-plus-orchestrator-vX.Y.Z` release assets by default.
