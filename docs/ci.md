# Continuous integration

CI runs on GitHub-hosted `ubuntu-24.04` runners until Depot CI minutes reset; see [Switching back to Depot](#switching-back-to-depot). `main` is intentionally unprotected; missing branch protection is not a failure.

## What runs

[The workflow](../.github/workflows/ci.yml) runs on PRs that target `main` or a `feat/**` integration branch and carry the `run-ci` label, and on manual dispatch. Merging to `main` starts no run. New PR updates cancel superseded runs. CI never deploys or touches a remote database.

Without the label every job reports skipped. Add `run-ci` once hosted review of the current head has no actionable findings; CI then runs on every later push. Before pushing another round of review fixes, remove the label and add it again after that round's review is clean. Adding any other label skips every job and cannot cancel a running check.

A PR's run tests its merge with `main` as of that run. When an exact `main` commit needs CI evidence, run `gh workflow run ci.yml --ref main`, which validates everything. To rerun a PR against a newer `main`, remove and re-add `run-ci`; a job rerun reuses the old merge ref.

| Job                        | Scope                                                                                                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Select checks              | Classifies the full PR diff, including deletions and renames, with `scripts/ci/changes.mjs`. Manual runs validate everything.                                                                                                                 |
| Repository and application | Checks changed Markdown formatting with `--ignore-path /dev/null`, local links and anchors across all tracked Markdown, and whitespace. For executable changes: format check, lint, governance, Svelte and types, full Vitest and the build. |
| Database contracts         | Runs when Supabase, CI tooling, package manifests or the Node version change. Fresh disposable migration replay, all SQL contracts, populated-upgrade regressions and provider probes.                                                        |

Only Markdown under `docs/` and the root `README.md`, `AGENTS.md`, `CLAUDE.md` and `CONTEXT.md` skip application validation. Unknown paths run it. GitHub runners are about 2.5 times slower than Depot's, so keep timeouts generous rather than retrying.

`scripts/ci/database.py` creates a uniquely named disposable project outside the checkout with seeds disabled and unused ports, and removes exactly that project afterwards. It never reuses a local project or reads production credentials. It suppresses `supabase start` output because it can contain credentials, so a failed start shows only "Command failed". It keeps the `SUPABASE_INTERNAL_IMAGE_REGISTRY` (GHCR) that the setup-cli action sets, because ECR Public rate-limits GitHub runners.

## Vercel

Vercel deploys only `main` (`git.deploymentEnabled` in [vercel.json](../vercel.json)); PR branches get no automatic preview. Create a preview only when Robert asks for one. From a checkout where `vercel whoami` succeeds, this deploys the pushed head of the current branch:

```bash
printf '{"name":"trooptotask","gitSource":{"type":"github","repoId":1152387919,"ref":"%s"}}' "$(git branch --show-current)" | vercel api /v13/deployments -X POST --input -
```

The `ignoreCommand` in `vercel.json` is also the project's hosted **Ignored Build Step**; keep the two identical. It skips a build only when every path changed since the last successful deployment is root prose Markdown, Markdown under `docs/` or `.agents/`, a `src/**/*.test.ts` file or a `scripts/**/*.test.*` file. [The fixture tests](../scripts/vercel-ignore-build.test.ts) execute the configured command.

## Switching back to Depot

Depot registers its triggers from `.depot/workflows/ci.yml` on the default branch, and the Depot Code Access connection must be active. When Depot minutes reset, move (do not copy) the workflow back to `.depot/workflows/ci.yml` and set all three jobs to `runs-on: depot-ubuntu-24.04`, so the two services never validate the same PR. Before merging, run the exact candidate with `depot ci run --workflow .depot/workflows/ci.yml` and record the run URL and job results; after merging, confirm the automatic trigger.
