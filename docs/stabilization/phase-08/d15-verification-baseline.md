# D15 packet verification baseline

## Outcome and selection

Intermediate **#1363 / D15 / `08-M09-02v`**, based on fetched main `e6d467842e6bd2184827faf64540dec2775bbab1`. This PR supplies the [packet recipe](../../../.agents/skills/verify-trooptotask/features/onboarding-packets.md), three exact Organization A endpoint controls and actual unchanged-application observations. It changes no application behavior or schema. Failed expectations remain failures blocking the affected repair/cutover; use `Refs #1363`, keeping the issue open.

Fresh paginated Phase 08 issue/PR reads, branches/worktrees and actual default content established integrated prerequisites: D12 final [#1462](https://github.com/waffleflopper/trooptotask/pull/1462) at this base and D14 final [#1435](https://github.com/waffleflopper/trooptotask/pull/1435) at `875dd0e1`, after implementation #1432. Their acceptance receipts and completed CI/reviews were inspected. D16 and D20 are also integrated; no competing D15 work was found. #1361 remains independently owned. Robert authorizes successive green-CI, completed-clean-bot-review non-migration merges for this issue only; any migration PR stops before merge for his manual operation.

## Frozen run and artifacts

Owned worker 1, October 1, 2026, production origin `http://127.0.0.1:43085`; revision above plus only the recipe/index/control preparation. Launch and final doctor passed with candidate **`bf3f9d4f222e0ebd5eaa630bf37ed0cfc216e76da99173deeb78f90d20576946`**, session `4f39586c-0832-4f4d-b646-82e8afa52338`. Node 24.21.0, npm 11.19.0, Supabase CLI 2.101.0, Chromium 152.0.7977.82 on Linux. Public project/ports and replay setup range are archived in `environment-public.json`. Legacy seed loading was disabled by the inspected owned launcher; no existing local or remote database was accessed. Disposable schema replay serves the app and is not claimed as a new SQL contract run.

Operate/View/Scoped/Empty/Foreign/Switch actors have no Personnel/Training lane. Scoped configures Alpha only; Empty has no Groups; Switch configures A and views B. Exact synthetic account/Organization/Person/template/step IDs are in `fixture.json`. A begins with Able's completed March packet, three progress snapshots and a retained note; no active packets. B has its private Person/template and no active packet.

The [single archive](d15-packet-baseline.tar.gz) contains **119 payloads**, including original recipe bytes, before/action/after snapshots, screenshots, separate authenticated API probes, row/control readbacks, comparisons, final doctor and cleanup. SHA-256: **`d555c1b9d59f5c6a3019ef547c8a7fab7737d36b1e34c095fca131649c64a42a`**. Captures were inspected and contain synthetic data without credentials or token-bearing URLs; no redaction was necessary. Re-extraction into fresh ignored scratch space confirmed the exact payload file set and every expanded hash against `inventory.json`.

```bash
mkdir -p .verification/evidence/verify-trooptotask/d15-review
tar -xzf docs/stabilization/phase-08/d15-packet-baseline.tar.gz -C .verification/evidence/verify-trooptotask/d15-review
python - <<'PY'
from pathlib import Path
import hashlib, json
p = Path('.verification/evidence/verify-trooptotask/d15-review')
expected = json.loads((p / 'inventory.json').read_text())
actual = {f.relative_to(p).as_posix(): hashlib.sha256(f.read_bytes()).hexdigest()
          for f in p.rglob('*') if f.is_file() and f.name != 'inventory.json'}
assert actual == expected
PY
```

Executable and driving inputs stayed frozen through final doctor/disposal. Afterward, the recipe was clarified to reflect the discovered absent Kanban note editor and to distinguish API creation/native History readback. The archive preserves the tested instructions. This instruction-only correction and packaging are not a new live run or relabeled digest.

## Observations

| Surface                        | Actual result and disposition                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native existing-Person start   | Operate selected Able, October 1 and A template; saved one active packet with fresh three-step snapshots and matching Training presence complete. Reload retained identity/date/template and progress. Original completed packet/progress unchanged. **PASS.**                                                                                                             |
| Native steps                   | Checkbox completion saved; Paperwork Submitted → Reviewed → Filed completed it, then Reviewed reversed completion. Reload showed 67%; exact provider fields matched. Checkbox reversal was unrun. **PASS for driven actions.**                                                                                                                                             |
| Failed start                   | POST 503, no new rows; dialog closed and draft lost, with no rendered error/feedback observer entry. **FAIL — repair required; manual re-entry is not retry recovery.**                                                                                                                                                                                                    |
| Failed step                    | PUT 503 rolled optimistic Filed back to Reviewed; exact saved rows unchanged, but no rendered failure/feedback. **FAIL for feedback; rollback PASS.**                                                                                                                                                                                                                      |
| Failed completion              | PUT 503 preserved the active packet but closed the one-incomplete-step confirmation without feedback. **FAIL — repair required.**                                                                                                                                                                                                                                          |
| Cancel/reopen/complete/history | Native cancel retained packet/progress IDs and History row. Separate authenticated API reopen200 cleared cancelledAt; native active readback retained progress. Native completion accepted the explicit one-incomplete warning and preserved same IDs/history. Scoped History showed March3/3 and new2/3 alongside retained note. **PASS, with API reopen distinguished.** |
| Notes                          | Main Kanban offers no editor. Separate API note200 retained text, server author/time; native History Toggle Notes displayed it. **API creation/native readback PASS; UI creation/draft-failure unreachable.**                                                                                                                                                              |
| Access/no effects              | Read-only View detail, Alpha-only scoped History, empty History, no-lane entry denial. Valid view mutations and scoped/empty out-of-Group/unassigned/foreign Person requests returned403/404. Whole A packet/progress before/after equal. **PASS for listed probes.**                                                                                                      |
| Duplicate/configure boundary   | Duplicate active Able start409 without another row. Operate API resync403; native visible Operate Re-sync also returned403. **Server boundary PASS; configure-only affordance FAIL.**                                                                                                                                                                                      |
| Foreign/private scope          | Native Foreign actor saved B Person/B template with incomplete Training. Switch saw only that private packet with view-only controls before release. **PASS before stale response.**                                                                                                                                                                                       |
| Held A save across switch      | Actual A Baker POST persisted200; native switch B then release added Unknown / Template deleted phantom card to B. B provider rows stayed exact; B reload cleared phantom; native return A showed saved Baker. **FAIL — client request lifetime leaks A state into B.**                                                                                                    |

`observations.md` maps artifact prefixes to actions; `comparisons.json` preserves exact original packet/progress, denial and failed-step comparisons. These observations cover selected start/progress/lifecycle/history/recovery/access boundaries, not whole-issue acceptance.

## Checks, acceptance and remainder

Existing lifecycle, progress, query, resync, retention, store, interaction, Start modal and three API suites passed: **11 files / 128 tests**, exact command in archived `focused-tests.log`. Seven existing network/feedback helper tests and helper syntax passed. Launch production build passed. No tests were weakened or artificial prose/source assertions added. Full publication-candidate DoD checks/build are required in Depot because executable control changed; they remain pending until exact-head CI completes. No database change: separate fresh/upgrade SQL acceptance is not applicable to this PR.

Independent source/expanded-artifact acceptance and complete-diff CodeRabbit are required before merge and recorded with the publication result. Artifact review is distinct from independent live execution; no second run or model diversity is claimed.

Remaining #1363 requirements: repair all four reproduced recovery/scope failures and the Operate reconciliation affordance; own packet/step models, policy/ports/lifecycle/query/progress/resync/retention and consumed Web/server seams; finish routes/bootstrap, Dashboard/export/job and all reverse consumers; remove replaced central/private paths. Configure reconciliation, legacy/null-template/reference cases, Add Person, Calendar/Dashboard/export effects, checkbox reversal, warning dismissal, permission/session races, retention/service failure and isolated security proof remain later acceptance. Source hypotheses are not live defects or passing proof. D12 public Personnel creation and D14 public configuration remain preserved dependencies.

All hooks restored; helper cleanup had no pending seeds. Native cancellation removed UI-created Baker/Foreign from active work; Able completed and retained. Exact original witnesses remained unchanged. Final doctor and owned cleanup passed, with no containers under the exact project label and proof surviving outside the worker. Historical rows had no hard-delete UI and stayed only until disposable provider destruction.

No migration, remote operation, application removal or deployment-setting change. Repository Vercel configuration may build/deploy publication or merge; external settings are uninspected. Serving application behavior is unchanged. This PR completes verification preparation only; after authorized merge, continue #1363's bounded repair deliverable.
