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

Final native selection repeats only the two failed baseline cases. Existing lower-level integration checks establish batch and approval settlement; they do not claim native execution of those races. The twelve future persistence families remain UNRUN on their original candidate. Final native proof, expanded independent acceptance, exact-head CI/build and completed reviews without actionable feedback remain pending. #1376 stays open.
