# Contributing

## Setup

```bash
pnpm install
```

Node version is pinned in [`.node-version`](./.node-version); pnpm version in `packageManager`.

## Checks

Everything CI runs, you can run locally:

```bash
pnpm lint
pnpm format:check    # pnpm format to fix
pnpm build           # includes tsc --noEmit for every package
pnpm test:unit
pnpm test:e2e
pnpm test:devtools
```

## Releasing

Versioning and publishing are driven by [changesets](https://github.com/changesets/changesets). Nobody edits
`version` in `package.json` by hand and nobody runs `npm publish` locally.

### 1. Describe the change in your PR

```bash
pnpm changeset
```

Pick `webactor`, pick patch / minor / major, write one line for the changelog. Commit the generated
`.changeset/*.md` file together with your code.

A PR without a changeset is fine when nothing user-facing changed (docs, CI, tests, examples, devtools).

### 2. Merge to `main`

The release job in [CI](./.github/workflows/ci.yml) sees pending changesets and opens (or updates) a
**`chore(release): version packages`** PR. That PR contains the version bump, the consumed changeset files and
the generated `CHANGELOG.md`.

That job `needs` every test job, so nothing is ever versioned or published from a red `main`.

### 3. Merge the version PR

Merging it makes the same workflow run `pnpm release` — build, then `changeset publish`, which publishes
`webactor` to npm, creates the git tag and the GitHub Release.

`webactor-devtools` is `private` and is never published; changesets ignores it.

### npm authentication

Publishing uses npm [trusted publishing](https://docs.npmjs.com/trusted-publishers/) — OIDC, no token stored in
the repository. The workflow requests `id-token: write` and npm verifies the workflow identity, so releases get a
provenance attestation automatically.

One-time setup on npmjs.com → package `webactor` → Settings → Trusted publisher:

| Field           | Value                |
| --------------- | -------------------- |
| Publisher       | GitHub Actions       |
| Organization    | `AStaroverov`        |
| Repository      | `webactor`           |
| Workflow        | `ci.yml`             |
| Environment     | _(leave empty)_      |

Until that is configured the publish step fails with a 404 from the registry.
