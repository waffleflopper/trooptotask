# Continuous integration

Depot CI owns validation for this private, single-contributor repository. GitHub remains the source and PR host. Robert reviews the final candidate's checks before merging; `main` intentionally remains unprotected on the current GitHub plan. Missing paid rulesets or branch protection is not a failure or an unfinished project requirement.

## What runs

[The workflow](../.depot/workflows/ci.yml) runs on PRs targeting `main`, pushes to `main`, and manual dispatch. Feature-branch pushes without a PR do not start duplicate runs. New PR updates cancel superseded runs; main/manual runs are retained. No deployment or remote database operation is part of CI.

| Job                        | Scope                                                                                                                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Select checks              | Uses the full PR diff or push's before/after diff, including deletions and renames. Manual/local CLI runs validate everything. Missing comparison history fails explicitly.                                                                                                       |
| Repository and application | Formats changed Markdown in check mode, validates local links/anchors across all tracked Markdown and checks whitespace. For executable changes: format check, lint, governance, Svelte/types, full Vitest and production build. Runs the small database-runner safety tests too. |
| Database contracts         | Runs when Supabase, CI tooling/workflows, package manifests/lock or Node version changes, and on full manual runs. Fresh isolated migration replay, all SQL contracts and the existing Calendar Group-assignee upgrade regression.                                                |

The only lightweight exemption is Markdown under `docs/` and the root README/AGENTS/CLAUDE/CONTEXT files. Unknown paths run application validation. Files such as `docs/architecture/GOVERNANCE_BASELINE.json` remain executable inputs. Database inputs also run application checks, including the test that consumes `supabase/config.toml`. Unchanged SQL is not rerun solely for a UI change.

Both substantial jobs start independently after selection. Each uses the smallest x86 Depot sandbox initially, with explicit timeouts. npm downloads are cached; application dependencies use `npm ci`. Vitest keeps its complete current suite with two workers. There is no browser suite, OS matrix, sharding or coverage quota. Increase compute only with measured runtime/memory/cost evidence; a worker limit does not resolve historical unexplained worker failures.

## Local work and acceptance

Use focused checks while editing. Full validation does not run automatically before pushes; the former repository push hook and its installer are removed. `npm run gate` remains available for voluntary local validation, with the build separate. Existing custom local hooks remain intact: on Robert's workstation the maintenance hook protects the baseline tag and delegates to repository hooks only when they exist.

The [verification contract](architecture/DEFINITION_OF_DONE.md#required-commands) still defines acceptance. Format locally before submitting; hosted CI checks formatting without rewriting the candidate. Passing CI for the exact candidate may be used directly rather than repeated locally. Pending checks are pending, never a claimed pass. A later source/configuration change requires affected verification again. Browser journey and populated-upgrade evidence remain required when their task calls for them; fresh database replay alone does not prove every upgrade.

The governance job needs full Git history and `origin/main`; preserve that checkout behavior. It runs the canonical regression checker, which rejects new/completed-scope findings while reporting the owned Phase 08 debt. Do not replace it with the standalone inventory report or weaken any rule to make migration pass.

## Database isolation

`python3 scripts/ci/database.py` creates a unique disposable project outside the checkout, copies only the required Supabase configuration/migrations/tests/templates, disables seeds and chooses unused ports outside existing local stacks. It starts only the services needed for SQL tests and cleans up its exact project after success or failure. It never reuses the repository's local project or reads production credentials. The database job does not install the application dependency tree.

The pinned PostgreSQL image's known reserved-role denial crash is worked around by disabling `supautils.hint_roles` decoration only in the disposable database. This preserves grants, RLS and expected SQLSTATE denials. The Calendar migration regression runs through pg_prove with its relative migration includes intact. Failures remain failures; the existing SQL tests and historical migrations are unchanged.

## Depot operation

The CLI is installed at `~/.depot/bin/depot` on this workstation (version 2.102.13 at setup); use its absolute path if the terminal PATH omits it. The existing Depot Code Access app passed repository-access preflight. The validation workflow uses synthetic app/provider values and disposable database keys, with no production secrets to migrate. The unrelated Claude automation stays outside this migration.

```bash
depot ci run --workflow .depot/workflows/ci.yml
depot ci status <run-id>
depot ci logs <job-id>
```

A local CLI run uploads the candidate's unpushed working-tree patch to Depot compute. With CLI 2.102.13, newly created files must first be added to Git's index (ordinary staging or `git add --intent-to-add -- <explicit paths>`); untracked files are otherwise omitted from the upload even though local job selection sees them. Review the complete `git diff` and included paths first; keep credentials in ignored local files. The CLI prints the run/job IDs needed for status and logs. Run one deliberate candidate validation rather than repeating full local and hosted suites.

Automatic triggers register after the workflow is published and merged to the default branch. The obsolete GitHub validation workflow is removed to avoid duplicate compute if GitHub Actions is later re-enabled. No repository visibility, paid plan, branch-protection or deployment setting is changed. Vercel remains separate and may deploy on publication/merge; existing release prerequisites still apply.

References: [Depot quickstart](https://depot.dev/docs/ci/quickstart), [workflow compatibility](https://depot.dev/docs/ci/compatibility), [GitHub check reporting](https://depot.dev/docs/ci/observability/github-checks).

## Migration acceptance record

Merged through [PR #1346](https://github.com/waffleflopper/trooptotask/pull/1346) at `0a9e2cfee31dda907d258e209d0ca4818beded45`, incorporating completed D04 commit `91b8bc3cd12354b71c4c8b2e869feed17d79ace5`. The original D04 branch and commits remain intact; [Phase 07 acceptance](stabilization/EVIDENCE.md#phase-07-integrated-phase-check) reconciles that integration separately from this tooling change.

Hosted candidate: [Depot run `56311mzhgj`](https://depot.dev/orgs/rvsvvkd4rp/workflows/m59999npzz), uploaded by `depot ci run --workflow .depot/workflows/ci.yml` against remote base `761349957d913e991339212aa610dc0887afe9db`, cache patch `patch/761349957d91/01cfa382fbbd8ea9`. Runtime/configuration diff SHA-256 is `e9f9df6fa27788b5ae4924d311b8f418328a3b08b0f2466252399c8777de8d54`, reproduced by `git diff --binary 91b8bc3c -- . ':(exclude)*.md' | sha256sum`. This identifies the uncommitted executable candidate independently of subsequent prose receipts.

- Local `npm run format`: exit 0. Focused CI helpers: 2 Vitest files / 9 tests; origin-policy confirmation: 3 files / 41 tests; database-runner safety: 7 stdlib tests, all passed. Existing custom-hook dry inputs accepted an ordinary branch update (exit 0) and rejected the protected baseline tag (exit 1 expected), without pushing.
- Hosted repository/application checks: `npm run format:check`, `npm run lint`, `npm run governance:check`, `npm run check`, `npm run test` and `npm run build` all exited 0. **553 Vitest files / 4,996 tests**, zero Svelte/type diagnostics, 7 Python safety tests; document formatting/whitespace and all 76 Markdown files' local links passed. Canonical governance retains the 1,695 owned Phase 08 findings and reports zero new/completed-scope violations. Final Depot readback reports success for all three jobs.
- Hosted database: fresh 138-migration replay, 23 SQL suites / 503 assertions, plus 9 Calendar upgrade assertions through pg_prove: PASS. Project `t2t-ci-db-jhz1scdy` under `/tmp`, ports 58757/64500/60072/64371/60424/59172/58933/64389; only this newly created project's database was used. Exact-project stop and directory cleanup passed. Setup/test/cleanup commands are in the checked-in runner and linked job logs, not dependent on temporary workstation logs.
- Independent Standards and Spec reviews: 0 unresolved findings. Spec's inherited-provider-environment finding was fixed with subprocess evidence; remote Docker refusal and IPv4-only port reservation are covered too. No application, migration, SQL assertion, test skip or governance threshold changed.

The setup failures remain accounted for: run `sf0m19tcdw` omitted untracked files from the CLI patch and failed before validation; registering new paths with intent-to-add fixed the upload. Run `vbx5bgp8z0` failed on the IPv6-only port allocator and 25 origin-policy tests because a build-only URL was mistakenly set for Vitest. The final successful run covers both failures: the allocator supports the actual IPv4 sandbox, and only the build receives that URL. No assertion was weakened. Existing unused `waitFor` lint warning, Calendar mixed-import/large-chunk/optional `@opentelemetry/api` build warnings and the PostgreSQL hint-decoration image workaround remain explicit.

Tooling: Depot CLI 2.102.13, Node 24.21.0, hosted npm 11.12.1 (local formatter npm 11.19.0), hosted Python 3.12, Supabase CLI 2.101.0, PostgreSQL 17.6 and pg_prove 3.36. Exact synthetic environment values and action pins are in the workflow; no account secrets were imported. This uses Depot-hosted disposable verification only, not an existing remote/production database or the workstation's development stacks.

Observed once on the final candidate: selection **7.2 seconds**, application **209.6 seconds**, database **101.9 seconds**, about **3 minutes 44 seconds** end to end. Depot's sampled peak memory was **31.2%** for application and **14.2%** for database on the configured 2-CPU/8-GB sandboxes. These are one-run diagnostics, not a performance guarantee or a before/after benchmark; there is no evidence requiring larger runners. `depot ci metrics --run 56311mzhgj --output json` supplies the observations.

Final evidence-only edits received local document formatting/link/whitespace verification; the executable-diff digest above remains unchanged, so the hosted suite was not rerun merely to record its result.

Automatic PR/main delivery is now observed: #1346 head checks passed, and the exact merged SHA above passed Select checks, Repository/application and Database contracts in [the main-triggered run](https://depot.dev/orgs/rvsvvkd4rp/workflows/sjr8mqc29d). Readback and job logs confirm 553 files / 4,996 tests, zero Svelte/type diagnostics, seven Python safety tests, fresh 138-migration replay, 23 SQL suites / 503 assertions and nine Calendar upgrade assertions. This supersedes the earlier pending-publication checkpoint without claiming deployment or production acceptance. The GitHub plan and private/unprotected repository policy are accepted, not outstanding failures.
