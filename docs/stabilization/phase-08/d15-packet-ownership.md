# D15 packet ownership and atomic reconciliation

[#1470](https://github.com/waffleflopper/trooptotask/pull/1470) repairs a reproduced two-template assignment failure and moves packet server operations to Onboarding. The repaired production candidate `9c5a477df68d2d780b4bbb40f50311dee185fa98` passes matching native/API and isolated SQL proof. Complete independent source/artifact acceptance passes at `391645e3`, with subsequent prose accepted separately; complete corrected CI passes at `801b3a4d`. Final publication checks and completed reviews are recorded on the linked PR. **This PR contains a migration and stays unmerged for Robert’s manual database step.**

## Outcome and issue scope

Onboarding owns lifecycle, scoped policy/query, progress/notes, packet mapping and reconciliation through narrow public Server operations. API/workspace delivery and Dashboard consume the owner; replaced central operations/entities and the unused progress entity are removed. Dashboard keeps saved active snapshots under its existing Personnel scope without requiring an Onboarding/Training lane or recomputing saved Training work; the screen’s optional authorized Training projection remains unchanged.

The ordinary authenticated `reconcile_onboarding_packet` provider replaces the multi-write diff. SQL locks the packet before reading its selected template, rechecks Configure and current Person scope after waits, and locks existing progress in stable ID order. Parent selection, additions, metadata refresh and inactive history commit together. SQL errors roll back the operation; application audit remains separate. The client saves returned template and steps together, including resync from a stale card.

First assignment adopts only active exact-name/type legacy rows, at most once. It retains IDs, completion, valid paperwork stages and notes; unmatched work stays inactive. Linked inactive history can be reused, but ordinary resync does not adopt deleted/unlinked history by name. Invalid paperwork stages retain the existing intentional reset behavior. Returned steps follow saved order. No new uniqueness constraint or historical cleanup is introduced.

| Acceptance scope                                                                                                          | Status                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verification preparation, recovery and scheduled packet retention                                                         | Integrated #1463, #1466 and #1468; their applicable proof retains its original limits.                                                                |
| Packet Server ownership, routes/workspace/Dashboard, transactional reconciliation and current-template client consumption | This PR; matching repaired proof passes, final review/CI gates pending.                                                                               |
| Web/history/export ownership and complete reverse consumers                                                               | Remaining #1363 work: owned exports, Calendar marker, Add Person and broader Training/history obligations.                                            |
| Broader access and same-Organization edits                                                                                | Remaining issue acceptance; this RPC does not serialize template editing, direct writers, all note/lifecycle operations or general response ordering. |

This intermediate deliverable uses `Refs #1363`. The issue stays open and its dependencies remain blocked until every requirement is integrated. Prepared Web work remains separate; the migration boundary stops this continuation before another deliverable.

## Preserved baseline and historical proof

The [original packet receipt at `cf19a578`](https://github.com/waffleflopper/trooptotask/blob/cf19a578b25fb15c5e2266a69dfe747bc89aaac6/docs/stabilization/phase-08/d15-packet-ownership.md) preserves the original multi-write implementation, 29-file CLI review, complete source/expanded acceptance, native ordering/recovery/history/access/Dashboard observations and capture limits. Its exact-head [Depot result](https://depot.dev/orgs/rvsvvkd4rp/workflows/th9jjnckjk?job=95j3f450xx) passed 626 suites / 5,660 tests, types 0/0, governance, links, build and Vercel. Completed bot approval did not resolve its actionable inferred assignment concern; the following baseline reproduced it. Those gates and the old no-migration/unchanged-schema statements are historical, not acceptance of this repaired candidate.

At `65b3056d`, application bytes still match `cf19a578`; the expanded recipe and 4,551 pre-launch hashes bind candidate `bcdca42e6d1c94d4cde259729c2d003e93430579119c1e7a0327def588449745`, origin `http://127.0.0.1:43443`, session `a06416a6-e757-48f9-8ffe-737bacba499e`. Two independent ordinary app actors submit different templates to one null-template packet. Both actual progress-writer waits reach the held Orientation row, then both return 200 after rollback. The B-selected parent has seven saved/five active rows, including two A definitions; native card/reload show duplicate tasks and 1/5. Original IDs/work/stage/notes are retained. Each response contains only its own five rows/three active. No note-loss or request-order claim. The first attempt remains inconclusive: both 500 provider timeouts, no observed writer waits and no changes.

The 385-payload baseline retains actual restoration/disposal and independent expanded acceptance. Its original archive bytes are preserved inside the consolidated bundle. Selection/setup driver mistakes, transcribed rather than raw first-driver traceback, omitted timestamps and packaging-stage pending-review notes retain their stated limits.

The older 77-payload Dashboard baseline reconstructed its 4,542 hashes after cleanup and lacks B equality and exact active-provider/disposal inventory; it earns no pre-launch or exact-disposal credit. The 887-payload packet run captured inputs before launch, actual first-write 500/same-dialog 200, ordering, API reopen/note and native History readback, ten valid-body denials and scoped Dashboard views, with selected-field restoration/disposal. Deleted-definition resync numeric status/body was not retained; there is no native note editor or second independent live execution. Those observations apply to unchanged surrounding paths, not the new transaction guarantee.

## Repaired SQL and native observations

Final frozen source/recipe is `9c5a477df68d2d780b4bbb40f50311dee185fa98`; native candidate is `45d535c19382dc75898bdbfcdd0048eebdb9478020f730f5a36749e4ddc0227d`. All **4,562 input hashes** were captured before launch and rechecked unchanged after final doctor/owned disposal. Origin `http://127.0.0.1:45099`, session `3100ad5d-ead5-4bba-a251-e7fcb3520fa4`, project `t2t-verify-1f4e7a89899149cea8e69f48`, native Chromium 152.0.7977.82 Arch Linux. Ownership/config/ports/container identities and exact actions/probes are retained. No existing local or remote provider was used.

| Boundary                          | Actual result and limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fresh SQL and populated upgrade   | Final runner exit 0; all 248 frozen inputs unchanged. Fresh replay of 160 migrations passes 49 suites / 1,301 assertions. New behavior/concurrency/scope suites pass 42/31/15 assertions. Ordered 140+20 migration upgrade retains all 30 whole Onboarding-related rows, then passes nine scoped reconciliation checks. Both exact disposable projects/directories are absent.                                                                                                             |
| SQL behavior and rollback         | Ordering, legacy adoption/history, metadata/stages, linked reuse, repeated IDs, foreign/no-template/terminal rejection and full-row no effects pass. Actual early insertion and late parent failures roll back and permit retry. Completed packets reject both switch and resync with all saved dates/work/notes unchanged.                                                                                                                                                                |
| Actual competing SQL transactions | Observed waits cover same/different templates, switch→resync, failed contender preserving the winner, committed notes/checkbox work while progress is held, another packet’s independence, Configure revocation and a Person leaving the caller’s Group before a parent wait releases. The reassignment is synthetic fixture setup; it does not prove the separate Personnel edit endpoint.                                                                                                |
| Actual two-actor app overlap      | Two normal app sessions warm foreign-template 404/no effects, then reach observed RPC backend waits through the bounded holder. Both return 200 with individually coherent three-active-step responses; final B has eight saved/three active rows, no other-template active definitions or active duplicates. All original work/notes remain. Holder rollback/absence, native card/reload and repeat ordinary resync with unchanged progress IDs/fields pass. No winner/order requirement. |
| Native assignment failure/retry   | Fresh legacy cohort: the exact Orientation-bound 23514 fault yields actual 500, visible error, retained dialog/selected A and unchanged selected parent/progress fields. Owned fault objects are removed/count zero before the same dialog retries without re-entry. Actual 200 saves A with five rows/three active, retains all original work/notes and agrees immediately/reloaded. This native fault is an early write; the SQL suites own late rollback proof.                         |
| Native assigned switch            | Normal A→B Switch Template returns 200, retains eight saved/three active and all original work/notes. Immediate card and reload agree.                                                                                                                                                                                                                                                                                                                                                     |
| Native stale-card resync          | While the card shows B, another ordinary actor saves A. Provider confirms A while rendered card stays B. Native Re-sync 200 immediately displays A/1-of-3 and matching active steps; all eight selected progress rows equal the already saved A state. Reload agrees. This is a separate stale-client check, not a simultaneous response-ordering case.                                                                                                                                    |
| Restoration/disposal              | Native temporary copies and both helper cohorts removed; all eight original A/B parent/progress/template/definition selected-field comparisons pass. Empty ledger, final doctor/cleanup, exact empty container/volume/network inventory and private worker absence pass. Timestamps/other tables are outside those UI helper comparisons.                                                                                                                                                  |

Four new native request-detail Cookie headers are redacted; complete request/response body files are retained. The first selection driver incorrectly asserted that the accessible name contained the selected value and stopped before submitting. That name stays “Template”; corrected native selection plus read-only rendered text and the actual request own the result. That first tool-returned assertion is transcribed, not raw subprocess stderr. Subsequent driver stdout/stderr are retained. No product-failure credit is assigned to these control attempts.

Focused final checks pass **4 suites / 39 tests**, types **0 errors / 0 warnings**, scoped lint and governance without regression. The new store regression failed on stale A before the fix and passes on returned B afterward. An initial missing-script invocation, shared-temp inode failure and corrected source-cycle failure retain their failed status; corrected commands/checks pass. The original 46-suite SQL result and the initial `c14d5d52` integrated run are supplemental historical proof; final SQL acceptance is the current run above.

## Durable evidence and review

The [packet evidence bundle](d15-packet-evidence.tar.gz), SHA-256 **`e931be170416198aee8d242ebd20d1adc3215a4e488dff9642976e340b9296bc`**, contains eight inventoried outer payloads. Expand and hash-check every nested archive as well as the outer inventory. Three original unmerged archives are preserved byte for byte; the consolidation keeps the complete PR reviewable without excluding source or tests. Expanded artifact acceptance is separate from CodeRabbit source review.

| Nested archive                                                      | Payloads | SHA-256                                                            |
| ------------------------------------------------------------------- | -------: | ------------------------------------------------------------------ |
| `d15-dashboard-baseline.tar.gz`                                     |       77 | `4ad68ee5563b99c9fb5f3684d64e00f9bfa8149f4dd28e8d5a15f5fbbcf1a59a` |
| `d15-packets-final.tar.gz`                                          |      887 | `16f1a86e83443f4b51724c901dba35b5c16d54e3f1c864cc0ea72b0420120d71` |
| `d15-first-assignment-baseline.tar.gz`                              |      385 | `96af54eeb08a760ef85dd71c2105c84e295cada4ee74ae7eb5384043a276c49c` |
| `d15-reconciliation-database-final.tar.gz` (initial integrated run) |        7 | `53fc0819308c9d7a32d21baf6051fa183550df30494ce3ead51358b971326c3e` |
| `d15-reconciliation-database-current.tar.gz`                        |        7 | `eede12b725d43cb7621eef5b940c85b09c64aaeda255a5a0399f3c55e677b6e0` |
| `d15-reconciliation-atomic-final.tar.gz`                            |      879 | `1db0962fca50b210dc6ba23f3d23180509fd0d60bc0531075ff41db021adc074` |

Root expands all six archives, verifies exact inventory sets/every hash and finds no credential-pattern hits. Packaging follows completed runs/cleanup; it changes artifact bytes in the candidate fingerprint, not tested application/recipe inputs. Independent acceptance of the complete `bb524e45 → 391645e3` diff covers 50 logical files / 59 old-and-new paths, all eight outer and 2,242 inner payloads, the reconstructed 4,562 native/248 SQL inputs, recomputed raw outcomes and restoration/disposal. This is source/artifact acceptance, not another live execution. The separately owned D13 integration preserves its code, deletions, evidence/tasks and continuation-authorization record.

Committed CodeRabbit CLI review at `391645e3` completes all 49 readable files; the single binary bundle is accepted expanded independently. Its minor catalog-count suggestion is resolved by clarifying that the owner table includes later additions: the archived Phase 06 catalog actually contains 93 functions, so that historical count remains correct. Hosted review through `391645e3` completes with no remaining app defect; its low-priority manual-extraction concern is addressed below. The generic 20% docstring metric identifies no missing contract and is not a repository acceptance requirement. The four-file record/formatting CLI follow-up completes with zero findings. The extraction follow-up reviews both changed documents and requests an explicit Python capability requirement and tested version; those are now included below. Final changed-record review and exact-head publication checks are tracked on the PR. [CI at `391645e3`](https://depot.dev/orgs/rvsvvkd4rp/workflows/qd6zqtlw8k?job=smg2qjdzqz) passes 627 suites / 5,660 tests, type checks, lint, governance and production build; database contracts pass. The repository/application job fails changed-document formatting in two files. Corrected [CI at `801b3a4d`](https://depot.dev/orgs/rvsvvkd4rp/workflows/xkhlkv0bzm?job=52qb10mbpx) passes the complete application/database sequence, including the formerly failing document checks and 160 document links. Types report zero errors/warnings; governance retains 565 owned findings with no regression. The two Calendar lint warnings, Rating export chunk warning and optional OpenTelemetry dependency warning are unchanged limits, not failed checks. All application, migration, maintained recipe and archive bytes remain identical to their accepted inputs; only the records/extraction example change afterward.

The extraction recipe shares a 2,500-member / 32 MiB payload budget across the outer and all nested archives, checks each member before writing it and accepts only regular files. The present bundle uses 2,257 members / 23,058,431 expanded bytes including inventories and nested archive bytes. Actual full expansion/hash validation passes; synthetic byte/member overruns reject before the offending file is written. This bounds unpacked evidence payloads, not all decompression or metadata-parser resource use. The recipe requires Python with `tarfile.data_filter` support and fails before creating extraction directories when that capability is missing. Exact expansion and rejection probes use Python **3.14.7**; no compatibility with interpreters lacking that capability is claimed.

```bash
set -e
sha256sum --check <<'SHA256'
e931be170416198aee8d242ebd20d1adc3215a4e488dff9642976e340b9296bc  docs/stabilization/phase-08/d15-packet-evidence.tar.gz
SHA256
mkdir -p .verification/evidence/verify-trooptotask
python3 - <<'PY'
from pathlib import Path
import hashlib, json, tarfile, tempfile
if not hasattr(tarfile, 'data_filter'):
    raise RuntimeError('Python tarfile.data_filter support is required')
root = Path('.verification/evidence/verify-trooptotask')
remaining = [2500, 32 * 1024 * 1024]
def bounded_members(handle):
    for member in handle:
        if not member.isfile() or member.size < 0:
            raise ValueError('Expected regular evidence files only')
        remaining[0] -= 1
        remaining[1] -= member.size
        if min(remaining) < 0:
            raise ValueError('Aggregate evidence extraction budget exceeded')
        yield member
def expand(archive):
    dest = Path(tempfile.mkdtemp(prefix='d15-review.', dir=root))
    with tarfile.open(archive, 'r|gz') as handle:
        handle.extractall(dest, members=bounded_members(handle), filter='data')
    expected = json.loads((dest / 'inventory.json').read_text())
    actual = {p.relative_to(dest).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in dest.rglob('*') if p.is_file() and p.relative_to(dest).as_posix() != 'inventory.json'}
    assert actual == expected
    return dest
outer = expand(Path('docs/stabilization/phase-08/d15-packet-evidence.tar.gz'))
for entry in json.loads((outer / 'manifest.json').read_text())['archives']:
    archive = outer / entry['archive']
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == entry['sha256']
    dest = expand(archive)
    assert len(json.loads((dest / 'inventory.json').read_text())) == entry['payloads']
PY
```

## Manual migration and stopping point

The additive [migration](../../../supabase/migrations/20261001000200_atomic_onboarding_reconciliation.sql), SHA-256 `245ae146ac8babff887c51c4c07860e8d041a0dabf3510628142854b54f9d623`, adds the ordinary authenticated RPC and schema-reload notification without changing existing rows/table policies/constraints. It does not automatically reconcile old mixed packets. [RELEASE](../RELEASE.md#phase-08-d15-atomic-packet-reconciliation) records Robert’s ordered manual application before merge/release, draining older multi-write instances and compatible rollback. Without this function the new app cannot assign/switch/resync.

No agent remote inspection/application or existing-local migration occurred. Complete the current CI/review gates, then stop with this verified migration PR unmerged. Robert’s migration confirmation and applicable merge authority govern the next step. External production deployment settings remain uninspected. #1363’s remaining deliverables do not advance at this boundary.
