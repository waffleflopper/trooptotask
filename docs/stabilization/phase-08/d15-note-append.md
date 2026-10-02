# D15 — Retain overlapping note additions

This intermediate `Refs #1363` repair addresses lost saved notes when two authorized users add to the same step. Its declared scope is note append, ordinary authenticated persistence, existing API/store consumers and saved History readback. The separate Cancel/Complete race, reverse consumers and remaining whole-issue acceptance stay required under #1363; `08-M09-02a/b` remain unchecked.

## Failed unchanged-app baseline

Source `44f580e9a4f6f0bfb3655a80ae0a9888b80c65a9` has the integrated #1475 application. Candidate `275e46f6ae4f0543a90e95000f68103b250eb3c3bee5fba604f5b682651223b9` freezes 4,584 inputs. Production-mode owned session `4548d591-b147-48dd-9b51-8d8b79c28ef2` runs at `http://127.0.0.1:38481`, using native Chromium 152.0.7977.82 on Arch Linux and a disposable synthetic provider. `TMPDIR=/home/waffleflops/.cache/t2t-d15-tmp` supplies a short temporary path. Launch, doctor and disposal observations identify the exact owned project and ports.

Two distinct fresh ledgered legacy cohorts keep original history unchanged. Normal Operate and Configure sessions warm with valid-shaped requests to a UUID proved absent before writes. A seed-restricted holder locks the exact Orientation step for notes, or exact active parent for lifecycle, without changing data or schema. Each case records two ordinary UPDATE backends waiting directly/transitively on that exact PID/backend-start identity and full unchanged committed parent/progress. Holder rollback/absence and all three child exits pass before readback or cleanup. No winner or request ordering is assumed.

- **Notes FAIL:** both ordinary addNote requests return 200. Their responses respectively contain original+A and original+B, but saved state contains only the original and B. A is missing. The surviving addition has the Configure actor’s ID and a current timestamp. Other full A/B packet/progress rows, untouched target fields and selected Training fields remain unchanged. Ordinary supported completion then native View History → Orientation notes → reload displays exactly the saved failure. This is API creation followed by native readback, not a native note-editor claim.
- **Lifecycle FAIL, remaining repair:** Cancel and Complete both return 200. Final status is cancelled with both `completed_at` (`2026-10-02`, a schema DATE) and `cancelled_at` (`2026-10-02T03:06:21.799+00:00`). Native History/reload displays the actual contradictory saved dates. The intended result remains one successful transition, one explicit rejected state/conflict and only the matching terminal timestamp. This note-only PR does not supersede that failure.

The original note driver raised `KeyError('actors')` during postprocessing after both requests and partial readback: public fixture metadata does not contain private actors. Its script, failure and raw responses remain. Corrected read-only analysis uses each already captured response’s authoritative `actorId`, captures the remaining comparisons and repeats no mutation. Lifecycle uses the corrected driver. Both product failures remain failures; the metadata error earns no successful proof.

Cleanup restores every original A/B packet/progress field including timestamps and the selected Training fields (Training timestamps are not captured). Both temporary Persons are absent, seed/grant ledgers empty and all 4,584 frozen inputs unchanged. Final doctor and exact owned container/volume/network/private-worker absence pass. No existing local or remote provider is accessed.

## Repair and matching acceptance

The consumed `OnboardingNoteAppendPort` replaces note-array read/replacement with one ordinary authenticated RPC. Existing resource policy runs first; the API/store adopt its authoritative saved ID/notes, including another committed addition. Success audit stays after persistence; provider failures produce no success audit. Existing action/body/result, empty/whitespace text and supported terminal/inactive edits remain. This removes the extra note-array read rather than adding a second state model.

The additive [migration](../../../supabase/migrations/20261002000100_atomic_onboarding_note_append.sql), SHA-256 `cac714d4f4f95af2209d0d85a70277121a77f4b11646bb9565e9add9b7635c35`, adds `public.append_onboarding_step_note(uuid, uuid, text) RETURNS jsonb`. It is volatile, invoker, empty search path, with an authenticated application grant and no PUBLIC/anon/service-role grant. It locks only the selected progress row explicitly, then rechecks current Operate and parent Person scope in a fresh statement after any wait. It appends to the current database array with `auth.uid()` and current UTC millisecond-Z time; all old note attributes/work remain. Missing/invisible targets use P0002, denied changes use 42501 and malformed saved arrays fail closed with 22023. The ordinary provider maps the first two to 404/403 and genuine unexpected/null outcomes to 500. A write failure rolls back. No table, policy, constraint or existing-row rewrite is added; the transaction includes the schema-reload notification.

| Matching production run              | Source                                     | Candidate digest                                                   | Inputs | Origin / session                                                  |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------ | -----: | ----------------------------------------------------------------- |
| Repaired application on `61dd0381`   | `aabaa9757b06079f65e3df544c8ad85964d1ee1a` | `843504e8760901bf82ac1bb7818706aea3b0a7707921e95b160e79a0f1b98d6a` |  4,590 | `http://127.0.0.1:40755` / `a4650fd7-50d1-4468-940e-38410221d665` |
| Repeat on integrated main `e4080fe0` | `14198ebe3d65a14c684001e818ccba8d0f0f249d` | `2ecb5b176ed840d0956faf021bf25807c4b626a16da7638b2f7e3fc9075118b9` |  4,595 | `http://127.0.0.1:43263` / `76518b5e-a45d-49c5-979b-d093768089c9` |

Both runs use the same owned production/native environment and normal-session helpers as the baseline. The final holder switches from exact progress UPDATE to the exact canonical PostgREST note RPC; all seed/session/doctor/lock/unchanged-state/rollback guards remain. Independent source preflight checks the holder and fifteen static translated-POSIX match/nonmatch examples; that is not PostgreSQL execution or an arbitrary SQL parser. Actual controlled runs establish the boundary separately.

Both matching runs pass two exact RPC backend waits against unchanged committed state, holder rollback/absence and all three child exits without forced cleanup. Both requests return 200; saved notes contain the original plus exactly A and B, with the respective ordinary actor IDs and current valid UTC millisecond timestamps. Each authoritative response retains the original and its own saved addition; every returned note is present in final saved state. One returns two notes and the later writer three, without prescribing which request wins. Other full A/B packet/progress rows, untouched target fields and selected Training fields remain exact. Supported ordinary completion then native View History → Orientation notes → reload shows both additions. No native Kanban note editor is claimed.

Neither matching run has a driver failure. All original full packet/progress fields including timestamps and selected Training fields are restored, the single temporary Person is absent, ledgers are empty and frozen inputs unchanged. Final doctors and exact owned disposal pass. The later main change is independently owned Personnel work: it adds separate artifact context/imports in the shared request adapter; the note provider/bindings remain. Rebase preserves that owner's source/records, and the complete matching run is repeated after integration. Later archives/general prose are packaging differences, not a new runtime observation.

## Isolated SQL and source checks

SQL bytes at worker `9ee0bdfc` are identical to the integrated candidate. Supabase CLI 2.101.0/PostgreSQL 17.6, disabled seeds and reserved distinct ports are recorded with actual commands, all port allocations and disposal in the SQL archive. Each passing run preserves all 246 copied SQL input hashes, which also match the root candidate.

| Run               | Owned project               | API / DB      | Result                                                                                                                                                                |
| ----------------- | --------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused           | `t2t-note-focused-s7q9sr12` | 62786 / 62075 | 161 migrations; 35 behavior/scope/rollback + 26 concurrency assertions pass                                                                                           |
| Full fresh        | `t2t-note-fresh-2zntqutz`   | 60856 / 64593 | All 161 migrations, 52 retained SQL suites / 1,374 assertions pass                                                                                                    |
| Populated upgrade | `t2t-note-upgrade-8z06vqhn` | 62578 / 62010 | Replay 160 predecessors, save 18 parent/progress/Person witnesses, then apply only the new migration; every field remains exact; 10 upgrade + same 61 assertions pass |

The chain starts `20260413001158_remote_schema.sql`; predecessors end `20261001000200_atomic_onboarding_reconciliation.sql`; final range ends `20261002000100_atomic_onboarding_note_append.sql`. Effective attributes/grants, allowed Operate/Configure/scoped and denied View/Personnel-only/empty/foreign/other-Group cases, attribution/legacy fields, terminal/inactive/empty/whitespace/null compatibility, fault rollback/retry, two observed writers, capability loss/Person reassignment after waits, other-step nonblocking and one-RPC/reconciliation note retention pass. These are direct SQL/provider observations, separate from native interaction.

Three failed focused attempts remain: catalog/default collation made a metadata comparison invalid; moving the session timezone between snapshots changed timestamp renderings; an extra two-appends-in-one-explicit-transaction interaction encountered a real FK deadlock with reconciliation. The first two are corrected test controls, not product failures. The latter remains a limitation. All six passing/failed projects are disposed with unchanged recorded inputs. Nine earlier source snapshots were reconstructed and accepted only after exact equality with their respective run-receipt hashes; they are not described as original live-copied files.

One ordinary request makes one append RPC transaction. No explicit parent lock follows its progress lock. Several direct appends batched in one caller-managed transaction can recheck an existing FK against a tuple written by that transaction and conflict with reconciliation's parent-first lock. The observed failure and narrower passing interaction remain preserved; [PostgreSQL 17's FK implementation](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/backend/utils/adt/ri_triggers.c) supports that explanation. No constraint or policy is changed to conceal it. Arbitrary direct replacement writers and other mutation overlaps remain outside this guarantee.

Seven focused application suites / 103 tests, types 0/0 and scoped formatting/lint pass. Tests cover authoritative concurrent notes, poisoned replacement writes, policy denial, failure without success audit, RPC transport/error mapping and client adoption/rollback. Root full local formatting changes no source.

Complete independent acceptance passes at published `80c8c8427bf77071263464f54f469db54b142f07`: all 27 logical files, 23 readable files and four freshly expanded archives. It verifies every inventory/hash, reconstructed candidates and all 4,595 integrated inputs, actual API/native outcomes, SQL counts and whole-row populated upgrade preservation. This is source/artifact acceptance, not another live run. CodeRabbit CLI 0.8.2 explicitly reviews all 23 readable files with zero findings; expanded independent acceptance covers its four binary exclusions. Hosted CodeRabbit approves that exact head, review `5388096969`, with no threads or actionable feedback. Its generic docstring-percentage warning identifies no missing behavior, attribution, error or wait contract after inspection; the public port/result, provider comment, SQL and this receipt describe those contracts.

[Depot repository/application checks](https://depot.dev/orgs/rvsvvkd4rp/workflows/w3m609fvsr?job=4hkcsvqncs) and [database checks](https://depot.dev/orgs/rvsvvkd4rp/workflows/w3m609fvsr?job=2gxdp2r4qt) pass for the same published head, testing merge `dfcaaf51036ab0d43183a26bd00805afb65bf8a0` into documentation-only main `537fe996`. Full DoD/build passes: 629 suites / 5,746 tests, Svelte/types 0 errors/0 warnings, governance 506 inherited findings/no regression and eight formatted Markdown files/163 linked documents. Lint retains two existing Calendar reactivity warnings with zero errors. Fresh replay/SQL contracts, existing migration regressions, ordinary provider probes and populated upgrades pass; their disposable projects are removed. Vercel passes.

The later main merge preserves D13's completed acceptance and changes only TODO/EVIDENCE prose. The final acceptance-record delta changes no application, SQL, recipe or driving input, so the 4,595-input native proof remains applicable. [PR #1478](https://github.com/waffleflopper/trooptotask/pull/1478) tracks the final published head's CI and completed review; both must pass again after this prose update before handoff. The manual migration gate below remains required.

## Durable observations

| Archive                                                 | SHA-256                                                            | Payloads / members | Expanded bytes |
| ------------------------------------------------------- | ------------------------------------------------------------------ | -----------------: | -------------: |
| [Failed baseline](d15-overlap-baseline.tar.gz)          | `59c415516082440e3234888dc4cda2caad0f407e1e71375800abdf66af1ab393` |          427 / 428 |      1,997,500 |
| [Matching repair](d15-overlap-note-final.tar.gz)        | `ac726754328d98adcd27a69a32abd6b476f3bebafd0bbfcb18873bff121d1847` |          254 / 255 |      1,508,191 |
| [Isolated SQL](d15-note-append-sql.tar.gz)              | `0cdbd1cb9c9b5d03584ab6525f1dc2c90a488eeccb23bbd6b2baec86676f3f06` |            31 / 32 |        492,306 |
| [Integrated repeat](d15-overlap-note-integrated.tar.gz) | `8d329a81aeca4fc22734274c7b491f301b8e2fd2f1cc0011844d99db0fe88caa` |          248 / 249 |      1,494,655 |

All four archives are added only after their owned cleanup. Credential-pattern scanning passes without redactions; observations remain byte-identical. The SQL worker inventory is renamed only, and all 246 input hashes match root. Each archive inventory excludes itself. Fresh extraction verifies all 960 payloads / 964 members / 5,492,652 expanded bytes under one unchanged 2,500-member/32-MiB aggregate budget. Integrity checks are distinct from source/behavior acceptance; independent review is artifact review, not independent live execution.

From the repository root, this creates fresh ignored scratch space and verifies every archive and expanded payload:

```python
from pathlib import Path
import hashlib, json, tarfile, tempfile

root = Path.cwd()
scratch = root / ".verification/tmp"
scratch.mkdir(parents=True, exist_ok=True)
parent = Path(tempfile.mkdtemp(prefix="d15-notes-review-", dir=scratch))
archives = {
    "d15-overlap-baseline.tar.gz": "59c415516082440e3234888dc4cda2caad0f407e1e71375800abdf66af1ab393",
    "d15-overlap-note-final.tar.gz": "ac726754328d98adcd27a69a32abd6b476f3bebafd0bbfcb18873bff121d1847",
    "d15-note-append-sql.tar.gz": "0cdbd1cb9c9b5d03584ab6525f1dc2c90a488eeccb23bbd6b2baec86676f3f06",
    "d15-overlap-note-integrated.tar.gz": "8d329a81aeca4fc22734274c7b491f301b8e2fd2f1cc0011844d99db0fe88caa",
}
budget = [2500, 32 * 1024 * 1024]
assert hasattr(tarfile, "data_filter")
for name, expected in archives.items():
    archive = root / "docs/stabilization/phase-08" / name
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected
    dest = parent / name.removesuffix(".tar.gz")
    dest.mkdir()
    seen = set()

    def bounded(handle):
        for member in handle:
            assert member.isfile() and member.size >= 0
            assert member.name not in seen
            seen.add(member.name)
            budget[0] -= 1
            budget[1] -= member.size
            assert min(budget) >= 0
            yield member

    with tarfile.open(archive, "r|gz") as handle:
        handle.extractall(dest, members=bounded(handle), filter="data")
    inventory = json.loads((dest / "inventory.json").read_text())
    actual = {
        p.relative_to(dest).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in dest.rglob("*")
        if p.is_file() and p != dest / "inventory.json"
    }
    assert actual == inventory
print(parent, "PASS", 2500 - budget[0], "members", 32 * 1024 * 1024 - budget[1], "bytes")
```

## Release boundary and issue remainder

This deliverable stops before merge for Robert's manual application of the reviewed migration and digest above. His earlier #1470 confirmation does not cover this new file. Apply the function before releasing its consumer: without it, addNote fails. Once the new application serves, drain earlier instances/requests that still replace arrays before claiming safe overlapping appends. The additive function can remain on application rollback; older code remains usable with its prior lost-note limitation. A failed migration transaction rolls back; no historical lost note is reconstructed automatically.

CI uses only disposable local providers and performs no remote migration. Repository configuration runs Vercel builds and does not explicitly disable this branch; external production deployment settings remain uninspected. No remote function/ledger readback or production acceptance is claimed. The existing #1470 and separately owned D12 operator obligations remain.

After accepted review, green exact-head CI and the new manual gate, continue the same #1363 with the observed lifecycle repair, Add Person/Calendar/Training reverse consumers, remaining valid packet operations/access boundaries, general response ordering and integrated removal/whole-issue acceptance. Notes proof earns no lifecycle completion credit; do not advance another issue.


## Integrated result

PR #1478 merges at `8429f758c78df5ff90eab30f1cb17d15935489a3`, with the identical tree `15b52826fcd89843cac18d455604d3a8fbd25c45` as accepted `16d415d61fb0ffdd0d86c5b279044696823b6f5c`. Final-head [application CI](https://depot.dev/orgs/rvsvvkd4rp/workflows/hlf5vbrx3g?job=73k649bg7c) and [database CI](https://depot.dev/orgs/rvsvvkd4rp/workflows/hlf5vbrx3g?job=vhcvqt4j55) pass with the same full check counts recorded above; Vercel passes. Complete independent source/expanded acceptance and final four-file prose/integration acceptance pass. CLI explicitly reviews all four changed prose files with zero findings. Hosted incremental review completes for `80c8c842` → `16d415d6`, no threads/actionable feedback and successful final-head status; original source approval remains at `80c8c842`. Its similar-change TODO skip is covered by final CLI and independent acceptance.

Robert confirms manual live application of the reviewed migration on 2026-10-02 UTC (2026-10-01 America/Anchorage); there is no agent remote function/ledger readback. This satisfies this deliverable's manual gate, without claiming old-instance drainage or production acceptance. The earlier stop/pending records retain their historical scope. #1363 remains open and continues with [guarded lifecycle transitions](d15-lifecycle-transitions.md).
