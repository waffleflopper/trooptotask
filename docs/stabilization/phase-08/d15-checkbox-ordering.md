# D15 checkbox response delivery

Intermediate `Refs #1363`, branch `stabilization/1363-checkbox-ordering`, from merged atomic Start #1487 at `0398e04c073f81ca9eb01cb8870303f47095730c`. That squash tree exactly matches accepted `15ff849a` and its actual CI merge. All three final-head Actions jobs and completed approval passed; Robert reports the exact reviewed Start migration live. The [Start receipt](d15-atomic-start.md) preserves its evidence and limits. No agent remote readback or operation.

## Scope and observed repair

Native checkbox controls permit another selection while a save is pending. The existing store suppresses older confirmed Paperwork responses but did not include checkbox updates. With known persistence order complete → incomplete and the first real response held, the unchanged app displayed complete immediately after the newer incomplete response and after releasing the older response. Reload corrected it. Those two failed expectations remain in the baseline archive.

The repair puts checkbox updates into that same existing progress mechanism. A newer successful progress response suppresses older same-step projection/result fields; failed newer requests retain earlier saved/pending work and allow retry. Paperwork, independent steps/notes, the shared saved-state/log architecture, refresh and Organization/invalidation guards remain. Requests stay parallel; this does not promise a winner for unknown provider order or a later independent writer. No API/server/provider/schema change, migration or new abstraction.

The [maintained recipe](../../../.agents/skills/verify-trooptotask/features/onboarding-packets.md#reversing-a-checkbox-while-its-saved-response-is-held) owns the drive. Resync/template ordering, unused client-note subtraction, valid supported-interface accounting and final retention/composition acceptance remain with #1363. The note API/RPC and read-only History remain supported; no native note editor is claimed. Both a/b stay unchecked; no other issue is activated.

## Versioned evidence

| Boundary                  | Actual result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preparation               | Independent source/recipe review accepts corrected `b23b2dad`: legacy Orientation starts complete, so first save incomplete natively and verify real response/provider/reload. The earlier `653d2034` launch discovered that instruction mismatch before any actor/seed/mutation; matching doctor and exact disposal pass. Its distinct archive earns no product outcome.                                                                                                                                                                                                                                                         |
| Unchanged native baseline | Frozen `b23b2dad8bdb5a448d7e6585c346ade95d3cfef4`, candidate `58304026785958f1ef10e8e8de534a6102c170740d0a023cefe695576efeb3e4`, worker 1, origin `http://127.0.0.1:35763`, Chromium 152.0.7977.82, normal Onboarding-only Operate, fresh ledgered Alpha cohort `74749a64`. Complete PUT369/200 is held after exact persisted true; newer incomplete PUT370/200 saves false. Immediate and released native checked/2-of-3 both **FAIL** expected unchecked/1-of-3. Saved false and corrective reload/reopen pass. Full business bodies are saved before navigation.                                                               |
| Store regression/repair   | Isolated worker from `0398e04c` changes only store and adjacent tests. Four public-store cases cover older late200/503, newer failure with earlier pending success/retry, and refresh retaining notes/another step. Against unchanged source: 3 failed/30 passed. Final focused store/context/Paperwork/interaction/hydration: 5 suites/77 tests pass. These use fake deferred Responses; they do not establish real persistence order.                                                                                                                                                                                           |
| Matching final native     | Frozen `6e49b6d00287bc2b0ecb3e8f8eedafcf0c58b63f`, candidate `a419f350be11c42ea1dd9c8c40a8de404a1a2eed8f8b1f3156219d7b7fc3141b`, worker 1, origin `http://127.0.0.1:45721`, same browser/role and fresh cohort `69a36743`. Matching real complete PUT369/200 persisted/held → incomplete PUT370/200 persisted sequence shows unchecked/1-of-3 immediately, after older release and after reload/reopen. All pass, with the same step IDs, notes and unrelated Paperwork/Historic progress retained.                                                                                                                               |
| Recovery                  | Both native runs separately intercept one client503 completion: readable error, incomplete rollback and unchanged saved progress. Restore hook and retry visibly: actual200 full business body, saved complete, reload/expanded Completed checked. Native reversal returns incomplete. Interception is client recovery, not wire/provider rollback or admission evidence.                                                                                                                                                                                                                                                         |
| Preservation/cleanup      | Each actual native run compares all 12 unfiltered original A/B rowsets/15 rows equal in every helper-captured field; all 5 ledgered Person/parent/progress IDs are absent. Helper projections omit some schema fields: no all-column/whole-database claim. Thirty-nine frozen driving/application inputs remain unchanged through cleanup; final doctor matches candidate/origin/session. Exact five full container IDs, two volume names, full network ID, private directory and original supervisor identity are absent after supported owned cleanup. This is exact owned-resource proof, not global process/resource absence. |
| Local checks/environment  | Node24.21.0/npm11.19.0, compared with declared npm11.12.1 on CI. Local formatting, focused lint (existing Map warning), whitespace and types0/0 pass. The worker's initial environment-free type check fails on missing public Supabase exports; the actual rerun uses CI's synthetic `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` and passes. Regression and corrected check logs are preserved; the initial environment-free type failure is identified in worker metadata without its raw log. Ten unchanged network/feedback helper checks pass. Local production verification builds pass.                               |

All Server/provider/SQL, cron/export/Calendar/Training/Personnel ownership paths are unchanged by this slice. Earlier accepted security, retention and reverse-consumer proof applies only to those unchanged contracts; it is not another current-head database run. Required full candidate Actions/DoD/build and completed hosted review remain gates. The shared pstack methods are unavailable in the active catalog; project-local stabilization, engineering, native verification and finish-pr workflows supply the actual requirements.

## Durable artifacts and reader

| Archive                                                              | SHA-256                                                            | Inventoried payloads / members / expanded bytes |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| [No-scenario preflight launch](d15-checkbox-preflight-launch.tar.gz) | `140befa4241fcff938e6ce16511167000b0ca9f9ed5216e5caa439a838d81aa3` | 61 / 62 / 519,311                               |
| [Unchanged native baseline](d15-checkbox-baseline-native.tar.gz)     | `996086a64029119000067019c3e81578e94fe67516ab8ff7a46c24e01b0719f3` | 403 / 404 / 1,086,441                           |
| [Repaired native and lower checks](d15-checkbox-final-native.tar.gz) | `f3028e9f69836498b230038cb7c88af5c17c9f55c77e1bf73fcc5fd46a644f5a` | 422 / 423 / 1,110,880                           |

Total 889 members/2,716,632 expanded bytes stays within unchanged per-archive 2,500/32-MiB and shared 5,000/64-MiB budgets. Inventories exclude themselves and include the authored sanitization record. Every raw payload remains byte-exact. Private native request/response headers are omitted at capture; full ordinary business bodies remain. Credential-shaped literals are admitted only in their exact tracked frozen control/redaction-test sources, never in captured responses. Fresh bounded extraction, exact name sets and all expanded hashes pass. All predecessor archives remain immutable. Adding these archives/prose after disposal changes the whole checkout fingerprint; the original tested revisions/digests remain above, with source/input applicability assessed separately.

Before extraction, verify each archive's published SHA-256. Use a fresh ignored directory and Python `tarfile` with `filter='data'`. Stream only unique normalized relative regular-file names with no absolute paths or `..`; enforce the per-archive and combined limits before extracting each member. Compare the exact expanded payload-name set and every byte hash against `inventory.json`, excluding that inventory from its own mapping. This reader uses explicit guards that remain active under `python -O`; the older step-ordering receipt's assertion-based example is not reused. Run from the repository root:

```python
from pathlib import Path, PurePosixPath
import hashlib, json, tarfile, tempfile

def require(condition, message):
    if not condition:
        raise ValueError(message)

require(hasattr(tarfile, 'data_filter'), 'Python with tarfile.data_filter is required')
expected = {
    'd15-checkbox-preflight-launch.tar.gz': '140befa4241fcff938e6ce16511167000b0ca9f9ed5216e5caa439a838d81aa3',
    'd15-checkbox-baseline-native.tar.gz': '996086a64029119000067019c3e81578e94fe67516ab8ff7a46c24e01b0719f3',
    'd15-checkbox-final-native.tar.gz': 'f3028e9f69836498b230038cb7c88af5c17c9f55c77e1bf73fcc5fd46a644f5a',
}
Path('.verification/tmp').mkdir(parents=True, exist_ok=True)
shared = [5000, 64 * 1024 * 1024]
for name, digest in expected.items():
    archive = Path('docs/stabilization/phase-08') / name
    require(hashlib.sha256(archive.read_bytes()).hexdigest() == digest, 'Archive hash: ' + name)
    target = Path(tempfile.mkdtemp(prefix='d15-checkbox-reader-', dir='.verification/tmp'))
    budget, seen = [2500, 32 * 1024 * 1024], set()
    def bounded(handle):
        for member in handle:
            path = PurePosixPath(member.name)
            require(member.isfile() and member.size >= 0, 'Regular member required')
            require(path.parts and not path.is_absolute() and '..' not in path.parts
                    and str(path) == member.name and '\\' not in member.name, 'Member path')
            require(member.name not in seen, 'Duplicate member')
            seen.add(member.name)
            budget[0] -= 1
            budget[1] -= member.size
            shared[0] -= 1
            shared[1] -= member.size
            require(min(budget + shared) >= 0, 'Extraction budget')
            yield member
    with tarfile.open(archive, 'r|gz') as handle:
        handle.extractall(target, members=bounded(handle), filter='data')
    inventory = json.loads((target / 'inventory.json').read_text())
    actual = {p.relative_to(target).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in target.rglob('*') if p.is_file() and p != target / 'inventory.json'}
    require(isinstance(inventory, dict) and actual == inventory, 'Inventory hashes')
    require(seen == set(actual) | {'inventory.json'}, 'Exact member set')
    print(name, 'PASS', len(inventory), 'payloads', target)
```

Packaging integrity does not prove behavior: acceptance must examine expanded request/response/provider/snapshot/cleanup observations and the complete source diff.

## Remaining gates

The complete candidate has twelve changed paths against `0398e04c`: both application paths, the maintained recipe, three archives and six acceptance/release documents. CodeRabbit CLI 0.8.2 completes committed `c30968b7b5018691893e31fcf7c5eba5c99537ff` against that base with zero findings across all nine readable paths; the three unsupported binaries are covered separately by expanded acceptance. Its raw result SHA-256 is `b09de9ee008c3c09db98191b1491aeaebf1d00cdf16c83a4ab4b4cf2b1b63854`. Hosted approval `5394779084` covers that same head, with zero review threads.

[Actions 37040236432](https://github.com/waffleflopper/trooptotask/actions/runs/37040236432) passes Select checks and Repository and application at that identified head. Its actual merge `cbf595de1eee77f97b061a6b88963442b6ef5274` has the same tree `0f219a134a11abe5018d2f495675b2ccb9f0d0bb`. Full DoD/build passes: 633 suites/5,863 tests, types 0/0, eight runner-safety checks and governance 502/no regression. Database contracts correctly skips this Web-only diff; unchanged inputs retain the identified #1487 ARM64 database evidence, without a fresh SQL claim. The runner is online with all four required labels; no VM command is needed.

Independent acceptance is **GO** for the complete twelve-path source/coverage/expanded-artifact candidate at `c30968b7`, plus corrected receipt SHA-256 `83463329bee1746f355be5aa59deefc58aa30815742ebd9ac8a4c1d6a4684c06`. Report SHA-256 `fa9a005af709883a9729f837efe338f0414a264a84d8d5797c6cb893d2da4315`, support `dfa08d4ebde132ca1afde369583743fe9579b91b267a6f33641006b5ea80c803`. The independent reader recomputes business/native/provider outcomes, original captured fields, temporary-ID absence, frozen inputs, exact disposal, all 889 expanded members and all 158 unchanged predecessor archives. This is source/artifact assessment, not independent live execution or whole-issue acceptance.

Both consequential receipt findings are corrected: the initial type failure is accurately attributed to worker metadata, and the new reader replaces the inherited assertion-based example. The actual fenced reader passes all three archives under `python -O`; wrong hash, zero per-archive budget and zero shared budget each fail before writing any payload. An initial reviewer counterexample patch failed to apply to formatted code; that tooling error is retained separately, followed by the passing correctly applied counterexamples. Source, native inputs and archives remain byte-unchanged.

The subsequent acceptance accounting alters prose only. Documentation formatting/link/whitespace checks pass; proportional delta review and new-head full Actions/build/completed hosted review remain before authorized non-migration merge. Final-head results are recorded in [PR #1489](https://github.com/waffleflopper/trooptotask/pull/1489) after observation. This intermediate result leaves #1363 open and carries no production deployment or general concurrency acceptance.
