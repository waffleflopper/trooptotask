# D15 Onboarding Web and History ownership

This intermediate #1363 deliverable moves packet presentation and lazy dialog delivery through Onboarding’s public Web seam. All 18 packet-list files move unchanged from the global UI folder into the feature. History becomes a thin route consuming the owned page with its existing Organization/scope guards. The active route consumes the owned Kanban entry and lazy modal loader; dialogs remain deferred. Obsolete shared component documentation and the exact old manifest root/exclusion are removed. There is no migration, provider-policy change, compatibility alias or shared Stepper change.

The affected baseline exposed a saved-stage display defect: History passed only disabled step descriptors, so the shared Stepper discarded the saved Reviewed selection. The owned History repair identifies the saved stage in visible text, supplies a known current descriptor and keeps every stage item disabled. Unknown saved stages remain visible without selecting a listed stage. Existing null-stage fallback remains unchanged. Two meaningful interaction cases fail before this repair and pass afterward; they assert saved values, disabled controls and current-step semantics.

## Acceptance and remaining issue scope

The declared slice covers active packet/dialog delivery and discriminating saved History: completed/cancelled/archived names, dates, Groups, templates, progress, saved known/unknown paperwork stages, saved Training snapshots, removed work, active-note text/time, keyboard disclosures, reload, scoped reads and Organization switching. Exact selected provider fields establish retained history and read-only effects. History has no note editor or author label; inactive notes are retained in provider readback rather than rendered. Disabled History controls establish that UI surface, not a new server terminal-mutation rule.

The same issue still owns raw packet/progress export reads, Add Person → saved packet, Calendar markers, Training source changes versus saved History, remaining valid actor/packet/step operations, non-reconciliation response ordering and note/lifecycle overlap, complete removals and integrated acceptance. Source hypotheses about those paths are not observed failures or passing proof. #1470’s accepted actual saved Switch/provider rollback and reconciliation-overlap proof applies to unchanged implementations; this run repeats Switch mount/cancel and assignment recovery through the new Web loader. #1363 remains open, with `08-M09-02a/b` unchecked. This PR uses `Refs #1363`.

## Distinct native observations

All three runs use the repository production-build environment, owned synthetic provider and native Chromium 152.0.7977.82 on Arch Linux. No maintenance or remote provider is used. Four helper-owned History Persons/packets discriminate Alpha, archived Alpha, excluded Bravo and foreign B. Five steps per packet retain unique notes and inactive work; Alpha has a matching Training record despite its saved incomplete terminal step. All setup IDs are ledgered before writes. Helper setup and provider reads are separate from native actions and ordinary authenticated route reads.

| Run                      | Frozen source / candidate                                                                                                                                                | Actual outcome                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unchanged Web baseline   | `50c4f391b24fe1d19ba955aa9550986c742d3523`; `c04b9152cd30c47ccbd8b84b9177e58551b4d63693b2587e8fa0076eaa9c6103`; 4,563 pre-launch hashes; origin `http://127.0.0.1:39587` | **Failed saved-stage display.** Reviewed had no current listed marker. Other selected History labels/notes/disclosures/reload, scoped reads, A → B → A, dialog mounts/cancels and assignment recovery pass with their recorded limits. This failure is retained, not credited as a passing cutover baseline.                   |
| Matching repair baseline | `07906951f2afe28aa68fcb79c7b26e8b756ad0f4`; `f42525d44b262ef7246a6f5293a0c80cca4242d77aedaf48e4a0e91b1313d25d`; 4,563 hashes; origin `http://127.0.0.1:43841`            | **Pass:** known Reviewed has one current listed stage; unknown Archived review has none. Both saved texts remain visible and all three controls disabled, immediately and after reload. Selected A/B packet/progress/Training fields remain unchanged. Other unchanged baseline observations retain their separate provenance. |
| Ownership candidate      | `4c7ba5f87bca92d3e27b752afa87d17302ee8f4c`; `2681987efe9b9935a7627e1d83eca78856349488c9697dd4b582dd2ab6ce418e`; 4,564 hashes; origin `http://127.0.0.1:37757`            | **Pass:** repeats the affected History/scope/dialog observations through the new owner entries. Ordinary History reads return 200 with exactly the allowed packet IDs; Alpha-only, empty and A/B views agree before/after reload.                                                                                              |

Native disclosures support Space/Enter and ArrowDown; opening the next packet closes the prior packet. Active paperwork notes retain their saved text/time after reload. Archived Alpha’s name remains; there is no archive-badge requirement. Terminal dates use actual provider values: completed dates are stored as dates, cancellation instants render in the browser’s local zone. Saved History Training stays incomplete despite matching current source data. Removed completed/pending labels and original March History remain; all selected terminal packet/progress/Training fields compare unchanged.

The new public Start dialog selects Baker through native search/Enter, shows the rendered selection/date and cancels without a packet write; an Onboarding-only actor has no Add Person control. A helper-owned legacy packet opens Assign Template. A synthetic client 503 preserves the dialog/selected template and exact saved parent/progress fields; retry from that same form returns actual 200. Saved parent selects A, with six saved/three active steps and all three original IDs/completion/stages/notes retained. Canonical fixture definition names differ from this legacy cohort, so the original rows become inactive; matching-name adoption is owned by #1470’s separate proof. Reload agrees, and Switch Template opens/cancels without changing saved fields. Client 503 is recovery proof, not provider rejection or transaction rollback.

Each run cleans helper seeds, compares original A/B selected packet/progress/Training fields, establishes temporary Person absence and an empty seed/grant ledger, rechecks every frozen input, runs final doctor and disposes the exact owned provider. Recorded container/volume/network inventories are empty and the private worker is absent. Whole-table/timestamp equality outside selected fields is not claimed. No held response or provider fault is left by these runs.

Control limitations remain explicit. The first baseline’s option lookup and selected accessible-name assertions failed before a Start submission; corrected native Enter plus rendered text/readback own the result. Those two errors were transcribed from tool results rather than saved raw stderr. In the final run, seed writes finished before History login, but final read-only setup snapshots overlapped that login because the coordinator started the driver before observing setup completion. Actual artifact times and unchanged-field comparisons are retained; no concurrent fixture mutation or second browser driver occurred. Subsequent driving stages complete sequentially. These control attempts receive no product-failure credit.

## Checks and independent acceptance

The saved-stage tests report two failures/three passes before repair and five passes afterward. The repaired source is transferred to the owned page with only the three route-to-prop substitutions; its state/functions/rendering are independently checked equal. The integrated candidate passes 12 affected suites / 105 tests and governance regression checks with 552 remaining findings versus base 565; no exception is added. Logs retain the unreachable offline provider values and short `TMPDIR` override. The owned launcher builds the final production application. Full exact-published-candidate CI/build and completed bot review remain required before merge.

Independent complete source acceptance passes at `4c7ba5f8`, including all 18 byte-identical moves, actual History equivalence, lazy dialog/context/rank props, direct consumers, fixture/recipe, catalog and manifest. Expanded artifact acceptance and final source review are tracked on the PR; artifact review is separate from another live execution. Packaging adds evidence files to the global candidate fingerprint after completed cleanup; tested source, executable helpers and driving instructions stay unchanged. It is not a fresh native run.

## Durable artifacts

Raw observations remain ignored/local. Packaged copies remove only the credential-bearing root-layout session data from ordinary SvelteKit reads, preserving response status, shell capabilities/scope, Onboarding nodes and all streamed chunks. The per-run sanitization record lists every redacted artifact and verifies those untouched portions. No request-header detail was captured. All textual payloads are checked for residual bearer/JWT/provider tokens and Cookie header lines; none remain. The archives preserve every other payload’s bytes, include an exact SHA-256 inventory, and are freshly expanded/hash-checked after owned cleanup.

| Archive                                                              | Payloads | SHA-256                                                            |
| -------------------------------------------------------------------- | -------: | ------------------------------------------------------------------ |
| [Failed baseline](d15-web-history-baseline.tar.gz)                   |      631 | `bc545987e7ca13f2e2c9a05bcb871903eb75f8ba58d350aad2685cce3619d9ea` |
| [Matching repair baseline](d15-web-history-repaired-baseline.tar.gz) |      214 | `04b42bafb56728c05c36753145e350c78c665270d1b28d8598194cf5c3fe3459` |
| [Final ownership run](d15-web-history-final.tar.gz)                  |      638 | `b5cde5150b18cceda275fe2728283640b74d4d42c37c5c1b671eda3f1ead0b80` |

This extraction example requires Python with `tarfile.data_filter` (tested with Python 3.14.7). It accepts only regular files and shares a 2,500-member / 32 MiB expanded-payload budget across all three archives, rejecting before writing an over-budget file. Actual use is 1,486 members / 9,886,803 bytes including inventories. These bounds cover expanded payloads, not all metadata/decompression resource use.

```bash
python3 - <<'PY'
from pathlib import Path
import hashlib, json, tarfile, tempfile
if not hasattr(tarfile, 'data_filter'):
    raise RuntimeError('Python tarfile.data_filter support is required')
root = Path('.verification/evidence/verify-trooptotask')
root.mkdir(parents=True, exist_ok=True)
remaining = [2500, 32 * 1024 * 1024]
archives = {
    'd15-web-history-baseline.tar.gz': 'bc545987e7ca13f2e2c9a05bcb871903eb75f8ba58d350aad2685cce3619d9ea',
    'd15-web-history-repaired-baseline.tar.gz': '04b42bafb56728c05c36753145e350c78c665270d1b28d8598194cf5c3fe3459',
    'd15-web-history-final.tar.gz': 'b5cde5150b18cceda275fe2728283640b74d4d42c37c5c1b671eda3f1ead0b80',
}
def bounded_members(handle):
    for member in handle:
        if not member.isfile() or member.size < 0:
            raise ValueError('Expected regular evidence files only')
        remaining[0] -= 1
        remaining[1] -= member.size
        if min(remaining) < 0:
            raise ValueError('Aggregate evidence extraction budget exceeded')
        yield member
for name, digest in archives.items():
    archive = Path('docs/stabilization/phase-08') / name
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == digest
    dest = Path(tempfile.mkdtemp(prefix='d15-web-review.', dir=root))
    with tarfile.open(archive, 'r|gz') as handle:
        handle.extractall(dest, members=bounded_members(handle), filter='data')
    expected = json.loads((dest / 'inventory.json').read_text())
    actual = {p.relative_to(dest).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in dest.rglob('*') if p.is_file() and p.relative_to(dest).as_posix() != 'inventory.json'}
    assert actual == expected
PY
```

#1470 is integrated and Robert reported its manual live migration application. This Web deliverable has no migration or additional hosted configuration requirement. Existing deployment settings remain uninspected; [RELEASE](../RELEASE.md#phase-08-d15-atomic-packet-reconciliation) retains the earlier application-drain obligation and the distinction between operator report and unperformed remote readback.
