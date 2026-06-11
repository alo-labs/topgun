# CI/CD

This repository has a narrow automation surface today:

- `npm test` runs the Node test suite in `tests/*.test.cjs`
- `npm run test:update` runs the TopGun update-flow shell coverage in `bin/test-topgun-update.sh`
- `.github/workflows/pages.yml` deploys the static `site/` directory to GitHub Pages when `main` receives a push that changes files under `site/**`

There is no general-purpose CI workflow in this repository yet for every push or pull request. Release readiness is currently enforced by the documented local verification flow and the pre-release quality gate in [docs/pre-release-quality-gate.md](pre-release-quality-gate.md).

## Local Verification

Run the full repository verification before cutting a release:

```bash
npm test
npm run test:update
```

`npm run test:all` is a convenience wrapper that runs both commands in sequence.

## GitHub Pages Deployment

The Pages workflow lives at `.github/workflows/pages.yml` and has these triggers:

- automatic deploy on pushes to `main` when the change set includes `site/**`
- manual deploy via `workflow_dispatch`

Deployment steps:

1. Check out the repository
2. Configure GitHub Pages
3. Upload the `site/` directory as the Pages artifact
4. Deploy that artifact with `actions/deploy-pages@v4`

The workflow uses the standard Pages permissions:

- `contents: read`
- `pages: write`
- `id-token: write`

Concurrency is pinned to a single `pages` group, with `cancel-in-progress: false`, so overlapping site publishes queue instead of replacing one another.

## Release Flow

TopGun versions are published with Git tags. The current documented release path is:

1. Complete the local verification commands above
2. Complete the pre-release quality gate
3. Update release-facing metadata such as `package.json`, plugin manifests, marketplace manifests, and `docs/CHANGELOG.md` as needed
4. Create and push the version tag

Example:

```bash
git tag -a v0.7.8 -m "TopGun v0.7.8"
git push origin v0.7.8
```

## Operational Notes

- Keep `site/` deployable as a static artifact; the Pages workflow uploads that directory directly.
- Treat `docs/CICD.md`, [docs/TESTING.md](TESTING.md), and [docs/ARCHITECTURE.md](ARCHITECTURE.md) as the canonical repo docs for delivery and verification behavior.
- If a general CI workflow is added later, document its triggers, required checks, and release-blocking behavior here instead of leaving that implicit in workflow YAML.
