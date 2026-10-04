# D25 scheduled maintenance verification

This first [#1373](https://github.com/waffleflopper/trooptotask/issues/1373) deliverable makes the configured jobs reproducible on an owned synthetic service. It adds small and 1,001-row maintenance cohorts, exact-target readback, explicit redirect observations, interrupted-setup protection and missing cutoff/replay/provider-failure tests. Application implementation, schema and schedules are unchanged.

The split delivers reusable fixture/control/test coverage while leaving all production jobs inactive or active exactly as before. Admission repairs belong with eligibility, count and atomicity repairs so enabling a previously blocked job cannot expose an unsafe intermediate state. The source-owner cutover may also require an independently verified SQL migration and Robert's manual release step. That next deliverable must repair these related defects together. This PR uses `Refs #1373`; neither the issue nor its dependents are complete.

## Selection and coverage

Fetched default `ad63659aa69b6db046bae94878d9ec55d8b23132` contains the actual closing prerequisite merges D15 [#1492](https://github.com/waffleflopper/trooptotask/pull/1492), D18 [#1508](https://github.com/waffleflopper/trooptotask/pull/1508) and D24 [#1517](https://github.com/waffleflopper/trooptotask/pull/1517). No competing D25 PR was found. D26 #1374 remains separately owned. The parent is #1281, milestone 6, task `08-M14-02`.

The [feature-map index](../../../.agents/skills/verify-trooptotask/features/README.md) maps user journeys. This headless deliverable extends the [maintained helpers](../../../.agents/skills/verify-trooptotask/SKILL.md#helpers), rather than inventing a browser journey. Privileged fixture writes/readbacks are separate from ordinary unauthenticated job HTTP requests. Native Chromium supplies the repository-owned environment; no native user interaction is claimed.

`vercel.json` configures archived records, expired Onboarding packets, Audit cleanup and account-setup cleanup. Each was called without cookies in missing, wrong and valid credential modes. Small valid calls were repeated. Large cohorts exercise both library families and setup links. Fixed-time lower tests own exact cutoff equality, reference-read failure, credential variants, history preservation, partial committed effects and replay. Source-specific Personnel/artifact/Onboarding proof is reused only within the limits below.

## Actual unchanged-application observations

Frozen run `2155c99b900b2f2277152579ca2a5683da4e50b1af994561d1edb5e691fa4869` uses base `ad63659a`, owned worker 1/session `c7c6c297-5eb3-42be-a7c6-9903f134898c`, origin `http://127.0.0.1:45759`. Production launch, initial/final doctor and owned disposal pass. Node 24.21.0/npm 11.19.0, Supabase CLI 2.101.0 and Chromium 152.0.7977.82 run with the task-owned short `TMPDIR=/home/waffleflops/.cache/t2t-d25-tmp`. A task-local browser executable symlink selects `/usr/lib/chromium/chromium`; no desktop configuration is changed. The toolkit creates its own disposable provider with synthetic fixtures. No remote or existing local database is accessed.

| Boundary                                  | Expected                                                                                                     | Observed                                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archived records and Onboarding admission | Missing/wrong credentials return 401 without effects.                                                        | Both return 401. The ten maintenance target collections remain equal after all denied calls.                                                                                                                                                    |
| Audit and setup admission                 | Credential checks reach the job; missing/wrong return 401 and valid calls execute.                           | **FAIL.** All tested modes, including repeat and large valid calls, return 303 to `/auth/login`. Seeded Audit, setup links and Access Requests remain unchanged. No cleanup-effect credit.                                                      |
| Small archived records                    | Delete only expired unreferenced rows; preserve saved references, recent/active rows and B witnesses.        | 200, total 2, one Organization, CT 1 and Calendar type 1. The other five family counts are zero. Complete retained target rows and both reference rows remain equal.                                                                            |
| Small Onboarding                          | Delete expired completed/cancelled packets with progress; preserve active, recent and null-terminal history. | 200, total 2, one Organization. Both expired packet IDs disappear. Ineligible packet witnesses and original history survive.                                                                                                                    |
| Repetition and summaries                  | No new deletions or duplicate success summaries on replay.                                                   | Both admitted jobs repeat with 200/count 0/Organizations 0. A has five count-only summaries per successful job, null links; B has none.                                                                                                         |
| Large library cohort                      | Delete 1,001 expired unused rows from each library and report actual effects.                                | **FAIL.** Archived-record job returns 500/Internal Error. Both 1,001-row expired cohorts remain; all ten selected maintenance collections remain equal. Later Calendar deletion is not reached.                                                 |
| Restoration                               | Remove owned cohorts and preserve original source facts.                                                     | Both `clean-seeds` commands pass. Twelve original A/B collections across six library/reference/Onboarding tables compare equal. Whole owned-project disposal passes. Global-table target absence was not separately queried after seed cleanup. |

`observations.json` summarizes the raw responses and independently compares saved rows by ID. The archive also retains every seed, response, before/after readback and the exact driving script. No screenshot, current SQL-suite execution, performance timing or independent live execution is claimed.

The large failure is consistent with unbounded Critical Tasks candidate/reference/delete filters in the surviving generic cleanup. The app log was not copied before disposal, so this is a source inference, not a preserved `URI too long` runtime observation. Exact provider fault attribution remains for the repair deliverable. Identity's exact public-route list omits both redirected configured routes. Direct route tests pass because they do not execute that composed admission layer.

## Applicable predecessor evidence

`applicability.json` captures historical/current hashes and actual source deltas. Personnel retention at tested `2bbefed9` and artifact retention at integrated `bb524e45` differ only in the two bucket-constant import locations; operation bodies and selected tests remain identical. Existing bucket values are preserved. The [D12 retention receipt](d12-retention-ownership.md) and [D13 repaired retention acceptance](../EVIDENCE.md#phase-08-d13--artifact-retention-size-repair-and-ownership) retain their exact count, file, failure, replay and provider-sized credit. They do not prove a live parent restore race, whole-job atomicity or a bounded oversized parent Storage removal request.

Onboarding's provider, ports, provider tests and Shared cutoff match integrated `bb524e45` exactly. Its operation substitutes the equal Organization-owned default of 36 months. The [D15 retention repair](d15-retention-repair.md) retains terminal predicate/cascade/fault/race and 1,002-packet credit; [final composition](d15-reopen-retention-delivery.md) retains its distinct History/export proof. Current small composed admission/effects are fresh above. No whole-tree or new current-chain SQL equivalence is claimed.

Audit cleanup source and route/tests match D19 `6af243fe` exactly. Its [acceptance](d19-audit-ownership.md) supplies lower/security coverage, not a destructive live cleanup result. Identity's retained setup service/provider cleanup behavior has existing lower tests; the new real-SDK route tests cover literal lifecycle results and provider failures. Neither supplies live admission or provider-sized count acceptance.

## Preparation failures and publication differences

The separate preparation archive preserves the failed Node 26 adapter build, two Node 24 browser-start failures, successful short-directory native prerequisite probe, and interrupted first seed. The live schema rejected a nonexistent `daily_assignments.note` fixture column before jobs ran. The ownership ledger survived, exact recorded seed cleanup passed, doctor passed and that owned session was disposed. The corrected fixture then completed the distinct baseline above. Browser failures are observations; no proven desktop-flags diagnosis is claimed.

After final doctor/disposal, independent comment review identified two narration comments. Both were removed. The frozen source copies and `publication-delta.json` preserve these comment-only differences. Helper behavior and application implementation remain unchanged; focused checks were repeated. Later record/archive additions and the corrected older helper instructions do not relabel the frozen live digest. Those instruction edits describe the existing controls; no driving step or executable behavior changed.

## Durable artifacts

Sanitized inspection found synthetic fixture values and source-test credentials only. No live credential, token hash or cookie capture was included, and no outcome was redacted. The two archives remain separate.

| Archive                                           | Payloads | SHA-256                                                            |
| ------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| [Preparation](d25-maintenance-preparation.tar.gz) | 66       | `4070fa7ff88a062874968fde702479e46c05848c23de367bc616d470d4019ea3` |
| [Baseline](d25-maintenance-baseline.tar.gz)       | 152      | `7e8ae8d300b529622ce13770b36ff3aaec47deea778986f7550cf8c6fa20ac56` |

Fresh extraction verifies each exact payload set and expanded-byte hash against its internal `inventory.json`. To repeat, run from the repository root.

```bash
set -e
sha256sum --check <<'SHA256'
4070fa7ff88a062874968fde702479e46c05848c23de367bc616d470d4019ea3  docs/stabilization/phase-08/d25-maintenance-preparation.tar.gz
7e8ae8d300b529622ce13770b36ff3aaec47deea778986f7550cf8c6fa20ac56  docs/stabilization/phase-08/d25-maintenance-baseline.tar.gz
SHA256
for task_archive in docs/stabilization/phase-08/d25-maintenance-{preparation,baseline}.tar.gz; do
	task_review_dir=$(mktemp -d .verification/evidence/verify-trooptotask/d25-review.XXXXXX)
	tar -xzf "$task_archive" -C "$task_review_dir"
	python3 - "$task_review_dir" <<'PY'
from pathlib import Path
import hashlib, json, sys
p = Path(sys.argv[1])
expected = json.loads((p / 'inventory.json').read_text())
actual = {f.relative_to(p).as_posix(): hashlib.sha256(f.read_bytes()).hexdigest()
          for f in p.rglob('*') if f.is_file() and f.relative_to(p).as_posix() != 'inventory.json'}
assert actual == expected
PY
done
```

## Checks and issue remainder

Four focused archive/cron suites pass 60 tests on the publication source. Two helper tests pass, including interruption ownership and complete 1,006-link readback without token hashes. Touched ESLint, formatting, skill metadata validation and whitespace pass. Full exact-published-head CI/build and completed clean hosted review remain merge gates.

Next is the cohesive source-owner cutover and related admission/size/count/safety repairs. Scheduled Maintenance must stop discovering/deleting foreign tables; CT, Calendar and Onboarding providers must own their operations. Preserve all seven archive-family counts, cutoffs, order, partial-failure semantics, summaries and four configured jobs. Reconcile every direct/reverse consumer, manifest, provider boundary and governance finding. Remove the archived-Personnel alias after its caller census. `retentionSupport` is already deleted by D17; do not claim a fresh cycle removal. Reverify admitted Audit/setup effects, provider-sized counts, exact eligibility/concurrency and affected SQL guarantees. External schedules remain uninspected.

Robert authorizes same-issue non-migration merges only after green exact-head CI and completed bots without actionable feedback. Any migration-containing deliverable stops before merge for his manual remote operation. No other issue advances.

## Independent review and attention

PR [#1519](https://github.com/waffleflopper/trooptotask/pull/1519) first publishes head `5de7d239` against `ad63659a`. The complete diff has eleven paths, nine text files and two archives. CodeRabbit CLI 0.8.2 completes all nine text files with zero findings against that base and the identical uncommitted publication patch. Archives receive expanded acceptance separately. The unavailable `deslop` skill is covered by direct cleanup checks for duplicate/dead code, unnecessary abstractions, scope drift and narration; independent comment review removes two narration comments and finds no new correctness suppressions.

Independent Claude Opus 5.5 source/artifact acceptance reviews all eleven paths and all 218 expanded payloads, recomputing 19 HTTP responses, ten small collections, all 4,028 large recorded rows, ten notifications and twelve restored collections/19 original rows. It validates thirteen historical/current source comparisons and the two comment-only publication differences. Its conditional GO identifies one actionable instruction mismatch in older helper paragraphs. Those paragraphs now describe configured selectors, the unconfigured alias and redirect output correctly. The same independent reviewer gives the corrected three-file prose delta GO with F1 resolved and no actionable finding; this remains artifact review, not independent live execution.

The distinct reviewer model pair is GPT-6.1-sol and Claude Opus 5.5. Its attention flags remain visible. Admitted Audit/setup effects and large-library behavior still fail. Preparation's successful launch stdout is empty, with same-session doctor as its running witness. Interrupted and global-table cleanup have success/disposal receipts without exact post-clean target absence. Denied Onboarding effects are inferred from subsequent exact cleanup; current notification recipients were not compared with the admitted administrator set, and notifications were not read after the large 500. Audit cutoff SQL and large Onboarding retain their stated source/historical proof limits. No additional success credit is assigned.

The final preparation decision row's `../d25-baseline-fixed/` pointers name payloads in the separately packaged baseline archive. Extracting preparation as `d25-baseline` and baseline as `d25-baseline-fixed` beneath one fresh directory resolves those original relative pointers; archive hashes and inventories above protect both. Earlier neighboring D24 checkpoint prose remains another owner's historical record; the actual #1517 prerequisite integration was verified for this selection. Exact-head CI/hosted review are still pending. The hash-check loop independently validates each package; the paired extraction layout serves the separate cross-archive pointer check, which also passes.
