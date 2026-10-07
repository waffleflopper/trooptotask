# Training retry and retired-editor repair

Refs #1376. This cohesive prerequisite repairs eight reproduced Training UI failures before the two-port persistence cutover. A failed existing View edit retains its name and ordered columns with useful feedback and explicit retry. Retired record and Person editors stay quiet. Old batch responses cannot enter a replacement workspace, and retired approval acknowledgements cannot emit global feedback.

The repair consumes the View store's false update acknowledgement and uses existing component disposal and approval-helper currentness patterns. Route destruction permanently retires its Training context, including when the user returns to the same Organization. Current errors, drafts and explicit retries remain supported. The unused 288-line ViewEditorModal has no remaining caller or export and is removed. No generic store generation API, server policy or migration is added.

This outcome is independently useful before changing persistence ownership. The later cutover still requires its catalog/completion ports, affected callers and separate provider/native acceptance. Personnel's four-port design is already integrated in #1560. Onboarding, residual settings and final generic facade removal remain within D28. D29/D30 are outside this request.

## Reproduced baseline and preservation

The prior lower-boundary run at `c5145f7b` records eight FAIL and 42 PASS. Its four test files and relevant runtime inputs match the adopted preparation at `369d6e27`; the unchanged run is reused without replay. Failures cover one existing View edit, four retired record save/removal success/failure cases, a retired Person removal error, an old batch merged into B, and an already-dispatched approval acknowledgement after B. New-View failure/retry passed separately. Lost-draft assertions after the first edit failure were not executed.

Fresh owned native baseline at `369d6e27`, candidate `418ecb5c`, reproduces two ISSUES. A controlled existing-View PUT 503 closes the form and loses its draft without changing the saved row. A real held completion POST 200 persists A's row, then emits a stale success toast after native Back admits B. B's originals remain exact. These are failing observations, not application acceptance.

Both UI-created rows are removed natively. The final focused read preserves all eleven originals across eight A/B business sets, without extras. Controls, clean-seeds, final doctor and 5,346-input freeze pass. Supported cleanup completes before the app restart interrupts receipt publication. Recovery repeats no cases, provider reads, doctor, tests, build or cleanup. Actual absence of fourteen processes, ten ports, five containers, one network, two volumes and the worker directory is confirmed. All 41 preexisting containers, seven networks and seventeen volumes remain exact. Root separately confirms process/socket/container absence before source edits.

The [baseline archive](d28-training-repair-baseline-369d6e27.tar.gz) has SHA-256 `bd0039bce9ff510836285345a823b87027f8b4b684d1660ac67ca72cf0bf5353`, 564,030 bytes, 225 payloads and two PNGs. Its inside inventory binds every payload by size/hash. Fresh extraction confirms the exact set and hashes. All 218 original raw files and their inventory are preserved, including reader bytecode and the unsaved-dialog driver correction. Six metadata payloads retain the worker report/receipt, RED log/receipt, input reconciliation and independent design review. Credential scans cover captured files; historical tool transcripts are outside that claim.

## Repair verification and remaining gates

Focused verification passes 20 tests across four files, including the original eight failures and justified current create/retry, removal, batch and approval neighbors. The `-t` selection leaves 33 unrelated cases unselected; it adds no source skip. Three added cases cover a retired editor's approval acknowledgement and disposed-context batch success/transport failure after returning to A. Current batch tests now compare actual stored rows rather than only a merge spy. Type checking reports zero errors and warnings.

The official Svelte autofixer reports no issues in the five changed runtime files. Its suggestions concern unchanged effects that initialize editable form fields; converting those fields to read-only derived values would change the forms and is outside this repair.

Final owned native execution at `6ee9141497217e0013b11ddbc63ec2db71b00fbe`, tree `f574fcf89d1017fda96af080dfd7bfb7596a8520`, passes only the two selected failed baseline cases. Candidate `45462786d3a2082413f4623cc58b2722494de2a1c19d3f1e08e679be950c4bf8` uses Node 24.21.0, npm 11.19.0 and Chromium 152.0.7977.82 with the maintained recipes and unchanged role/scope inputs. P01 retains the failed PUT 503 name and reversed column order, exposes the error and enabled Save, preserves the complete prior saved row, then retries with real PUT 200 and reloads the same ID. P02 holds a real completion POST 200 until native Back admits B. Release produces no feedback or B changes. Returning to A and reloading confirms the committed row. This is one native tab, not shared-session two-tab proof.

Both temporary rows are deleted through the app. All eleven original rows across eight business sets remain exact, without extras. Controls are unarmed, clean-seeds exits zero, final doctor passes and all 5,347 frozen inputs match. Supported cleanup passes. Root separately checks actual absence of fourteen processes, ten ports, five containers, one network, two volumes and the worker directory. The 41 preexisting containers, seven networks and seventeen volumes retain their complete identity/state facts. Docker mount ordering is normalized without dropping fields.

The [final archive](d28-training-repair-final-6ee91414.tar.gz) has SHA-256 `cb9f0244eef64cfcdee0d05739bf40c730f41e2ba8a620359b3ac73913ba6611`, 567,163 bytes, 262 payloads and two PNGs. It preserves all 252 raw captures, their original inventory and nine metadata payloads. Metadata includes the report/receipt, parent closure check, focused test/type/lint logs, autofixer result and completed source reviews. Fresh extraction verifies every expanded hash, byte count and the exact file set. Privacy scans cover captures only. Historical transcripts are outside that claim.

Corrected tool attempts remain preserved. An unsupported `notes` readback filter exits two before any provider operation; the documented `personnel_id` filter supplies the readback while the response remains held. The initial closure comparator treats reordered identical bind mounts as different; the corrected comparison retains every literal field. Neither correction repeats an application case, build, cleanup or business sweep. The production build reports a potentially missing `@opentelemetry/api` warning; the selected application paths function.

Existing lower-level checks establish batch and approval settlement; they do not claim native execution of those races. The twelve future persistence families remain UNRUN on their original candidate. Source/baseline independent review reports Spec GO and no source defect. Its Standards hold requests archive verification instructions, supplied below. Source CodeRabbit reviews all sixteen text paths with zero findings; binary artifacts require separate expanded acceptance. Complete independent expanded acceptance of all eighteen paths at `50e106e0` reports Standards GO, Spec GO and Comment Sicko GO, with zero actionable findings. It independently verifies both expanded inventories, all original/final rowsets, four PNGs, native chronology, freeze and resource observations. Its report has SHA-256 `c1646f8aab6bfe4d9f848fa5e0f8c15533516f3eb3d7458ff602dd02ddb29620`. This is artifact acceptance, not another live execution. Exact-head CI/build and completed hosted reviews without actionable feedback remain release gates. Publication changes only evidence and prose, so the matching runtime proof remains bound to `6ee91414` without another live sweep. #1376 stays open.

## Verify the evidence archives

Run this from the repository root. Each archive extracts into a fresh temporary directory outside the checkout, which is removed afterward. The archive checksum protects its inventory. The expanded checks verify every payload and the exact file set.

```bash
python3 - <<'VERIFY'
import hashlib, json, pathlib, tarfile, tempfile
archives = {
    'd28-training-repair-baseline-369d6e27.tar.gz': 'bd0039bce9ff510836285345a823b87027f8b4b684d1660ac67ca72cf0bf5353',
    'd28-training-repair-final-6ee91414.tar.gz': 'cb9f0244eef64cfcdee0d05739bf40c730f41e2ba8a620359b3ac73913ba6611',
}
for name, expected in archives.items():
    archive = pathlib.Path('docs/stabilization/phase-08') / name
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected, name
    with tempfile.TemporaryDirectory(prefix='t2t-training-evidence-') as scratch:
        root = pathlib.Path(scratch)
        with tarfile.open(archive) as stream:
            stream.extractall(root, filter='data')
        entries = json.loads((root / 'archive-inventory.json').read_text())['entries']
        actual = {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
        assert actual == {entry['path'] for entry in entries} | {'archive-inventory.json'}
        for entry in entries:
            content = (root / entry['path']).read_bytes()
            assert len(content) == entry['bytes'], entry['path']
            assert hashlib.sha256(content).hexdigest() == entry['sha256'], entry['path']
        print(f'{name}: verified {len(entries)} payloads and the exact file set')
VERIFY
```
