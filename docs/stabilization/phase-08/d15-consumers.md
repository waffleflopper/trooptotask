# D15 — Public page input and retained consumers

This intermediate `Refs #1363` deliverable removes the last private App Shell Organization-context type dependency and verifies the retained Add Person, Calendar and Training consumers. It adds no migration. The source change and all four matching native baseline/final runs pass. Durable packaging passes; complete original-candidate independent acceptance and CLI review pass; latest-main integration is accepted, while publication, final metadata review and current-head CI/hosted review remain pending. `08-M09-02a/b` and #1363 remain open.

## Scope and retained contracts

The private constructor input becomes four consumed structural members: Organization ID, optional canonical URL segment, ScopeSet and the advisory feature-policy callback. The context retains the original live object/getters, captured lifetime ID and callback receiver. Its existing route remains the production caller; public Web exports, delivery composition, stores, server/provider policy and database contracts do not change. This follows the existing narrow Training page-input pattern without borrowing another feature’s private type or creating a shared context abstraction.

Two meaningful checks cover distinct canonical-slug links and a successful note response arriving after the live Organization changes. The latter must leave the current draft intact. An actual temporary spread-copy of the input fails that lifetime check; byte-exact source restoration and the context suite pass. No incidental layout, wording or implementation-mirror tests are added.

The [packet recipe](../../../.agents/skills/verify-trooptotask/features/onboarding-packets.md#add-person-calendar-and-training-consumers) owns this bounded selection alongside the existing [Personnel](../../../.agents/skills/verify-trooptotask/features/personnel-records-lifecycle.md), [Calendar](../../../.agents/skills/verify-trooptotask/features/calendar-navigation.md) and [Training](../../../.agents/skills/verify-trooptotask/features/training-completions-reports.md) recipes. Fixed disposable setup adds one Alpha Person, active and completed packets for that same Person/type, a saved incomplete active Training step, a completed inactive step and positive Bravo/foreign packets. All 16 IDs enter the helper ledger before insertion; cleanup removes only those IDs in reverse dependency order. Privileged setup/readbacks establish fixture identity and saved effects, separately from native actions and ordinary authenticated requests.

This selection covers the changed context’s permissions, links and late-result lifetime, shared Personnel creation/packet attachment, Calendar’s active marker and preference behavior, and active Training projection versus retained terminal/inactive work. Existing unchanged packet/history/recovery, atomic reconciliation, note append and guarded lifecycle evidence retain their separate tested candidates in the linked D15 receipts. This deliverable does not establish every remaining valid actor/packet/step operation, response order or concurrent mutation required for whole-issue acceptance.

## Owned native observations

Every accepted run uses `npm run verify:app`, native DevTools and documented `verify-trooptotask` helpers, against its own disposable production-build app/provider and private Chromium profile. No maintenance or production provider is used. An earlier in-app preview setup is excluded from acceptance; Robert’s explicit correction and AGENTS.md govern the native tools used here.

| Run                        | Revision / candidate                                                                                                                                                                   | Observed outcome                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add Person baseline        | Preparation `c642e131ef8d41274b737de43362d28a2e990f61`, unchanged application from integrated `73cc63fa`; candidate `87d1ef5f5d9c74273d4063a61b6576946c6c5e47f1d618c850b737298c8e839a` | Passed native creation/attachment/reload, four ordinary 403/no-effects probes, native cancellation/History, retained-row comparison and exact disposal.                                                   |
| Add Person final           | Source `3dbf3c3aa52556fd14019d119ebb7128d86260a2`; candidate `2bac4c53fc4844ffc5927e644e326b08d76c7e5ef8418ceea8385e695bcfb7c1`                                                        | Matching selection passes; original pre-seed rowsets and exact disposal pass.                                                                                                                             |
| Calendar/Training baseline | Worker preparation `9fd768e1cce7b505e0ee8cc1e9e841f00a6c34a2`, same application/setup bytes and baseline candidate                                                                     | Passed current/expired native create/delete, Calendar transitions/scope and A → B → A, saved-work comparisons and owned cleanup. Exact baseline project IDs were not retained; disposal limits are below. |
| Calendar/Training final    | Worker source `204032ae2880b7ee176ade23103b702530387fc9`, same final application/setup bytes and candidate                                                                             | Matching selected native/API observations, exact saved-row restoration, final doctor and exact disposal pass.                                                                                             |

Worker 2 baseline is session `c557090d-0c85-48c0-8319-a845da9417ec` at `http://127.0.0.1:41041`. Final worker 2 launches at source `204032ae`, session `7de3740f-0d07-43ce-be17-89a9e25cf916`, origin `http://127.0.0.1:34451`, with initial doctor candidate `2bac4c53` matching root. Matching final native observations, final doctor and exact disposal pass; fifteen inputs were frozen before launch: twelve ignored observation drivers and three tracked helper/recipe files. The later provider-inventory-v2 reader is separately frozen before its readbacks. Two post-protocol offline checker versions are preserved separately and did not alter native actions.

Both completed root runs use native Chromium `152.0.7977.82 Arch Linux`. Baseline worker 1 is session `770c325f-19f7-450f-9995-047895097569` at `http://127.0.0.1:35249`; final worker 1 is `5c5fe4a4-e3e5-4efe-9812-f7eb2a35855e` at `http://127.0.0.1:46519`. Their initial/final doctor records bind exact source, candidate, origin and session. Other acceptance prose is excluded from the digest; application/helpers/map instructions stay frozen during proof. Later archive adoption changes evidence inputs, without being described as another live run.

As `onboardingPersonnelScoped`, Alpha is the only Group choice and unassigned is absent. A full native form without a Group shows a permitted-Group error and saves nothing. Selecting Alpha saves one SPC Person, selects that confirmed ID in the outer Start form, and attaches its canonical template at the actual fixture date with three fresh progress IDs. Reload retains the card/checklist and History/Training links. The fixture uses a UUID URL fallback; the distinct canonical-slug case is lower-level proof, not a claimed native observation.

Four valid ordinary Personnel POSTs use the actual native camelCase body, with unique names and Bravo, foreign, null/unassigned or independently missing Group targets. Each returns 403; all six immediate A/B Personnel/packet/progress rowsets stay exactly unchanged. Native Cancel then returns PUT 200, saves cancelled status with one cancellation instant and no completion date, and persists in native History after reload alongside original March History. API admission observations are separate from native interaction and SQL/RLS proof.

Root cleanup compares 24 retained original rows across 14 selected A/B rowsets: Personnel, Training, packets/progress, availability, assignments and Groups. Baseline files named `original-*` include the helper cohort, so comparisons exclude the exact 16 helper IDs from both sides and five separately native-created IDs from cleanup only. Final originals are genuinely pre-seed; they are disjoint from all new IDs and only those five native residual IDs are excluded from cleanup. Every retained selected field, including captured notes/timestamps, matches; native Person/progress remain unchanged and its packet is cancelled. The five native rows remain until whole-worker disposal; no pre-disposal hard-delete is claimed. All helper IDs are absent, ledger empty, hooks false, doctor/cleanup pass, and exact project containers/volumes/network/private worker directory are absent. Captures survive disposal.

Original driving gaps remain explicit: baseline business capture expected `.json` rather than the native body suffixes, while preserving the actual body files. Final Rank selection succeeded with rendered text SPC but an assertion expected that as its accessible name; a second UID guard refused ambiguous outer/dialog Start buttons before any mutation. Matching fresh native observations use the real labels and named dialog. These are control/assertion corrections, without changed application inputs or weakened product expectations. Raw network headers and private login credentials are never published.

Worker 2 baseline independently passes 47 comparisons: ten pre-seed selected A/B rowsets containing 12 original rows, ten public Calendar marker reads, seven active Training projections and twenty saved-progress comparisons. Current and literal expired completion/expiration dates both satisfy the active Training projection; native deletion makes it incomplete. Same-Person terminal Training stays saved false and inactive Training saved true, with captured IDs, notes/work and timestamps unchanged. Calendar off removes tint while preserving its header dot; cancel/reopen/complete remove/restore/remove the Alpha marker while Bravo remains. Scoped Alpha and positive B Organization switching keep their separate actors and authority. Completion uses the authoritative returned server date; the submitted client date is not claimed to govern persistence.

Baseline worker 2’s exact random project/container IDs were not archived before owned cleanup removed its private marker. Doctor/owned cleanup pass and the private worker is absent. A post-disposal namespace-empty summary exists, but original raw Docker outputs were not retained; invocation metadata is reconstructed from the actual executed input afterward, rather than independently proving the original filter. Retrospective event recovery found no ID. After final disposal, fresh successful Docker commands, raw outputs and explicit filter definitions prove the entire permitted allocator namespace empty. Final before/after records additionally establish exact absence of its five container IDs, two volumes, one network and private worker directory. This strengthens namespace cleanup evidence without reconstructing unavailable baseline IDs or raw outputs. The thirteen preserved baseline inputs (ten ignored drivers plus three tracked helper/recipe files) match their recorded hashes/applicable source, but their pre-launch byte freeze cannot be independently reconstructed. Application/helper/map candidate equality and actual action/request traces are separately established; v1/v2 driving corrections remain visible. Final proof retains a separately captured pre-launch driver manifest for independent inspection. The final offline checker initially used snake-case Training date fields against the camel-case API response; its original failure and corrected passing checker remain visible, without native-action or product changes.

Worker 2 final independently checkable evidence reports 41 core comparisons: ten pre-seed rowsets with twelve original rows, ten public marker reads, five Training projections and sixteen saved-progress comparisons. Twelve supplementary checks cover parent preservation, exact seed absence, native body/status captures, literal dates, the incomplete warning/Reopen, History witnesses and tint/dot behavior. The baseline’s repeated current Training cycle accounts for its additional projection/progress comparisons. Both runs preserve the same selected product expectations; final driving has no failed attempt. Native Training records are visibly deleted before helper cleanup, all sixteen seed IDs are absent, ledger/grants empty, original preference restored and hooks unarmed/unheld.

## Durable observations

Each completed run is packaged after final doctor and owned cleanup. All 3,674 raw-run files retain their original bytes. Four authored sanitization records bring the payload count to 3,678; four inventories add four regular members. Credential scanning requires no redactions. Its only reviewed pattern match is the deliberately incorrect `Bearer synthetic-incorrect-secret` literal in the byte-identical control helper source at original packaging candidate `88c1fc9d`, separately recorded in `sanitization.json`; no captured credential or network header is exempted.

| Archive                                                             | SHA-256                                                            | Payloads / members | Expanded bytes |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ | -----------------: | -------------: |
| [Add Person baseline](d15-consumers-baseline-native.tar.gz)         | `254bbbd090e0d7ebd7c5f7ffaa785da96e1bcb9489f90d4008e8754a1585c720` |          436 / 437 |      1,792,556 |
| [Add Person final](d15-consumers-final-native.tar.gz)               | `aa846143c98facab9dd8a810d8dbf715a32c5d650514e229b0323d6bc8b74ba6` |          483 / 484 |      2,246,142 |
| [Calendar/Training baseline](d15-consumers-worker2-baseline.tar.gz) | `b5cadbe7df44f492f1ef1dc6934b9ac9fbaa0c66e901e298b6633cc89635e9fd` |      1,458 / 1,459 |     12,942,697 |
| [Calendar/Training final](d15-consumers-worker2-final.tar.gz)       | `4c48be9cb5a03b17c0fc623c0f8fa2336863e30427b296c64fc338d0861fc66b` |      1,301 / 1,302 |     11,615,512 |

These four new captures share a 5,000-member / 64-MiB budget, with each run also bounded to 2,500 members / 32 MiB. Actual aggregate use is 3,682 regular members / 28,596,907 expanded bytes, including inventories. Earlier immutable archives and their original budgets are unchanged. Bounds cover expanded payloads, not all metadata/decompression resource use. Packaging integrity does not establish application behavior.

From the checkout root, Python with `tarfile.data_filter` verifies archive hashes, extracts into fresh ignored scratch and checks the exact expanded payload filename/hash mappings:

```python
from pathlib import Path
import hashlib, json, tarfile, tempfile

root = Path.cwd()
scratch = root / ".verification/tmp"
scratch.mkdir(parents=True, exist_ok=True)
parent = Path(tempfile.mkdtemp(prefix="d15-consumers-review-", dir=scratch))
archives = {
    "d15-consumers-baseline-native.tar.gz": "254bbbd090e0d7ebd7c5f7ffaa785da96e1bcb9489f90d4008e8754a1585c720",
    "d15-consumers-final-native.tar.gz": "aa846143c98facab9dd8a810d8dbf715a32c5d650514e229b0323d6bc8b74ba6",
    "d15-consumers-worker2-baseline.tar.gz": "b5cadbe7df44f492f1ef1dc6934b9ac9fbaa0c66e901e298b6633cc89635e9fd",
    "d15-consumers-worker2-final.tar.gz": "4c48be9cb5a03b17c0fc623c0f8fa2336863e30427b296c64fc338d0861fc66b",
}
budget = [5000, 64 * 1024 * 1024]
assert hasattr(tarfile, "data_filter")
for name, expected in archives.items():
    archive = root / "docs/stabilization/phase-08" / name
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected
    dest = parent / name.removesuffix(".tar.gz")
    dest.mkdir()
    seen = set()
    run_budget = [2500, 32 * 1024 * 1024]

    def bounded(handle):
        for member in handle:
            assert member.isfile() and member.size >= 0
            assert member.name not in seen
            seen.add(member.name)
            for remaining in (budget, run_budget):
                remaining[0] -= 1
                remaining[1] -= member.size
                assert min(remaining) >= 0
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
print(parent, "PASS", 5000 - budget[0], "members", 64 * 1024 * 1024 - budget[1], "bytes")
```

## Integration with updated main

After all four runs were disposed, this branch integrates main `686ca07d84aac29f80542b0a5c112765924d2391` while preserving the original proof commits and immutable archives. The separately owned settings preparation adds two actors/three memberships and unused settings controls. Application/schema/environment-core bytes, the consumer cohort helper and selected packet recipe remain identical to accepted `88c1fc9d`. The six consumed actors retain their permissions, scope and memberships; existing business-row construction is unchanged. Settings-only slug/form branches do not run for these consumers. Uppercase string-URL POST/PUT/DELETE calls keep their endpoint, ordinal, response, hold and restore behavior.

Independent incoming compatibility review supports reusing the four recorded runs. Exact incoming network implementation/test blobs pass seven checks; the integrated network/feedback/settings suites pass twelve checks, and controller/fixture/cohort syntax checks pass. Removing only this PR's consumer-seed registration reconstructs the incoming controller byte-for-byte. An initial ignored comparison assumed the wrong indentation; the corrected complete-line comparison passes without a source change. The concurrent D17 owner record and artifacts are preserved, with no D17 acceptance or operation performed here.

Read-only `npm run verify:app -- info` identifies integration digest `b0255d56d826a0e064fe189de356824513905eb322ff68bc691dcc612b24c5f8`. Added archives/instructions and shared verification inputs change that digest; it is not another native run. Original native revisions/digests remain as recorded above. Independent integration/result-record acceptance passes at `3797c7a2`, including both precision fixes, sixteen-file scope and bounded evidence reuse. The completed five-readable-file CLI docs delta covers all four changed D15 records. Its actionable publication-status finding is addressed by the separate checkpoint below; its other minor comment concerns the unchanged D17 receipt outside this PR diff and stays with #1365. No D17 evidence is modified.

## Publication checkpoint

Publication is pending separately from packaging and local acceptance. Push `stabilization/1363-onboarding-consumers` and open a non-draft `Refs #1363` pull request against main from that pushed head. Record the returned PR URL and exact `headRefOid` in its body, alongside the new Actions run and each job result. This is a pre-publication snapshot; current PR/head/CI/review disposition will be maintained in the PR body and reconciled with the next normal same-issue deliverable. Green exact-head checks and completed review without actionable feedback precede the authorized non-migration merge.

## Checks, review and issue remainder

Four focused suites / 65 tests pass for the context, Start modal, interaction and store. Restored context alone passes 30 tests after the deliberately failing live-input mutant. Types report zero errors/warnings; governance reports 504 findings versus 506 on integrated `73cc63fa`, with zero remaining M09 findings and no regression, allowance or provider exception. Scoped source formatting/whitespace pass. The full final-candidate DoD/build will be supplied by exact-head Actions before acceptance. No new database inputs require SQL replay; this does not replace separately required database evidence for any future changed boundary. Latency and peak resources are not measured.

Independent artifact/source readers accept the bounded root baseline/final and six predecessor-record reconciliation changes, including recomputed row comparisons, request bodies, reloads and exact disposal. This is independent artifact review, not another live execution or model diversity. Root packaging freshly extracts all four archives under one shared budget and verifies all expanded inventories and original raw bytes. Complete independent acceptance at `88c1fc9deb361b57a1629e7a64071062c101bef5` covers all sixteen logical paths and four freshly expanded archives: every inventory and original byte, the 41 core/twelve supplementary final observations, scope selection and exact disposal pass. The reviewer’s two prose precision findings concern raw-file/authored-record counts and ignored/tracked-input counts/timing; this record corrects them without source or observation changes. CLI 0.8.2 completes all twelve readable paths against base `73cc63fa`, with zero findings and only the four archive binaries excluded. This remains independent artifact/source acceptance, not independent live execution or model diversity. Latest-main integration/result-record acceptance passes at `3797c7a2`; publication, final metadata review, hosted review and exact-head CI remain pending at this pre-publication snapshot.

The predecessor [#1479 receipt](d15-lifecycle-transitions.md) and [CI record](../../ci.md#arm64-migration-acceptance) now record accepted head `21e4f27a`, all three successful exact-head jobs, completed review without actionable feedback, tree-identical squash integration `73cc63fa` and the successful merged-main run. Robert’s latest non-migration merge authorization supersedes the earlier CI migration no-merge restriction. No billing, production data, branch protection or deployment setting changes here. Repository Vercel configuration does not explicitly disable the branch; external deployment settings remain uninspected, and existing RELEASE operator obligations remain.

Remaining valid API boundaries, broader ordering/concurrency and whole-issue consumer/removal/composition acceptance stay under #1363. Only a fully accepted final deliverable closes the issue. Any new migration stops for Robert’s manual live database application; this deliverable has none.
