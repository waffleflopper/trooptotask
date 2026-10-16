# Continuous integration

Depot CI runs validation for this private, single-contributor repository. GitHub remains the source and PR host. Each job uses the `depot-ubuntu-24.04` 2-CPU, 8-GB x64 sandbox. `main` intentionally remains unprotected on the current GitHub plan. Missing paid rulesets or branch protection is not a failure or an unfinished project requirement.

## What runs

[The workflow](../.depot/workflows/ci.yml) runs on pushes to `main`, manual dispatch, and PRs targeting `main` that carry the `run-ci` label. Feature-branch pushes without a PR do not start duplicate runs. New PR updates cancel superseded runs; main/manual runs are retained. No deployment or remote database operation is part of CI.

PR checks wait until the review bots are done, so rounds of review fixes do not each pay for a full run. Without the label, every job reports skipped. Add `run-ci` once hosted review of the current head returns no actionable findings. Adding it starts a run, and CI then runs on every later push. Before pushing another round of review fixes, remove the label and add it again after that round's review is clean. Adding any other label skips every job and cannot cancel a running check. Robert can add the label from the PR page at any time.

| Job                        | Scope                                                                                                                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Select checks              | Uses the full PR diff or push’s before/after diff, including deletions and renames. Manual/local CLI runs validate everything. Missing comparison history fails explicitly.                                                                                                       |
| Repository and application | Formats changed Markdown in check mode, validates local links/anchors across all tracked Markdown and checks whitespace. For executable changes: format check, lint, governance, Svelte/types, full Vitest and production build. Runs the small database-runner safety tests too. |
| Database contracts         | Runs when Supabase, CI tooling/workflows, package manifests/lock or Node version changes, and on full manual runs. Fresh isolated migration replay, all SQL contracts, populated-upgrade regressions and SDK/provider probes.                                                     |

The only lightweight exemption is Markdown under `docs/` and the root README/AGENTS/CLAUDE/CONTEXT files. Unknown paths run application validation. Non-Markdown files under `docs/` remain executable inputs. Database inputs also run application checks, including the test that consumes `supabase/config.toml`. Unchanged SQL is not rerun solely for a UI change.

All three jobs use `depot-ubuntu-24.04`. The two substantial jobs become eligible independently after selection. Existing job timeouts are retained. npm downloads are cached; application dependencies use `npm ci`. Vitest keeps its complete suite with `VITEST_MAX_WORKERS=2`, restoring the earlier Depot worker setting. The Svelte/TypeScript step retains `NODE_OPTIONS=--max-old-space-size=2560` after the recorded automatic-heap failure. There is no browser suite, OS matrix, sharding or coverage quota. Change compute or worker counts only with measured evidence.

## Local work and acceptance

Use focused checks while editing. Full validation does not run automatically before pushes; the former repository push hook and its installer are removed. `npm run gate` remains available for voluntary local validation, with the build separate. Existing custom local hooks remain intact: on Robert’s workstation the maintenance hook protects the baseline tag and delegates to repository hooks only when they exist.

The [verification contract](architecture/DEFINITION_OF_DONE.md#required-commands) still defines acceptance. Format locally before submitting; CI checks formatting without rewriting the candidate. Passing CI for the exact candidate may be used directly rather than repeated locally. Pending checks are pending, never a claimed pass. A later source/configuration change requires affected verification again. Browser journey and populated-upgrade evidence remain required when their task calls for them; fresh database replay alone does not prove every upgrade.

The governance job runs the canonical checker, which fails on any module-boundary finding or undocumented route provider edge. Do not weaken any rule, exception list or scan path to make a change pass.

## Vercel deployment builds

Vercel deployment builds are separate from Depot validation. Vercel deploys only `main` automatically. `git.deploymentEnabled` in [vercel.json](../vercel.json) sets `main` to `true` and every other branch to `false`. The `**` pattern is needed because `*` does not match branch names containing `/`. PR branches get no automatic preview deployment.

Previews run only when Robert asks for one. To deploy the pushed head of the current branch as a preview, run this from a checkout where `vercel whoami` succeeds:

```bash
printf '{"name":"trooptotask","gitSource":{"type":"github","repoId":1152387919,"ref":"%s"}}' "$(git branch --show-current)" | vercel api /v13/deployments -X POST --input -
```

Vercel clones the branch from GitHub and builds it with Preview environment variables. Uncommitted and unpushed changes are not included.

The `ignoreCommand` in [vercel.json](../vercel.json) also runs as the project's **Ignored Build Step**. Keep the hosted command equal to the checked-in command so existing branches use the same policy.

The command compares `HEAD` with `VERCEL_GIT_PREVIOUS_SHA`, Vercel's last successful deployment for the same project and branch. It skips a build only when every changed path matches one of these exclusions:

- Root `README.md`, `AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md`.
- Markdown under `docs/` or `.agents/`.
- `*.test.ts` under `src/`, and `*.test.*` under `scripts/`.

Other files still trigger builds, including application source, static assets, dependencies, runtime configuration, non-Markdown documentation inputs, and executable verification helpers. All changes since the last successful deployment count, including application changes followed by a documentation-only commit. Rename detection is disabled so moving app code into an excluded path still counts its deletion.

An empty or unavailable previous SHA triggers a build. Redeploying the exact successful commit also builds, supporting environment-only changes and explicit rebuilds. Other manual redeployments can bypass filtering by clearing **Use project's Ignore Build Step** in Vercel's Redeploy dialog. The command needs no dependencies or repository helper script and fits Vercel's 256-character configuration limit. Its shell variable `sha` holds the previous deployment SHA.

Vercel skips on exit code 0 and builds on exit code 1. The command converts Git errors to exit code 1 so missing history cannot block a deployment. Skipped builds still count toward deployment quotas. Depot continues to validate the complete PR independently, including changes that do not need a deployment. [The Git fixture tests](../scripts/vercel-ignore-build.test.ts) execute the actual configured command and check these decisions.

Build-machine selection remains a hosted project setting. Compare Basic and Standard on the same commit and environment before changing it. Use completed builds and Vercel's billed CPU minutes, which include container work after the deployment becomes ready. Keep dependency-cache conditions comparable and report repeated runs, costs, and timing ranges. Build-machine changes do not change function memory or runtime settings.

[PR #1695](https://github.com/waffleflopper/trooptotask/pull/1695) records the hosted rollout, completed build comparisons, and selected machine.

References: [Vercel build filtering](https://vercel.com/docs/project-configuration/project-settings#ignored-build-step), [previous deployment SHA](https://vercel.com/docs/environment-variables/system-environment-variables#vercel_git_previous_sha), [build machines](https://vercel.com/docs/builds/managing-builds).

## Database isolation

`python3 scripts/ci/database.py` creates a unique disposable project outside the checkout, copies only the required Supabase configuration/migrations/tests/templates, disables seeds and chooses unused ports outside existing local stacks. It starts only the services needed for SQL tests and cleans up its exact project after success or failure. It never reuses the repository’s local project or reads production credentials. The database job installs the locked npm dependency tree with lifecycle scripts disabled for its SDK/provider regression probes. This includes the development parser those probes require; it does not build or deploy the application.

The workflow records each disposable project in a private, credential-free receipt tied to the current run, attempt and job. Cancellation first stops the active command’s process group, including CLI wrappers and descendants, then leaves slow Docker disposal to the job’s `always()` cleanup step after successful checkout. Normal phases still clean up before the next phase starts; standalone runs keep their inline cleanup. The finalizer accepts only the recorded local Unix socket, disabled-seed project directory and exact project resource names/labels. Matching project labels also cover Docker-generated test container names for the pinned pg_prove:3.36 image from public ECR or setup-cli’s GHCR mirror. Validated test containers are removed by their IDs; network attachments must reference validated owned container IDs. It refuses a live command process group, any process whose working directory is inside the project, and unreadable process identity. A process whose working directory alone is unreadable must have started before the producer or be the running init of a validated owned container, with its identity unchanged after inventory. It records verified resource absence before removing the directory, and retains the receipt until both are absent. An interrupted directory removal can resume after a fresh resource-absence check. No receipt is a safe no-op; an invalid receipt or incomplete disposal fails. Cleanup never scans or prunes other projects.

The pinned PostgreSQL image’s known reserved-role denial crash is worked around by disabling `supautils.hint_roles` decoration only in the disposable database. This preserves grants, RLS and expected SQLSTATE denials. Migration regressions run through pinned pg_prove with their relative migration includes intact. Failures remain failures; the existing SQL tests and historical migrations are unchanged. Runner acceptance requires these real container-backed checks to finish successfully; Docker hello-world or image-manifest inspection alone is insufficient.

## Depot CI operation

The Depot Code Access connection must be active for this repository. The pinned `actions/setup-node` supplies Node 24; npm remains pinned to 11.12.1, Supabase CLI to 2.101.0 and pg_prove to 3.36. Existing action commit pins are preserved. The workflow uses synthetic app/provider values and disposable database keys, with no production secrets. The unrelated Claude automation stays outside this CI switch.

```bash
depot ci run --workflow .depot/workflows/ci.yml
depot ci run list
depot ci status <run-id>
```

Depot registers automatic PR/main triggers from workflows on the default branch. Before merging a restored workflow, run the exact candidate through `depot ci run --workflow .depot/workflows/ci.yml`. Record the run URL, candidate revision or patch, actual job and step results, and disposable cleanup. After integration, verify the registered automatic trigger. Queued, skipped or unavailable jobs remain unverified. Earlier ARM64 or Depot results do not establish acceptance on the new candidate.

No repository visibility, paid plan, branch-protection or deployment setting is changed. Vercel remains separate and may deploy on publication or merge; existing release prerequisites still apply.

References: [Depot CI quickstart](https://depot.dev/docs/ci/quickstart), [Depot CI compatibility](https://depot.dev/docs/ci/compatibility).

## Return to Depot CI

Robert requests the return to Depot’s separate CI service during #1573. The current workflow moves from `.github/workflows/ci.yml` back to `.depot/workflows/ci.yml`. All three jobs retain `depot-ubuntu-24.04`, and Vitest restores two workers for the earlier 8-GB configuration. Current cancellation-safe database receipts, cleanup, pins, checks and type-step heap budget are retained. No database migration or remote database operation is included. Exact-candidate Depot execution and automatic trigger acceptance remain pending.

## ARM64 migration acceptance

The runner is registered and GitHub reports `macmini-arm64` online with labels `self-hosted`, `Linux`, `ARM64` and `macmini-arm64`. Repository Actions was disabled, so the first migrated push at `5e10587c` created no run. Enabling Actions through the repository API now reads back `enabled: true`; branch protection, workflow token permissions and action pins are unchanged. #1479 preserves its existing Onboarding lifecycle work while moving the workflow out of Depot after the trial expired. [Actions run `36967811191`](https://github.com/waffleflopper/trooptotask/actions/runs/36967811191) completes all three jobs successfully at PR head `2f8a38fa6e49a9a038b4f65cfc885f9cea9e3a18`, testing GitHub’s merge candidate `d667c3c865551b3988a6b1cce05fc6b1c78b0137` against `8429f758`. This identifies the initial runner execution. Robert’s subsequent instruction authorizes non-migration merges after green current-head CI and completed reviews without actionable feedback. Final [Actions run `36969182496`](https://github.com/waffleflopper/trooptotask/actions/runs/36969182496) passes all three jobs at accepted head `21e4f27a4c5181d50ce5d03b1e5f92761348c734`, testing merge candidate `7fdb3bf899105c6caae3f656ddef42c141332f12`; their tree is `e66d993f62dc428ca0ff255f244a12ae1bb940ab`. Hosted CodeRabbit approves that head (review `5388623749`) with the fixture-record feedback addressed and resolved. #1479 merges at `73cc63fa0118d4914ecd0524e34f1f7fdf49a9d3`, with the same tree. Its [main-triggered run `36970420869`](https://github.com/waffleflopper/trooptotask/actions/runs/36970420869) passes Select checks, Repository and application, and Database contracts. Fresh runner API readback reports online/idle with the expected four labels. No billing, production database or branch-protection setting changes.

- **Select checks:** PASS, `application=true` and `database=true`, on `macmini-arm64` with all four required labels.
- **Repository and application:** PASS for documentation/whitespace (14 changed Markdown files formatted; 164 documents checked for links), eight database-runner safety tests, format, lint, governance (506 owned findings, no regression), Svelte/types (0 errors/warnings), full Vitest (630 files / 5,793 tests) and production build/server-only boundary. Node 24.21.0 is the actual Linux ARM64 download; npm is installed at the preserved 11.12.1 pin. The two existing Calendar lint warnings and existing mixed-import, large-chunk, plugin-timing and optional `@opentelemetry/api` build notices remain.
- **Database contracts:** PASS through pinned Supabase CLI 2.101.0, PostgreSQL 17.6 and pg_prove 3.36 on the ARM64 runner. Fresh replay applies all 161 migrations from `20260413001158_remote_schema.sql` through `20261002000100_atomic_onboarding_note_append.sql`: 52 SQL suites / 1,374 assertions, three migration regressions / 25 assertions and actual GoTrue/Personnel roster/retention provider probes pass. A second disposable project starts with 141 migrations, populates synthetic predecessor fixtures, applies the held upgrade chain and passes 16 upgrade suites / 226 assertions plus prepared-client and retention commit-error/rollback probes. No test or migration was weakened or skipped.
- **Isolation and cleanup:** Fresh project `/tmp/t2t-ci-db-x167_6vb` uses API/DB ports 59533/58376; populated project `/tmp/t2t-ci-db-sq3nukju` uses 61291/63529. Full reserved port sets and commands are in the linked job log. Both exact `supabase stop --project-id <owned-id> --no-backup` commands succeed and both disposable directories are cleaned. Only local disposable projects and synthetic data are used; no production credentials, remote database or existing local stack is accessed.
- **Review:** Independent preflight verifies the exact four-line workflow transformation, unchanged D15 source/controls/archives and all ten decision-fixture cases/variants without live mutations. A remaining active Depot reference is corrected. CodeRabbit CLI completes all fourteen migration paths with zero findings. Hosted changed-material review completes at `2f8a38fa`; its actionable request to publish fixture outcomes is addressed in the PR body. Final result-record documentation checks, complete CLI/independent review and hosted current-head review pass before the authorized merge. Robert’s explicit private, single-contributor runner choice retains all three jobs on the dedicated runner; a generic hosted-runner recommendation does not establish a compatibility defect.

Observed initial job times are 2m02s selection, 7m09s application and 6m08s database, sequentially on the single runner. No memory, architecture, missing-tool or cleanup failure occurs. Peak memory/disk consumption and exact Python/Docker versions are not emitted by this workflow; no such measurements are claimed. Pinned checkout/setup-node actions produce the runner’s Node 20 deprecation notice while successfully executing under Node 24. This is not a verified compatibility failure, so pins stay unchanged. The earlier Depot billing failure and disabled-Actions first push remain historical failures; this successful run covers the requested replacement service.

## Migration acceptance record

This historical record covers the original Depot migration. The return-to-Depot candidate above requires its own current acceptance. Merged through [PR #1346](https://github.com/waffleflopper/trooptotask/pull/1346) at `0a9e2cfee31dda907d258e209d0ca4818beded45`, incorporating completed D04 commit `91b8bc3cd12354b71c4c8b2e869feed17d79ace5`. The original D04 branch and commits remain intact; [Phase 07 acceptance](stabilization/EVIDENCE.md#phase-07-integrated-phase-check) reconciles that integration separately from this tooling change.

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
