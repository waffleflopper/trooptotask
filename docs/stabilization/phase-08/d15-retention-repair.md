# D15 safe scheduled packet retention

## Outcome and scope

Expanded intermediate [#1468](https://github.com/waffleflopper/trooptotask/pull/1468), #1363 / D15 / `08-M09-02p` and the bounded retention portion of `08-M09-02b`. Valid hosted feedback blocked the admission-only proposal because it would activate the configured daily job before known history-loss/race failures were repaired. This candidate keeps admission and retention correctness together.

Onboarding owns expiry, narrow persistence and the provider mutation through its public server seam. Each batch contains at most 100 IDs from one terminal cohort. A single parent DELETE filters Organization, IDs, exact completed/cancelled status and the corresponding timestamp strictly before the same fixed cutoff used for discovery. It returns actual deleted IDs for counts. The existing parent-progress foreign key cascade removes checklist/history with that statement; no separate child DELETE precedes it. A parent failure rolls back that statement's cascade, and a concurrent reopen/recent re-cancellation is ineligible when the waiting DELETE rechecks its predicate. Prior successful batches and awaited administrator-notification failure retain existing partial-commit semantics; no whole-job transaction is promised.

Delivery verifies the existing job credential before constructing the admin client, supplies settings/notifications and consumes public Onboarding operations. Pure UTC/clamped-month cutoff arithmetic is Shared; Scheduled Maintenance retains Organization settings mapping. Replaced central retention operation/test paths are removed, with no compatibility export or migration. Packet lifecycle/query/progress/resync and Web/export ownership remain the same issue's work.

## Baseline and current gates

The [baseline receipt and two durable archives](d15-reconciliation-baseline.md) preserve actual legacy/null-reference failures, credential admission, parent-fault/history loss, both eligibility races and successful 1,002-record traversal. The unsafe admission-only candidate is not accepted for merge. Unchanged client recovery evidence remains applicable; no packet UI/store is changed by this retention repair.

Focused integrated retention/provider/archive/endpoint/Identity/secret checks pass 6 files/ 70 tests. Provider tests interpret actual SDK wire predicates against independently specified retained rows; actual PostgreSQL fault/cascade/lock proof remains separate. Types pass with zero errors/warnings; governance reports 584 inherited findings and no regression, six fewer than the base. Fresh production/provider proof passes below. Independent complete-diff/expanded acceptance and full committed source review pass at `71fc3c6a`; exact-head CI/build and completed hosted review remain merge gates. No migration or remote action.

Continue only #1363 after acceptance: legacy/null-reference repairs, packet/step/policy/query/lifecycle/progress/resync ownership, Web/export/reverse consumers/removals and remaining security/concurrency proof. This PR uses `Refs #1363`; it does not complete the issue or unlock dependents. Robert authorizes non-migration merge only after exact-head green CI and completed bot review with no actionable feedback.

## Frozen repaired run

Owned worker 1 production run uses revision `9295db4f23e0aae44f36471108a77f982515b36f` plus captured `tested.patch` and four separately inventoried untracked source files. Candidate `679214cd596d08737cd0805d9e479f520980639eb7817edeeff4f5ce6f6570a9` matches all 4,533 captured input hashes; origin `http://127.0.0.1:46405`, session `6ed71c5b-96f4-44f0-b625-db5c03e4db1e`, project `t2t-verify-3cebaa16cfc14abb82983af6`. Node 24.21.0/npm 11.19.0, Supabase CLI 2.101.0 and native Chromium 152.0.7977.82 use the same task-owned short TMPDIR as the baseline. Fresh migration replay is owned setup, with legacy seeds disabled. Schema/SQL bytes are unchanged, so the baseline's isolated 46-file/1,213-assertion SQL result remains applicable. No new SQL-suite execution or remote operation is claimed.

| Boundary                | Actual repaired observation                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admission               | Missing/wrong credentials return 401 with unchanged selected A/B packet/progress/notification rows. Valid generated credential reaches the real job.                                                                                                                                                                                                                                                                                                                               |
| Parent fault            | Seed-restricted PostgreSQL parent DELETE fault produces 500. Faulted expired cancelled parent and exact progress/note fields survive. Earlier expired completed parent/progress are already deleted; no summary follows the failure. This proves statement safety and declared partial commit. Trigger/function are removed and verified absent before seed cleanup.                                                                                                               |
| Reopen/re-cancellation  | Fresh seeds hold a transition while the job discovers the old expired cancellation. Observer proves parent DELETE waits on the exact holder; commit makes the target in-progress/null-cancelledAt or recently cancelled. Both jobs return 200/deletedCount 1/orgsAffected 1, delete only the expired completion, retain the changed target and exact progress/note, and finish with held backends absent. These are controlled provider transitions, without native reopen credit. |
| 1,001 completed packets | 1,008 parents/progress include 1,001 expired completions, one expired cancellation and six sentinels. Job returns 200/count 1,002/one affected Organization. Only expired parents/progress disappear; recent/null-terminal/active A, recent B and original March history remain. Three administrator notifications report 1,002. Native menu/screenshots show the summary before/after reload. Repeat returns 200/zero/zero with no row or notification changes.                   |
| Restoration             | Helper cohorts are removed; original selected packet/progress business fields remain and no seeded active packet survives. Recorded 15 fault/denial and 24 retention/race comparisons pass. Final doctor, cleanup and exact local Docker project-label empty inventory pass. No existing local or remote database is used.                                                                                                                                                         |

The frozen probe is the corrected multiline-JSON version from the baseline. Exact sanitized action/helper/probe inputs are retained; generated credentials stay private. Readbacks prove selected business fields, including note author/timestamp/text, rather than omitted whole-row timestamps. Administrator sign-in/menu/reload are native; privileged seed/SQL/job/provider checks are identified separately. Unchanged client recovery evidence remains applicable; no native packet creation or new security matrix is claimed here.

After disposal, the lifecycle header was clarified from auto-archive to expiry-based permanent deletion. `frozen-lifecycle.ts` and a TypeScript comparison preserve this comment-only difference and identical emitted JavaScript. Later prose/ownership-table correction and package bytes do not relabel the tested digest. Publication packaging changes no runtime/control/recipe behavior.

## Durable repaired evidence

[Repaired archive](d15-retention-repair.tar.gz): **260 payloads**, SHA-256 **`c1851ba59ff9d35a0ece20c2693c7be5ee09b2f2ded95ed20c62a68d94e79700`**. Inventory excludes itself and maps every original relative payload name to its sanitized expanded-byte hash. Fresh local extraction confirms exact file set/all hashes. Synthetic-only inspection found no credential-pattern hits. Both baseline archives remain byte-identical and retain their failed observations.

```bash
set -e
sha256sum --check <<'SHA256'
c1851ba59ff9d35a0ece20c2693c7be5ee09b2f2ded95ed20c62a68d94e79700  docs/stabilization/phase-08/d15-retention-repair.tar.gz
SHA256
mkdir .verification/evidence/verify-trooptotask/d15-retention-review
tar -xzf docs/stabilization/phase-08/d15-retention-repair.tar.gz -C .verification/evidence/verify-trooptotask/d15-retention-review
python - <<'PY'
from pathlib import Path
import hashlib, json
p = Path('.verification/evidence/verify-trooptotask/d15-retention-review')
expected = json.loads((p / 'inventory.json').read_text())
actual = {f.relative_to(p).as_posix(): hashlib.sha256(f.read_bytes()).hexdigest()
          for f in p.rglob('*') if f.is_file() and f.relative_to(p).as_posix() != 'inventory.json'}
assert actual == expected
PY
```

Independent final acceptance passes the complete 30-file logical diff (27 readable files and three archives; 32 paths when the two renames are counted separately). It verifies all 260 new payload hashes/original bytes, all 4,533 frozen inputs/digest, both unchanged baseline archives, and individually recomputes claimed provider/native outcomes and restoration from raw observations. Native menu/reload screenshots and independent emitted-JavaScript equality pass. This is source/artifact acceptance, not another live execution or model diversity.

Committed CodeRabbit CLI review against `a49667a3` completed at `71fc3c6a` with zero findings, explicitly covering all 27 readable files; three unsupported binary archives receive the independent expanded acceptance above. This supersedes the partial initial tracked-file review. Later acceptance-record edits change prose only. Final exact-head CI/build and completed clean hosted review gate merge; the unsafe admission-only finding must be resolved through these repairs.

## Concurrent default integration

Accepted Personnel verification #1467 / `17ed8452` is integrated without changing its independently owned source/evidence. The shared control conflict retains both Onboarding fixture and Personnel HTTP imports; all admitted command branches remain intact, and seed cleanup additionally removes only this worker's Personnel HTTP cache after existing seed disposal. The status document retains both issues' checkpoints with D15 active here. Incoming app/provider/Onboarding and retention source bytes are unchanged. The frozen retention/provider/native observations remain applicable; this is inspected integration, not a new live execution. Affected helper syntax/behavior, document checks, independent integration acceptance and exact integrated-head CI/hosted review gate acceptance.

The automatic `71fc3c6a` Depot workflow failed before creating jobs because GitHub's PR merge ref was stale against the concurrent default update. It supplies no validation credit. Conflict resolution and the next published integration head request fresh CI; no failed workflow is relabelled as passing.
