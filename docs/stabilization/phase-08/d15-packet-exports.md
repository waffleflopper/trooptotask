# D15 — Saved packet and progress exports

This intermediate `Refs #1363` deliverable moves raw packet/progress reads behind Onboarding’s public Server entry. JSON and Excel delivery supply the two owned reads alongside the already-owned template reads. Organization export orchestration, its twelve-section batching, ordinary request-store RLS, Organization export admission, lifecycle/audit and workbook layout remain unchanged. The generic fallback no longer names these two Onboarding tables. No migration or privileged packet reader is added.

The changed-read contract checks preserve arbitrary saved fields, empty results, inactive work, notes, nulls and an unknown same-Organization stage. Actual Supabase-store traversal covers 1,001 rows and a later-page provider error separately for each table. Both delivery-route failure cases retain the original error, fail the export record once and produce neither bytes nor a successful export audit. Existing success checks cover artifact bytes, completed tracking, audit and notification. These are source/test observations, not a live provider-fault run.

## Selected coverage and observed results

The [packet recipe](../../../.agents/skills/verify-trooptotask/features/onboarding-packets.md#raw-and-readable-packet-exports) selects ordinary owner downloads, denied export admission, saved raw/readable data, reload and client-error recovery. Training matching and the prior packet/History repairs are reused only for unchanged source; this deliverable does not claim the remaining Add Person/Calendar/Training or general packet-concurrency journeys.

| Run                                       | Frozen source                              | Candidate digest                                                   | Inputs | Origin                   |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ | -----: | ------------------------ |
| Before read cutover                       | `1626a27e764ddfde2c9b189f00a7f5385f423fb9` | `04133571de47c8d79176ac1ece542651c4ad0720a88c21febf6f60bab4acd4fd` |  4,567 | `http://127.0.0.1:46261` |
| Owned reads on integrated main `62c8d820` | `bf2e97a6826addf60d225a7eb0554d26ddb247b4` | `9afefabad936d26641800e2b4a4e9cc301586177bfffd855a77b2b4974ff20da` |  4,582 | `http://127.0.0.1:40547` |

Both production-mode `npm run verify:app -- launch --worker 1` sessions use isolated synthetic providers and native Chromium 152.0.7977.82 on Arch Linux. One coordinator runs the browser; the final driver runs setup, visible journeys and readbacks sequentially. `TMPDIR=/home/waffleflops/.cache/t2t-d15-tmp` supplies the short temporary path. Archived launch/doctor files identify exact project resources and ports; archived driver inputs, snapshots, actions, headers and downloads establish the observations.

Both runs pass:

- Normal owner sign-in → visible Organization Settings → Exports → actual JSON and Excel download clicks. Both successful ordinary POSTs return the expected public content type and download filename. The captured artifacts retain every original byte.
- All five Organization A parents and 21 progress rows match complete saved fields and current schema key sets, including parent `created_at` and progress `updated_at`. JSON top-level/section rows and inventory agree; Excel raw headers/cells and inventory agree. The separate readable worksheet preserves Person/status/start/completed/cancelled values. Notes, inactive work and stages are raw-section claims. A saved terminal Training completion remains false despite a matching Training record. Organization B’s parent/five progress rows are absent.
- Reload preserves controls and saved data. Each of the three successful native downloads records one completed A export with the ordinary requester, actual byte count and completion timestamp. B export tracking remains unchanged. A downloaded artifact may contain its own processing tracking row because completion follows serialization; this is not one atomic whole-export snapshot.
- The Onboarding-only Configure actor sees restricted Settings. Separate valid ordinary JSON/Excel POSTs both return 403 without packet/progress, selected Training or export-record effects. The A owner’s corresponding foreign-B POSTs both return 404 under current Organization admission/RLS, also without effects. These exact-method/path/body observations are distinct from browser interaction.
- An injected client 503 produces visible failure, no Blob, no tracking row and unchanged saved rows; a real retry using the same control succeeds with JSON bytes and completed tracking. This is client recovery proof, not an actual provider rejection.

The baseline driver initially expected foreign 403 and stopped at the correct 404. The original capture/failure log, corrected driver and successful continuation remain archived. Two baseline bootstrap import typos occurred before any helper/browser invocation. Neither is a product defect. The final driver has no failed attempts. The foreign unknown `Archived review` stage is excluded; same-Organization unknown-stage retention is covered by the source contract, not this native cohort.

Every network/Blob hook is restored. Cleanup compares every original A/B packet/progress field, including timestamps, and the selected Training fields; all are unchanged. All five temporary Persons are absent, seed/grant ledgers are empty and all frozen inputs match. Three newly created export rows remain until exact owned provider disposal. Final doctors pass; the exact project’s containers, volumes, networks and private worker are absent. Neither run touches remote or existing local development data.

## Checks and acceptance

Baseline focused checks pass seven suites / 45 tests. After integration on fresh main `62c8d820`, eight affected suites / 53 tests pass at `bf2e97a6`. The isolated implementation worker’s type check passes with zero errors/warnings at `8292e6dd` on the earlier preparation base; it is not a full-candidate CI claim. Source-stage independent acceptance of all eighteen readable files at `bf2e97a6` finds no actionable application/preparation defect; its stale bounded checkpoint wording is corrected here. Complete final source/expanded-artifact acceptance and CodeRabbit review are pending. Full exact-publication-head Depot DoD/build and completed clean hosted review remain merge gates.

The main-base advancement incorporates separately owned D13 #1473. Its application changes do not alter these nine export source/test paths or Onboarding’s source. Matching final proof above runs the integrated candidate. Subsequent packaging adds only the two binary evidence archives to executable fingerprints; record-only Markdown edits do not represent another native run. The post-packaging comparison passes: all 4,582 frozen hashes remain unchanged and exactly the two new archives are added.

## Durable observations

All raw payloads are byte-identical in the archives. Text captures and XLSX XML/relationships pass a credential-pattern scan; no redactions were needed. No request-header details or root-layout sessions were captured. Each archive includes `sanitization.json` and a SHA-256 inventory of all payloads except the inventory itself. Root freshly expands both archives and verifies every payload hash; packaging integrity alone does not establish behavior.

| Archive                                | Payloads | SHA-256                                                            |
| -------------------------------------- | -------: | ------------------------------------------------------------------ |
| [Baseline](d15-export-baseline.tar.gz) |      658 | `b13b25fa4dcd5021d399ae09925111c0049ada809fb0f44d178f640cf1d142b3` |
| [Owned reads](d15-export-final.tar.gz) |      653 | `5ab0eec4cc1ec18834afefa3ac44dd40926a92e999d78b450d1e76cabc169be6` |

This example requires Python `tarfile.data_filter` support (tested with Python 3.14.7). Only regular files are accepted, with a shared 2,500-member / 32 MiB expanded-payload budget across both archives. It rejects before writing an over-budget member. Actual use is 1,313 members / 6,073,990 bytes including inventories. The bounds cover expanded payloads, not all metadata/decompression resource use.

```bash
python3 - <<'PYTHON'
from pathlib import Path
import hashlib, json, tarfile, tempfile
if not hasattr(tarfile, 'data_filter'):
    raise RuntimeError('Python tarfile.data_filter support is required')
root = Path('.verification/evidence/verify-trooptotask')
root.mkdir(parents=True, exist_ok=True)
remaining = [2500, 32 * 1024 * 1024]
archives = {
    'd15-export-baseline.tar.gz': 'b13b25fa4dcd5021d399ae09925111c0049ada809fb0f44d178f640cf1d142b3',
    'd15-export-final.tar.gz': '5ab0eec4cc1ec18834afefa3ac44dd40926a92e999d78b450d1e76cabc169be6',
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
    dest = Path(tempfile.mkdtemp(prefix='d15-export-review.', dir=root))
    with tarfile.open(archive, 'r|gz') as handle:
        handle.extractall(dest, members=bounded_members(handle), filter='data')
    expected = json.loads((dest / 'inventory.json').read_text())
    actual = {p.relative_to(dest).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in dest.rglob('*') if p.is_file() and p.relative_to(dest).as_posix() != 'inventory.json'}
    assert actual == expected
PYTHON
```

#1470 and #1474 are integrated. This deliverable has no migration or additional hosted configuration requirement. Existing production deployment settings remain uninspected; [RELEASE](../RELEASE.md#phase-08-d15-atomic-packet-reconciliation) retains the earlier application-drain obligation and Robert’s reported migration application without agent remote readback. `08-M09-02a/b` and #1363 remain open for Add Person/Calendar/Training reverse consumers, remaining valid packet operations, non-reconciliation concurrency and integrated issue/removal acceptance. D13 remains independently owned.
