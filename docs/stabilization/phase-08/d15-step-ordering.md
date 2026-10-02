# D15 step response ordering

Intermediate `Refs #1363` from integrated consumer #1482 at `98f160c9888e328166aa241da118ca3cad3a87c1`. The selected outcome repairs a reproduced native Paperwork display regression while preserving independent checklist edits, rollback/retry and workspace lifetime guards. The [maintained packet recipe](../../../.agents/skills/verify-trooptotask/features/onboarding-packets.md#later-selections-while-saves-are-pending) owns the actual drive. Packet/API/removal/provider, obsolete UI and final retention/composition acceptance remain with the same issue; `08-M09-02a/b` stay unchecked.

## Observed baseline

Preparation `9040abbd471295e37afd458d85d91a76e80d797b` changes Markdown only; its application is unchanged from `98f160c9`. Worker 1 candidate `c92742dc8e60d72685cf2af580e215aaf27c29c9434839d86c03a37423594128`, origin `http://127.0.0.1:40275`, Chromium 152.0.7977.82, normal Onboarding-only Operate actor and helper-owned Alpha cohort `fa5b3b86` establish a product failure. Native Submitted saves and survives reload. After the first real Reviewed PUT 200 is held following persistence, native Filed PUT 200 saves Filed/complete on the same progress ID. Immediate UI is Reviewed/incomplete, remains so after releasing the old response, and agrees with Filed only after native reload. Exact request/response bodies, saved rows and snapshots/screens preserve both failed immediate expectations and successful reload.

The original eight selected A/B Personnel, Training, packet and progress rowsets are exactly restored, all five helper IDs are absent, and all cohort IDs/notes/unrelated work are preserved. The hook is restored, helper cleanup and final doctor pass. Inventory captured during the run identifies five owned containers, two volumes and one network; independent post-disposal inventory confirms those exact resources and the private worker directory absent. Eight executable/helper/instruction copies match their prelaunch hashes at disposal. A post-run comparison's overly broad filename glob first stopped on a helper-input JSON without `rows`; the exact-file correction passes and preserves that mistake separately. It changes no live observation.

## Repair and acceptance boundary

The baseline store put whole checklist snapshots into shared optimistic entries. A later save resolving exposed an earlier pending snapshot; the older response could then replace confirmed stage fields. The repair retains the existing shared store and log, rebuilding only its step-array entries from current saved state and pending step operations. A confirmed newer Paperwork stage suppresses older stage projection/result fields for that step. Failed requests roll back their own operation; independent checkbox, note and removal effects remain. Organization changes and invalidation clear descriptors with the existing version guard. API requests remain parallel and server/policy/provider/schema/public interfaces are unchanged.

A meaningful deferred-response test failed at both immediate and late-response expectations before implementation. Final store checks pass 29 tests; integrated store/context/interaction/stage-queue checks pass four suites / 77 tests, with thirteen actual network/feedback/settings helper checks. New tests specify retained observable work rather than descriptor or log internals. Note/removal overlap checks prove preservation against stage settling, with attribution and removal rollback at the store boundary. The current Kanban has no native note editor. Same-checkbox, concurrent-note-array and resync/template response ordering remain broader #1363 obligations. Existing accepted consumers, notes/lifecycle SQL and provider proof apply to unchanged bytes/contracts; no independent browser execution or new database acceptance is claimed.

## Matching final native proof

Frozen integrated `0f52036b0155136f9c9a0022a836cfcdddebe30f` runs worker 1 candidate `0bf00c359635a1f352789902e3545f34cf698a8b50450a96d552f234441091f4`, origin `http://127.0.0.1:33617`, the same native browser version and a fresh normal Onboarding-only Operate cohort `08c231ce`. Submitted saves and survives reload. Real Reviewed PUT 200 is held after exact persistence, then real Filed PUT 200 saves Filed/complete on the same ID. Immediate expanded native UI, older-response release and reload each retain Filed CURRENT/3-of-3. This causal response-delivery sequence repairs the two baseline failures; it does not promise backend request issue order or a later independent writer's outcome.

A second native reversal to Reviewed persists while its response is held; an independent native Orientation reversal saves incomplete. Exact real request/response bodies, provider and immediate UI agree on Reviewed, unchecked Orientation and 1-of-3, preserving Historic task and notes; release/reload agree. A scoped synthetic 503 then rolls native Filed back to Reviewed with unchanged three-row provider state and a rendered error in the actual click snapshot/feedback observer. The intercepted failed attempt has no native wire body and earns no server rollback credit. Restore, Escape/reopen and actual PUT 200 retry save Filed while keeping Orientation incomplete; expanded reload shows Filed CURRENT/2-of-3.

All original eight full selected A/B rowsets and five helper IDs are restored/absent. Person/parent, progress IDs, notes and unrelated fields remain; only the two requested steps' stage/completion fields change. Ten selected utility/helper/instruction/source copies match prelaunch hashes at disposal, with tracked dependencies bound to Git/candidate. Final doctor matches the launched source/session/origin/digest. Hook/seed cleanup and independent exact five-container/two-volume/one-network/private-directory absence pass. Lower, native and privileged readback evidence remain separate. The fresh final cohort starts October 2 across local midnight from the baseline's October 1; no clock manipulation or performance comparison is involved.

## Current-default integration

Main advanced to separately owned Settings #1481 at `28405962cbaafb0ed551bad0f1f2ff773bef4b01`. The integration preserves its source, three archives and owner task/evidence records. Its application changes are isolated to Settings; Onboarding and shared store bytes are unchanged. Updated native helpers add an Organization Policies-only delayed synthetic POST failure; existing Onboarding real-response hold and immediate synthetic failure semantics are retained. Final proof uses the integrated helpers and their actual frozen bytes. Baseline inputs and observations remain tied to `9040abbd` and are not rewritten as a new live run.

## Durable artifacts and review

The [baseline archive](d15-ordering-baseline-native.tar.gz) SHA-256 is `422d06e3a5a5176c4ca01d7a789bb2811e7a9f101f3af670109fd806419989c7`; [final archive](d15-ordering-final-native.tar.gz) SHA-256 is `d44ab1ebb6187193fad4c60d7217aa7b00eb1b2e8847a11d866895121ef057cd`. They preserve 276/538 byte-identical raw files plus one authored sanitization record each: 277/539 inventoried payloads, 278/540 members, 1,210,531/2,480,062 expanded bytes. Combined 818 members / 3,690,593 bytes stay within the shared 5,000-member/64-MiB budget and each 2,500-member/32-MiB budget. Each inventory lists every payload filename and expanded SHA-256. Credential-bearing native headers were omitted at capture; actual business bodies are retained. The only token-pattern match is the tracked deliberately incorrect credential literal, verified against each run's exact Git helper blob and prelaunch hash. No observed payload bytes were redacted or altered. All previous D15 archives remain unchanged.

Both archives pass fresh bounded extraction, exact filename-set/hash checks and equality with the raw run files. From the repository root, this verified example creates fresh ignored directories on each invocation:

```python
from pathlib import Path
import hashlib,json,tarfile,tempfile
expected={
'd15-ordering-baseline-native.tar.gz':'422d06e3a5a5176c4ca01d7a789bb2811e7a9f101f3af670109fd806419989c7',
'd15-ordering-final-native.tar.gz':'d44ab1ebb6187193fad4c60d7217aa7b00eb1b2e8847a11d866895121ef057cd'}
shared=[5000,64*1024*1024]
for name,digest in expected.items():
 archive=Path('docs/stabilization/phase-08')/name
 assert hashlib.sha256(archive.read_bytes()).hexdigest()==digest
 target=Path(tempfile.mkdtemp(prefix='d15-ordering-reader-',dir='.verification/tmp'))
 budget=[2500,32*1024*1024];seen=set()
 def bounded(handle):
  for member in handle:
   assert member.isfile() and member.size>=0 and member.name not in seen
   seen.add(member.name)
   budget[0]-=1;budget[1]-=member.size;shared[0]-=1;shared[1]-=member.size
   assert min(budget+shared)>=0
   yield member
 with tarfile.open(archive,'r|gz') as handle:
  handle.extractall(target,members=bounded(handle),filter='data')
 inventory=json.loads((target/'inventory.json').read_text())
 actual={p.relative_to(target).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in target.rglob('*') if p.is_file() and p.name!='inventory.json'}
 assert actual==inventory
 print(name,'PASS',len(inventory),'payloads',target)
```

Independent baseline artifact/input and complete nine-path integrated source/selection reviews pass at `0f52036b`. They are distinct from independent live execution. Two stale prose statements are corrected after disposal, without changing runtime/helper/recipe inputs. Final complete eleven-path/two-expanded-archive acceptance, intended-diff CLI review, publication, exact-head Actions/build and completed hosted review remain gates. Later artifact adoption and result-record edits change the checkout fingerprint; they do not claim another native run or alter the tested app/helper/recipe bytes.

## Release

No migration or production operation is involved in the selected client repair. Robert authorizes merge after current CI passes and completed bot review has no actionable feedback, followed by the next deliverable for #1363 only. A newly required migration stops for his manual application. Prior reconciliation/note migration provenance and Robert's reported live application remain unchanged; no remote readback is claimed here.
