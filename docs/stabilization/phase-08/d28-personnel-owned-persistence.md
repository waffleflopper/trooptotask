# D28 Personnel, Group and self-pin persistence

This intermediate #1376 deliverable replaces generic Personnel, Group and pin persistence with four owned interfaces and migrates every current direct and reverse caller. Supported user behavior, permissions, historical values and partial effects remain the contract. Complete source acceptance and eight selected native outcomes pass. Owned resources are closed. [PR #1560](https://github.com/waffleflopper/trooptotask/pull/1560) merges after exact-head CI and completed clean review, as recorded below.

## Scope and retained behavior

`PersonnelRosterReader` supplies admitted lists and archive counts. `PersonnelRecordPersistence` supplies records, slug references, import/backfill, lifecycle and metadata. `GroupPersistence` supplies catalog/reference/name reads and Group writes. `SelfPinPersistence` captures the current member and Organization for names, toggle and ordered replacement. Operations consume narrow method selections. Providers capture the ordinary request client, canonical Organization and copied read scope. Existing independently admitted Calendar, Training, ICT, Onboarding and Rating roster authorities remain separate.

The complete caller wave includes record CRUD/import/backfill, lifecycle and approval, roster/detail/workspace, ranks, sensitive-sheet/award/artifact/export metadata, Calendar, Training, ICT, Onboarding, Dashboard, Settings and Sign-in. Delivery retains unchanged neighboring row-family providers. Organization's existing settings reader owns contributor-label lookup. Concurrent workspace reads remain concurrent.

The Personnel and Group entities, their replaced mapping test, the generic batch context and unused record-based scope callback are removed. Global Entity/DataStore/query facades remain for their still-consumed Training, Onboarding and settings paths. No new migration, transaction, raw-mode flag, compatibility fallback or broader privilege is introduced.

Preserved contracts include complete stable pages/counts, nullable dates and Group joins, ordinary detail/history reads, scoped lists/import/backfill, named slug conflict metadata and bounded allocation, uncertain acknowledgements without automatic resubmission, nonjoined date-backfill acknowledgements, archive acknowledgement and cascade ordering, and self-pin delete followed by ordered insertion with its retained partial failure. Rank summaries continue counting all existing Person statuses.

## Baseline and affected verification

The [closed Personnel baseline and UI repair](d28-personnel-ui-repair.md) preserve their actual versions and observations. Group/pin implementations at private `52a8a036` match accepted main `15f6787b` before this cutover. Their native baseline passes remain unchanged-app proof. The two historical UI ISSUES and second-tab UNRUN are retained; #1552 separately accepts the repaired detail/editor/shared-session behavior. None is relabeled as a fresh persistence pass.

New SDK tests pass four suites and fourteen tests. Existing operation/detail/purpose-roster checks pass twelve suites and 168 tests; after a redundant parse removal only the affected 32-case record suite repeats and passes. Seven reverse-query suites pass 83 tests. Root composition exposes genuine integration gaps before repair; the failing detail/artifact suites and affected request tests pass afterward. Ten unaffected root suites retain their original passing proof. Two Calendar/Dashboard composition suites pass five tests, and the ICT request composition passes both cases. Toolkit controls pass 43 checks. Types report zero errors/warnings; changed lint/format pass. Governance passes with 157 retained findings and zero new regressions.

Initial fixture count-header omission, missing-provider import during incomplete integration, root composition failures, initial type errors and rejected test-support dependency shapes remain failed observations in the work record. They do not establish product regressions. The final source/behavior acceptance must cover their actual corrections. Two deliberate provider faults fail their specified checks before original bytes are restored.

Final native selection covers normal roster/scope, Group CRUD/retry/unassignment, self-pin persistence/recovery and one real held response through B, Person CRUD/date/null/slug, small import/backfill, lifecycle, shared Onboarding Add Person and representative reverse reads/workbook. Dense page/slug/uncertain-write/pin replacement cases remain lower-boundary proof. Unchanged #1552 UI behavior and undispatched pin-failure isolation retain matching historical evidence. This is a bounded affected selection, not another full historical matrix. Any repair repeats its failing case and justified adjacent behavior under the [verification contract](../../architecture/DEFINITION_OF_DONE.md#verification-after-a-fix).

## Final native acceptance

The production-mode native run tests `f70fa8c435809142ece5634becf8958976a12c00`, tree `7010fc2a7baebae8f3c7bd1ba7a01647a83d46bc`, worker 1 session `0652a7e3-93b2-45ea-9bbb-285d2c22cf3e`. Candidate digest is `77fcaa6da57ae7353fc82b6b50bb2112d9a44c4b07ee29dfc9a0df6082cf9292`, with owned origin `http://127.0.0.1:38189`. Runtime is Node 24.21.0, npm 11.19.0 and Chromium 152.0.7977.82. One native driver uses the maintained recipes and controls.

| Selected outcome             | Observed result                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roster and scope             | Search, clear, Group and A–Z controls, detail reads and Alpha-only roster pass. Separate ordinary authenticated mutation returns 403 with no effects.                                                                                                         |
| Groups                       | Controlled pre-dispatch 503 retains the draft and saves nothing. Explicit retry creates the Group, rename retains its ID, and deletion unassigns its temporary Person while retaining all other Person fields. Reload agrees.                                 |
| Own pins                     | Controlled 503 rolls back, explicit retry and reload persist the pin, and unpin restores originals. A real committed A response is held through visible B admission. Release leaves B quiet and unchanged. A return confirms persistence before cleanup.      |
| Person CRUD                  | Native creation, renamed canonical URL, stable ID, role and MOS, null ETS and retained DEROS all persist after reload.                                                                                                                                        |
| Small import and backfill    | Two CSV People save with exact values. One backfill changes only ETS, retains blank-input DEROS and leaves the other Person unchanged.                                                                                                                        |
| Lifecycle                    | Owner archive and restore preserve the complete row. Operate-only deletion returns 202 and leaves one pending request without archiving. Owner review returns 200 and archives that same ID. Four UI-created People are permanently removed through Archives. |
| Shared Onboarding Add Person | The custom rank and Alpha Person save and become selected in the outer form. Cancel creates no packet or progress. Personnel reload retains the saved row.                                                                                                    |
| Reverse consumers and export | Representative Calendar, Training, ICT, Dashboard, Archives and Sign-in reads retain current facts. One real 9,309-byte workbook contains the independently checked Person fields. Sign-in draft is canceled.                                                 |

All eight selected outcomes pass, with zero selected failures or unrun cases. Controlled 503 observations establish UI recovery before dispatch, not a provider outage. Dense cohorts, additional races, Storage and retention matrices are not fresh native claims. Independent artifact acceptance reports Standards GO and Spec GO after inspecting the expanded observations, workbook cells, preservation comparisons, frozen inputs and actual resources. This is independent review, not independent live execution or model diversity.

The 44 original A/B sets retain all 129 full rows, including 85 memberships. One full preclean and one postclean comparison agree. Temporary People, Group and pins are absent. The only retained append effects are one approved request, 22 expected notifications and 25 audits, removed with the disposable database rather than by privileged history deletion. Final doctor passes and all 2,379 frozen input hashes match. Supported cleanup passes. Independent and root checks confirm 18 processes, ten ports, five containers, one network, two volumes and the worker directory are closed or absent. All 41 preexisting containers, seven networks and 17 volumes remain preserved.

The initial Node 26.8.2 launch is BLOCKED by the adapter's unsupported runtime and closes before any native case. Its full build log is unavailable after worker disposal; captured failure and observed diagnostic remain explicit. Three driver assertions are corrected without product or input changes. Their failed observations remain in the archive.

## CI repair and review scope

The first [CI run](https://github.com/waffleflopper/trooptotask/actions/runs/37567742782) at `f70fa8c4` passes the required format, lint, governance, type, production-build and database steps but fails 12 tests across five stale fixture files. The fixture-only repair updates the fault injection and supplied ports while preserving all assertions. Only those five failed suites repeat, passing 33 tests. Touched lint and governance pass. Independent Standards, Spec and Comment Sicko acceptance reports GO with zero flags.

The repair is integrated as `2d3ebd9e` after actual closure. Each of its five file hashes matches the independently accepted bytes. Git's working-tree `c/` and `w/` prefixes produce a different patch hash from committed `a/` and `b/` prefixes; the contents match. Production source and native driving inputs remain unchanged. Subsequent prose-spacing and evidence changes are publication work. They do not relabel the native proof or require another native run.

Complete original 89-path source acceptance reports Standards GO, Spec GO and Comment Sicko GO. CodeRabbit CLI reviews all 89 paths and raises two prose-spacing findings, now corrected. Hosted review approves `f70fa8c4` after accepting the pre-existing malformed-input error classification as deferred [chore #1561](https://github.com/waffleflopper/trooptotask/issues/1561), likelihood Low. That defect remains unfixed and is supported by source comparison, not a passing malformed-request native observation. Final publication-head CI and completed review of changed material remain required. No SQL migration is included. Local native and provider proof does not establish hosted deployment parity.

## Durable evidence and privacy correction

The [final archive](d28-personnel-owner-final-f70fa8c4.tar.gz) preserves 923 sanitized raw payloads, their original inventory, 17 PNGs, one unchanged workbook and 35 metadata payloads. Its inside inventory covers all 959 payload files and expanded hashes. Root extracts into fresh ignored scratch space and verifies the exact file set and every hash. Archive SHA-256 is `86074cc174b7b177f1ccee3e0bd257183989e41570a250328086e59953ec87a5`.

`metadata/acceptance-amendment.md` supersedes the original worker report's blanket claim that no credential content was published. An early tool transcript printed a short token-bearing prefix from the disposable synthetic session. Later sanitation does not erase that disclosure. Token entries, their duplicate captured message and credential-capable Docker Command fields are redacted with original byte counts and hashes retained. Recorded scans are clear for the final sanitized raw text. The original report remains historical provenance, not an accepted blanket privacy claim.

To inspect the archive and verify its expanded bytes, run from the repository root:

```bash
mkdir -p .verification
PERSONNEL_EVIDENCE_DIR=$(mktemp -d .verification/personnel-evidence.XXXXXX)
sha256sum docs/stabilization/phase-08/d28-personnel-owner-final-f70fa8c4.tar.gz
tar -xzf docs/stabilization/phase-08/d28-personnel-owner-final-f70fa8c4.tar.gz -C "$PERSONNEL_EVIDENCE_DIR"
python3 - "$PERSONNEL_EVIDENCE_DIR" <<'PY'
import hashlib, json, sys
from pathlib import Path
root = Path(sys.argv[1])
inventory = json.loads((root / 'inventory.json').read_text())
expected = {entry['path'] for entry in inventory['files']}
actual = {str(path.relative_to(root)) for path in root.rglob('*') if path.is_file()}
assert actual == expected | {'inventory.json'}
for entry in inventory['files']:
    path = root / entry['path']
    assert path.stat().st_size == entry['bytes']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256']
print(f"PASS: {len(expected)} payload files and hashes")
PY
```

## Integrated acceptance

Accepted head `8735d96e83e307bf355b2b07008948e2670944fa` passes [exact-head CI](https://github.com/waffleflopper/trooptotask/actions/runs/37571570785), including Vitest, production build and isolated database contracts. Completed supplemental CodeRabbit CLI reviews all ten changed text files with zero findings. Hosted review completes for the same head with no actionable comments and a successful status. Its historical thread is resolved. The archive has separate expanded-artifact Standards and Spec GO. Final package and prose acceptance also reports Standards, Spec and Comment Sicko GO.

[#1560](https://github.com/waffleflopper/trooptotask/pull/1560) merges at `ad52c263f9064ad75d905e2ce9b1ed09577c50ce` on `2026-10-07T04:42:06Z`. Accepted and merged trees are both `7dfbf0619f8e8c75ae43f262cb1f3c89c8bf8488`. The earlier pending-gate statements describe publication before this integrated acceptance. #1376 remains open.

## Remaining D28 work

The [Training workflow repair](d28-training-workflow-repair.md) resolves the eight lower-boundary failures and passes both selected failed native cases. Its twelve later persistence families remain UNRUN. Onboarding, residual settings and final generic facade removal follow their current owned designs and affected verification. Final integrated acceptance still owns complete consumer/removal and retained security/provider evidence. #1376 stays open; D29/D30 and other issues remain outside this continuation.

The preserved private Calendar, Personnel and Training worktrees remain clean at `67fa5713`, `52a8a036` and `7d6c0a5c`. A new isolated Personnel source tree supplies the owned implementation; current-main integration never adopts their inherited Calendar patches blindly. No remote database is accessed and no existing local database is reset.
