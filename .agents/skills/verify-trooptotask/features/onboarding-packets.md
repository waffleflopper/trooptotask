# Onboarding packets, progress and history

An Organization member starts a Person's Onboarding checklist, records progress and notes, and retains completed or
cancelled packets. Onboarding authority is independent of Personnel and Training; each packet inherits its Person's
Organization and Group scope.

## Sub-features

- `start`: select an existing Person and configured template, preserve the chosen date, snapshot the steps, and prevent
  another active packet for that Person. Authorized Personnel creation is a separate operation through Add Person.
- `progress`: toggle checkbox steps, advance or reverse paperwork stages, retain attributed notes, and derive Training
  completion from the owned Training source.
- `lifecycle-and-history`: cancel, reopen and complete packets, including the explicit warning for incomplete steps;
  retain packet/progress identities and inspect history after reload.
- `reconciliation`: explicitly resync changed definitions or switch templates, preserving completed work/notes and
  inactive removed steps; assigning a template to a legacy packet is a separate case.
- `status-and-order`: each active packet's status (Stalled when an open paperwork step has sat at its stage for 7 or
  more calendar days, Ready when every active step is done, New when none is, otherwise On track), the list order, the
  waiting strip, search and Group filters, and the header's Soldier count, stalled count and typical days to finish.
- `matrix-view`: the List/Matrix `View` control, one grid per template (Soldier rows oldest first, step columns in
  template order), cell states, the ready row's `Close out`, the open-per-step footer, the no-template line, and the
  cell popover with stage controls and notes.
- `packet-link`: `/onboarding?packet=<packet id>` opens that active packet, as the Dashboard's Onboarding rows link to
  it.
- `workspace-reuse`: moving between the Onboarding list, History and Templates keeps the loaded workspace; History and
  Templates load their own page data on every visit.
- `scope-and-recovery`: view cannot mutate; operate manages scoped packets; configure additionally reconciles templates.
  Empty scope and foreign-to-target actors cannot read or change packets. Failed actions require visible feedback,
  retained drafts/state and usable retry; a late A response must not enter B.

## How to get to it (user POV)

Choose Onboard in Organization navigation. The list orders Soldiers in processing Stalled, Ready, On track, then New.
Use `Start onboarding` in the toolbar to select a member, start date and template. Choose a row to open its packet in an
overlay sheet, at every width, to record checklist and stage progress, add notes or close it out. The sheet dims the
list behind it without resizing it; `Close packet`, Escape or a click on the backdrop closes it and focus returns to
that row. While a note on an open step is typed but unsaved, or saving, none of those close it, `Close packet` is
hidden and the note's Cancel is disabled during the save. Completing that step removes its editor and releases the
guard.
`More packet actions` re-syncs, switches or assigns its template, removes an inactive step or cancels the packet. `View`
in the toolbar (or `All n steps` in the waiting strip) switches the page between List and a Matrix of Soldiers by step;
the choice is page state, so a reload returns to List. Choose History to inspect retained packets. Reopening uses the
authenticated packet API; History has no visible Reopen control. Templates opens the separate configuration workflow.

## Helper controls

`onboarding-request PAGE orgA|orgB METHOD FAMILY JSON [start]` sends an ordinary authenticated request from that
signed-in owned app page. It permits `onboarding` POST/PUT, `onboarding-steps` PUT/DELETE and `onboarding-resync` POST,
with only their scalar input fields; it reports exact submitted values, transport status and full business body without
credential headers. It does not apply results to the UI. Start fields are `personnelId`, `templateId` and optional
`startedAt`. Lifecycle PUT uses `id` and `status` for Cancel, Complete or Reopen; the app validates the transition and
its ordinary permissions. Step PUT fields are `action`, `stepId`, `completed`, `stageName` and `text`; DELETE uses `id`.
Reconciliation uses `onboardingId` and optional `newTemplateId`, with no action discriminator. Label this API proof
separately from native clicks and privileged setup/readback.

Optional `start` dispatches immediately and records up to four independent pending requests for a bounded provider
overlap. `onboarding-request-state PAGE` reads their real completed HTTP outcomes or explicit transport/body-capture
failure; it supplies no verdict. An unavailable response body earns no status/body acceptance. Do not navigate/reload or
change actors on that page while requests are pending. Release the recorded provider holder, drain every request and
save its state and native business bodies before `onboarding-request-restore PAGE`; restore refuses pending captures. An
absent capture after navigation does not prove completion or cancellation. This capture touches only its private
verification namespace, not application state or handlers. The
[packet recipe](onboarding-packets.md#supported-step-operations-and-inactive-removal) owns the actual sequence and
expected behavior.

The fixed [Onboarding removal provider helper](../helpers/onboarding-removal-provider.py) targets only the original
ledgered `onboarding-legacy` Paperwork row in this checkout's doctor-verified disposable worker. It accepts no arbitrary
SQL or target IDs. Its `capture`, `fault-on`, `fault-off` and `wait` modes require an explicit worker/session, original
seed capture and durable evidence root. Follow the
[packet recipe](onboarding-packets.md#supported-step-operations-and-inactive-removal) for preparation, exact commands,
observed ordering and cleanup. A successfully installed fault stays armed until `fault-off`; remove it before cleaning
seeds. Offline guards run with
`PYTHONDONTWRITEBYTECODE=1 python3 .agents/skills/verify-trooptotask/helpers/onboarding-removal-provider.test.py`; they
establish no live provider or application outcome.

`seed onboarding-legacy` records a temporary Alpha Person, null-template active packet and three retained progress/note
witnesses before writes. It provides matching Orientation/Paperwork and unmatched Historic task for ordinary visible
assignment, not a fabricated UI result. `seed onboarding-status` records four tagged Alpha/Bravo People with active
packets whose backdated `progress_changed_at` and start dates (counted from the fixture's local date, the day the Active
page counts from) make them Stalled (7 days at a stage), Ready, On track (6 days) and New, plus three recent completions
for the typical-days figure; the [packet recipe](onboarding-packets.md#status-order-and-filters) lists them.
`seed onboarding-matrix` records six tagged People across the canonical template, a second seeded template and no
template, with a stalled, a ready (it has a Training record), a missing-step and a fresh packet; the
[packet recipe](onboarding-packets.md#matrix-view) lists them. `seed onboarding-long-text` records one tagged Alpha
Person on its own template with long step names, long Paperwork stages and an unbroken-URL note; the
[packet recipe](onboarding-packets.md#long-text) uses it for overflow proof.

`seed onboarding-retention` records two expired terminal A packets and recent/null-terminal/active A plus recent B
sentinels, each with progress/notes. `seed onboarding-retention-1001` supplies 1,001 expired completions plus one
expired cancellation and the same sentinels in bounded batches of 100. Clean the earlier seed before another cohort.
`retention cron missing|wrong|run onboarding` uses only `/api/cleanup-expired-onboardings` on this owned app and its
private generated credential, recording the response and any redirect without publishing that credential. The
[packet recipe](onboarding-packets.md) separates native assignment, real job/provider failure/race checks and SQL
security proof. These privileged temporary seeds never establish ordinary authorization. `clean-seeds` deletes only
recorded synthetic rows in reverse dependency order.

## Driving it with verify:app

Preconditions: `doctor` passes for this checkout and worker; `$V fixture` reports the actual Organization, Group,
Person, template and step IDs and local date. A contains Able/Alpha, Baker/Bravo and Unassigned, three configured steps
(Orientation checkbox, Paperwork with Submitted → Reviewed → Filed, and Required Training), and Able's completed March
packet with retained progress/note. B has Foreign and its private template/Training definition. No active packet is
seeded. Use `$V actor ROLE onboarding` or `$V actor ROLE onboarding/history`, then inspect actual loaded data.

1. **Existing Person start and retry:** As `onboardingOperate` (Personnel none), open `Start onboarding`. Inspect A's
   template and eligible Able, Baker and Unassigned choices; Add Person must be absent. Select Able, confirm a visible
   valid date, submit and capture the saved packet and its row. Reload/reopen and compare
   `$V rows personnel_onboardings orgA personnel_id PERSON` and
   `$V rows onboarding_step_progress orgA onboarding_id PACKET`. Require one new in-progress packet, exact
   Person/template/date, fresh step IDs and the three snapshots, checkbox false, paperwork Submitted/incomplete, and
   actual Training-derived completion. Able's original completed packet/progress/note remain unchanged. The active
   Person is no longer a start candidate; separately probe a valid duplicate start and require 409 with no new rows.
   Cancel a separate start draft without a write. Arm `$V network arm-fail PAGE onboarding` before filling a new start
   draft for Baker, then submit: capture 503, readable failure, preserved member/date/template draft and unchanged rows.
   Restore and retry through the retained form; require one saved packet and reload. If the form closes or loses its
   draft, record a failure; manual re-entry is not recovery.
2. **Progress and notes:** Open the active packet. Toggle Orientation complete, reload/reopen, then reverse it and read
   back the same step ID. Advance Paperwork Submitted → Reviewed → Filed; only Filed completes it. Reverse to Reviewed
   and require incomplete. Choose `Add note` on a step, enter a uniquely marked note and `Save note`. Compare its saved
   text, timestamp and authenticated author in `$V rows onboarding_step_progress orgA onboarding_id PACKET`, require it
   under the step after reload, and inspect it again in History's expanded row after completion. Arm `onboarding-steps`
   before opening/filling the next edit (this family reloads the page), then attempt a visible checkbox, paperwork or
   note save. Require 503, rollback/unchanged rows and visible failure, with a failed note keeping its draft; restore
   and retry visibly. Keep request failure, UI recovery and provider persistence separate. While Training is on,
   Training steps have no manual completion toggle. While Training is off they read and toggle as checkboxes, and a
   packet started then starts them open; see the [feature switch recipe](organization-settings-states.md) step 14. With
   Training on, stored completion or an existing matching Training record, including an expired one, completes the
   active step. A step with neither remains incomplete. Completed/cancelled history keeps its snapshots. Compare the
   existing Training record and fresh packet query rather than inferring completion from a checkbox. A real Training
   change uses a separately authorized Training actor and is verified again after Onboarding reload. In the packet
   sheet, type an unsaved note on the open step, expand another step, then reopen the first: the draft text is still in
   the editor. With the draft still unsaved, Escape and a backdrop click leave the sheet open and `Close packet` is
   hidden; Cancel the note, or save it, and the sheet closes normally with focus on its row.
3. **Lifecycle and history:** Cancel an active packet through confirmation; dismissing confirmation first must preserve
   it. After confirmed save require cancelled status/timestamp and the same progress/note IDs, then inspect
   History/reload. Separately reopen the cancelled packet through an ordinary authenticated PUT to `onboarding` with
   `{id,status:'in_progress'}`; require in-progress with cancelledAt cleared and progress retained, then reload/open its
   active row. This is API transition proof followed by visible readback, not a UI reopen action. Reopening while
   another packet for the same Person is active must fail without creating a second active packet. Complete a packet
   with unfinished steps only through `Close out · N open` and its explicit incomplete-step warning; cancellation of
   that warning writes nothing. Confirm completion, inspect history/reload and compare status/completedAt and retained
   snapshots. Native History controls are read-only. The supported step API still admits authorized terminal
   checkbox/stage/note changes; this recipe does not impose an API immutability rule. Inject one `onboarding` lifecycle
   503; unchanged rows, visible error and retained confirmation/retry are required. The completed March witness must not
   disappear or change because a new packet was started. A lifecycle 503 that closes its confirmation is a recovery
   failure even when stored rows remain unchanged.
4. **Template reconciliation:** As Configure, start a temporary packet, then edit a temporary template through the
   [configuration recipe](onboarding-templates.md). Before resync, packet snapshots remain unchanged. Resync must
   refresh matching names/order/types, retain matching progress/notes, add new steps and retain removed steps as
   inactive. Check a reordered definition and a new step inserted before existing ones: the immediate visible sequence
   must follow saved order and remain the same after reload. Delete an actual temporary template definition through
   Templates, then verify its saved progress reference becomes null without changing work/notes. Re-sync must keep that
   same progress ID as inactive, both immediately and after reload. The native `Remove <step>` item in
   `More packet actions` is available only for an incomplete inactive step; verify exact absence. The supported API
   admits any inactive step, including completed retained work, and rejects active removal. Do not infer an API
   prohibition from the narrower native affordance. Switch to a distinct same-Organization template and inspect/reload
   the new definition references and retained inactive work. `onboarding-resync` failure leaves exact saved
   packet/progress unchanged and a visible retry error; restore and retry. Group-scoped configure may reconcile an
   allowed Person's packet without acquiring Organization-wide catalog writes. Before `$V seed onboarding-legacy`,
   duplicate a temporary template through the normal configuration UI and rename its checkbox to exactly Orientation and
   paperwork to exactly Paperwork. Preserve its actual definition IDs/names/types/stages; canonical fixture names
   include Verification and do not match this legacy witness. Then use the seed for a dedicated Alpha Person with a
   null-template packet, completed Orientation, Reviewed Paperwork and unmatched completed Historic task, all with
   notes. Capture exact rows before ordinary native `Assign template`; require name/type matches to retain IDs,
   progress/stages/notes and acquire definition references, unmatched work to remain inactive and new steps to have
   fresh IDs. Reload and repeat Re-sync without duplicates. A deleted-template packet is a separate null-reference case.
   The helper is privileged setup, not UI creation or permission proof.
5. **Access and isolation:** View sees allowed packets/history but no start/progress/lifecycle/reconciliation controls;
   a no-Onboarding viewer cannot enter the feature. Scoped sees only Alpha, including allowed history; Empty sees
   neither Person choices nor packets/history. Use valid ordinary authenticated requests for denied view,
   out-of-Group/Unassigned and foreign Person/packet/step/template combinations; capture 403/404 and compare exact
   before/after rows. A malformed 400 is not access proof. Operate may start/progress/cancel/complete allowed packets
   but must receive 403 for configure-only resync/switch. Operate's `More packet actions` must have no
   `Re-sync with template`, `Assign template` or `Switch template` items; an ordinary denied request proves the separate
   server boundary. Direct SQL writes match it: an Operate member cannot change a packet's template or a step's
   definition fields. No client can delete a packet or an active step; Operate can delete an inactive step. Notes change
   only by one appended note authored by the caller, directly or through the append command. Group-scoped Configure must
   retain reconciliation controls for an allowed Person. Foreign in B can create its own private packet; A actors must
   not see its data or mutate it. Switch A → B → A through the visible Organization menu, inspect/reload each scope, and
   retain B's view-only affordances. Hold a real A packet/progress response after persistence, switch to B, release,
   inspect B, then return to A; stale A rows/drafts/progress must not enter B. Also leave Onboarding while a response is
   held, return to the same Organization and release it; the old response must not overwrite the current workspace or
   close a new form. Restore controls before cleanup. Group catalog: the scoped member's Onboarding page data, and the
   Add Person Group list where Personnel access offers it, name only Alpha; the empty-scope member receives no Group IDs
   or names; an Organization-wide member keeps every Group.
6. **New Person and reverse effects:** As `onboardingPersonnelScopedOperate` (Operate in both lanes, Alpha only), use
   `Start onboarding` → Add Person and the [Personnel lifecycle recipe](personnel-records-lifecycle.md) to create one
   uniquely named active Alpha Person. The Group list offers only Alpha, with no Bravo or `No group`. Verify the saved
   ID is selected, start its packet and reload/read back both IDs. Onboarding-only actors retain lookup labels without
   Personnel creation authority. Independently inspect the owned Calendar active-Onboarding marker before/after
   start/cancel/completion and Dashboard's scoped active count; those are reverse-consumer observations, not inference
   from the Onboarding list. Personnel creation failure cannot silently select an unsaved Person. Visibly cancel
   UI-created active packets and keep their retained history until owned-worker disposal; no visible packet hard-delete
   control exists. Restore other editable fixture fields through supported controls; original witnesses keep their IDs
   and values.

7. **Overlapping first assignments:** Prepare a helper-owned null-template legacy packet and two temporary
   same-Organization templates, each with an exact-name/type Orientation checkbox and distinct definition IDs for its
   other tasks. Use two independently authenticated configure/manage actors. A recorded, ledger-row-restricted provider
   lock can hold the saved Orientation row without changing it while both ordinary assignment requests reach observed
   reconciliation waits. Observe both writer backends (including a transitive blocking chain), then roll back only the
   owned holder and drain both requests. Every successful outcome must leave the parent’s selected template and all
   active linked steps consistent: no active step may reference a definition from the other template, no logical
   definition may have duplicate progress, and original work/notes/history must remain. A rejected competing request
   must be explicit and leave a usable retry. Capture each exact request/status/body,
   parent/progress/template-definition rows, visible packet/reload and final lock absence. Repeat ordinary resync after
   the overlap; require unchanged IDs/counts and consistent active definitions. Separately exercise the native
   `Assign template` provider-rejection/retained-dialog retry, then a native `Switch template` on that assigned packet
   with response, immediate/reloaded state and retained inactive work. Also leave the visible packet open while a second
   ordinary actor switches its saved template. Re-sync from the stale packet must immediately update both the template
   label and active steps to the returned current selection; compare exact saved IDs and reload. This is a stale-client
   consumer check, separately from the simultaneous provider requests. A failed reconciliation must leave the entire
   selected packet/progress state unchanged, including failures after earlier diff writes; actual SQL/provider proof
   owns that rollback boundary. Do not infer an actual race from source, use a browser response hold as a provider lock,
   or require a particular winner/request ordering. Clean the native temporary templates and helper cohort after
   retaining the failure or accepted outcome. It does not establish note or lifecycle concurrency.
8. **Workspace reuse:** As `onboardingOperate` on a settled list, clear resource timings and visit `History`, then its
   `Onboarding` link back. The page-data probe from the skill's Drive section shows one `onboarding/history/__data.json`
   whose Onboarding layout digit is `0`, and nothing for the return. As Configure, `Templates` likewise loads only its
   own page and the return sends nothing; a template saved there appears in the Start Onboarding dialog without a
   reload.
9. **Packet link:** Take an active packet ID from `$V rows personnel_onboardings orgA`. From the org's Onboarding URL,
   append `?packet=<id>` (a Dashboard Onboarding row link does the same). The packet opens in the overlay sheet and the
   address drops the parameter, so a reload shows the plain list with no packet open. An ID that is not an active
   packet, such as a random UUID or a packet no longer in processing, selects nothing and also drops the parameter.
   `Start onboarding` from the page POSTs through the same start the Dashboard uses and the new packet joins the list.

`$V rows` supports `personnel_onboardings` and `onboarding_step_progress` with Person/packet/step filters. Choose one
action (`arm-fail`, `arm-hold` or `arm-observe`) and one family (`onboarding`, `onboarding-steps` or
`onboarding-resync`) per `$V network` invocation, for example `$V network arm-fail PAGE onboarding`. Each targets A's
exact endpoint; restore every hook.

## Status, order and filters

`$V seed onboarding-status` creates four tagged People with active packets on the seeded template. Each packet has a
`Status Orientation <tag>` checkbox and a `Status Finance <tag>` paperwork step (Submitted, Reviewed, Filed). The seed
backdates `progress_changed_at` and `started_at` so the list shows one packet per status:

| Person                              | Group | Status   | Why                                                      |
| ----------------------------------- | ----- | -------- | -------------------------------------------------------- |
| `SPC Statusstalled<tag>, Synthetic` | Alpha | Stalled  | Finance has sat at Reviewed for exactly 7 days           |
| `SPC Statusready<tag>, Synthetic`   | Alpha | Ready    | Both steps are done                                      |
| `SPC StatusonTrack<tag>, Synthetic` | Bravo | On track | Orientation is done; Finance has sat at Submitted 6 days |
| `SPC Statusnew<tag>, Synthetic`     | Alpha | New      | Nothing is done; the packet started today                |

Start dates count from the fixture's local date, the day the Active page counts from, so the New packet reads
`Started today` and `Day 1` even after the UTC date has rolled over. It also records three completed packets for the
first three People, started 30 days ago and finished after 8, 10 and 12 days. With no other completion in the last 90
days, the header reads `Typically 10 days to finish`; otherwise compare against the median of the actual completions.
`clean-seeds` removes all of it.

As `onboardingConfigure` at 1280, then at 390:

1. **Order and header.** The rows read Stalled, Ready, On track, New. Packets started natively during the run sort by
   the same rule. The header subtitle reads `N Soldiers in processing · S stalled · Typically D days to finish`, each
   part present only when it has a value.
2. **Stall boundary.** The Stalled row shows `Status Finance <tag>` with `Reviewed · 7 days` in amber. The On track row
   shows `Submitted · 6 days` in muted text. Open the Stalled packet: Finance's card has the warning border and its
   current stage reads `7 days` in amber.
3. **Advance clears the flag.** Choose `Advance Status Finance <tag> to Filed`. The step completes, the packet becomes
   Ready, and the header's stalled count drops. Read `$V rows onboarding_step_progress orgA onboarding_id PACKET`:
   Finance is `Filed`, `completed` is true and `progress_changed_at` is today. After reload the packet stays Ready.
4. **Waiting strip.** `Where people are waiting` counts open steps by name across the visible packets, at most four,
   with stalled steps first. With only the seed, `Status Finance <tag>` reads `3` and `1 stalled`, and
   `Status Orientation <tag>` reads `1`.
5. **Filters.** Search `StatusOnTrack` and require only that row, with the strip recounted for it. Search also matches
   rank and MOS. Choose `Bravo` in `Group` and require only Bravo People. A search nobody matches shows
   `No Soldiers match`; `Clear filters` restores the search and `All groups`.
6. **Future start date.** Start a packet with a start date a few days ahead. The row's day slot and the packet header
   read `Starts in N days` (`Starts tomorrow` for one day) instead of `Day N`, and the packet is New or On track by its
   progress.

## Matrix view

`$V seed onboarding-matrix` creates six tagged People: `Matrixstalled` (Alpha, Paperwork Reviewed for 9 days),
`Matrixready` (Alpha, every step done, with a real Training record), `Matrixmissing` (Bravo, packet lacks the template's
Training step), `Matrixfresh` (Alpha, started today) on the canonical template, `Matrixreserve` (Alpha) on a seeded
second template, and `Matrixbare` (Alpha) with no template. `clean-seeds` removes all of it, including the Training
record.

As `onboardingConfigure` at 1280, then 390, light and dark:

1. **Switch.** The toolbar has `List` and `Matrix` first; List is pressed by default. At 390 they sit in
   `More Onboarding controls` as radio items when other toolbar items crowd them out. `All n steps` in the strip
   switches to Matrix. Reload returns to List. `$V network arm-*` reloads the page, so choose Matrix again after arming.
2. **Grids.** One `<Template> packet` region per template, the larger packet count first. Each reads
   `N Soldiers × M steps · oldest first`; the first has the legend (Done, Open, `2/3` Paperwork stage, Stalled 7+ days).
   Columns follow template order and show `check`, `paper` or `training`. The stalled Paperwork column is tinted. The
   Standard grid footer `Open on step` reads Orientation 2, Paperwork 3 (`1 stalled`), Training 2 before any action. At
   390 the grid scrolls sideways under a pinned Soldier column; headers clamp to two lines.
3. **Cells.** `Matrixstalled` Paperwork reads `2/3` with `9d` in amber. `Matrixmissing`'s Training cell reads `–` and is
   not a button. The ready row is one cell, `All 3 steps done`, with the underlined link `All done · Close out` under
   the name (its accessible name is `Close out <Soldier>`). `Close out` opens the Complete confirmation; Cancel writes
   nothing; `Mark Complete` writes `completed` with today's date (`$V rows personnel_onboardings orgA`) and the row
   leaves the grid.
4. **Check in place.** Choose an open checkbox cell (`Matrixfresh` Orientation). The cell fills at once;
   `$V rows onboarding_step_progress orgA onboarding_id PACKET` shows `completed: true` with a new
   `progress_changed_at`. With `arm-fail PAGE onboarding-steps` the cell rolls back,
   `Could not update this step. Try again.` shows, and the row is unchanged.
5. **Popover.** A paperwork, training or done cell opens a dialog named `<Soldier>: <step>` anchored to the cell, with
   the headline (`Reviewed for 9 days`, amber when stalled), the stage controls, the latest note with its author and
   `Add note`. The author reads `You` for the signed-in member and `Member` for a member whose name and email are not
   readable to them: the seeded `Matrixstalled` Paperwork note was written by `onboardingConfigure`, so
   `onboardingConfigure` reads `You` and `orgAdmin` reads `Member`. `Advance <step> to Filed` completes the step and
   clears the stall; read back `current_stage`, `completed` and today's `progress_changed_at`. `Add note`, type,
   `Save note` appends one note authored by the actor. A done checkbox offers `Mark <step> incomplete`. A training cell
   offers `Record training` only to an actor with Training access (`trainingOnboarding`, or `trainingOnboardingView` who
   cannot manage the packet); `onboardingConfigure` does not get it. Escape closes the dialog and focus returns to the
   cell.
6. **Late responses.** After `arm-hold PAGE onboarding-steps` and Matrix: save a note on `Matrixmissing` Paperwork (the
   provider row has it while the response is held), Escape, open `Matrixreserve` Records, then `release`. The Reserve
   popover must not gain the note or lose its Add note button; reopening the first cell shows the note. Repeat with
   `Advance ... to Reviewed` on `Matrixmissing` and open `Matrixfresh` Paperwork before release; Fresh's popover stays
   `Not started` and the Missing cell ends at Reviewed. For two overlapping note saves,
   `arm-hold PAGE onboarding-steps 1` holds the first response: on a `Matrixmissing` Paperwork popover save note
   `First`, press Escape while it is pending (Cancel is disabled during a save), reopen the same cell, `Add note` again
   and save `Second` (it answers at once), then `release`. The popover and the packet sheet for the same packet must
   keep showing `Second` as the latest note and both notes after a reload; the provider rows hold both notes in order.
7. **Filters.** Search `Matrixreserve` leaves only the Reserve grid and drops the no-template line. A search nobody
   matches shows `No Soldiers match` with `Clear filters`. Group Alpha drops `Matrixmissing`. Choose the Group with
   ArrowDown and Enter; its options are not in the snapshot.
8. **Access.** `onboardingView`: the line
   `View only. You can't change onboarding steps, so the cells open details only.`, every non-missing cell is a button
   labelled `... Read only. Select for details` that opens a popover with the headline, the stage list and the notes but
   no Add note, Advance or Mark controls and no write request; checkbox cells open the popover instead of checking; no
   Close out. `trainingOnboardingView` (Onboarding and Training view) gets `Record training` in the popover of an open
   Training cell, with no other action; `trainingOnboarding` also checks and advances. `onboardingScoped` sees only
   Alpha rows and manages all of them, so the line
   `Cells for Soldiers outside your groups open details only. You can't manage their onboarding.` (shown only when a
   member sees some Soldiers they cannot manage) is unreachable with the synthetic actors and stays source-mapped.
   `onboardingEmpty` sees `No active onboardings`. `viewer` gets the 403 page.
9. **No template.** `1 packet has no template. Open it in List view to assign one.` appears under the grids while
   `Matrixbare` is visible.

## Long text

`$V seed onboarding-long-text` creates one tagged Alpha Person on a `Long Text <tag>` template whose steps are three
checkboxes (one with a very long name), Training and a last Paperwork step. The Paperwork stages are
`Needs to log in to https://qflowwest.health.mil/QFlow and request access`,
`Started (leave note, have 90 days to complete)` and `Place a ticket (gsc.health.mil) to align to Kamisha's team`,
current at stage 2, with an unbroken-URL note. `clean-seeds` removes all of it.

As `onboardingConfigure` at 1280, then 390, light and dark: nothing may scroll sideways and every stage, step name,
note, done-list line and subtitle wraps in full.

1. **Packet sheet.** Open the packet, then `Paperwork: Access Requests <tag>`. In `Onboarding packet`'s scroll container
   `scrollWidth` equals `clientWidth`, the three stage rows wrap, and `Advance` and the day count stay on their rows.
   Expand the `done` line and the done Paperwork step: still no horizontal scroll. Tab walks `Set ... to <stage>` then
   `Advance ...` in order, and Enter on `Advance` completes the step.
2. **Matrix popover.** Switch to Matrix (at 390 through `More Onboarding controls`) and choose the rightmost cell.
   `document.documentElement.scrollWidth` equals `clientWidth` and the `dialog`'s `getBoundingClientRect()` lies inside
   `[0, innerWidth] × [0, innerHeight]`; a popover taller than the room scrolls inside itself.
3. **History.** Complete the packet (`Close out` → `Mark Complete`), open History and expand its row: the Final packet
   column and the note stay inside their columns.

## Supported step operations and inactive removal

Capture complete selected original A/B Person, Training, packet/progress and template/definition rows before seeding;
these are privileged readbacks, not ordinary authorization. Use `seed onboarding-history` for known terminal/inactive
witnesses and `seed onboarding-legacy` for a dedicated unarchived Alpha Person with an in-progress null-template packet.
History's unarchived Alpha is completed, so it cannot be reopened through the cancelled-only API.

As Onboarding-only Operate, use `onboarding-request` to PUT valid checkbox reversal, a listed Paperwork stage and a
unique note on terminal and inactive witnesses. Terminal status and inactivity do not prohibit these supported writes.
Require real status/body and exact saved fields, existing IDs/notes plus authoritative appended text/time/actor. Wrong
step type, unknown stage and an active DELETE must reject without effects. With valid inactive DELETE bodies, require
View, out-of-Group and foreign-target denial without changed rows. Use the legacy Person's native Personnel Edit modal
as `manager` to move that same Person Alpha → Bravo → no Group → Alpha. At each saved Group require a fresh valid
request as `onboardingScoped`: only current Alpha permits its mutation, while an Organization-wide Onboarding actor
retains unassigned access. Restore the exact original Group and preserve Person identity, names, rank and unrelated
business fields. The Personnel modal resubmits names but keeps the stored slug while they are unchanged, so a helper's
noncanonical slug survives Group edits; require the slug unchanged before and after each save, with actual captured
timestamps; do not invent a timestamp change where the Person table has no such column. Do not misclassify supported URL
normalization as an Onboarding defect or attempt privileged slug restoration. Keep these source-owner UI edits, direct
API outcomes and Onboarding policy readbacks distinct; do not infer permission from malformed 400s or a previously
loaded packet.

For actual native removal, use Configure's `Assign template` on the legacy packet and select canonical Verification
Onboarding A without renaming definitions. Its different names add three fresh active snapshots and retain original
Orientation/Paperwork/Historic work inactive. Require the same original progress IDs, notes, completed
Orientation/Historic and incomplete Reviewed Paperwork; preserve the real assignment response's fresh IDs, then reload.
Capture each native business request and complete response body before navigation; an unavailable preserved body is a
capture gap, not a passed wire observation. As Operate, open that Person's packet. `More packet actions` offers
`Remove Paperwork` only for the incomplete inactive Paperwork; completed inactive work has no Remove item, and inactive
steps are not listed among the packet's steps. Arm `network arm-fail PAGE onboarding-steps` before reopening the packet,
then feedback capture immediately before choosing Remove. Require actual intercepted DELETE 503, restored row, visible
error and unchanged provider rows. Restore hooks and reopen/retry. A separately installed, seed-ID-restricted provider
DELETE fault must instead produce a real server failure with no persisted removal; remove that fault and prove catalog
absence before a real successful native retry, exact provider absence and reload. Client interception is not server
rollback proof. Preserve completed inactive work through the native case, then separately remove it through a valid
ordinary DELETE to establish the broader API contract.

For the inactive-only provider predicate, independently prepare a legacy Paperwork row linked through ordinary native
assignment to a temporary exact-name/type definition. Ordinary switching away must make that same row inactive while
retaining its ID/work/notes. A recorded read-only holder may lock only that ledgered row. Start the ordinary switch-back
reconciliation, observe its actual provider wait, then start a valid DELETE of that still-committed inactive row and
observe the transitive wait chain. Release only the holder, drain both real requests, save exact bodies and compare
authoritative active/work/notes fields. If reconciliation commits reactivation before DELETE proceeds, that now-active
row must survive and the deletion must explicitly reject with 409 without a success audit. The owned ordinary-client
DELETE constrains Organization, ID and `active=false` at the actual write and confirms the affected ID; early
already-active 400 and initially missing 404 remain separate cases. Preserve completed-inactive API deletion without
adding a completion or parent-status filter. Queuing alone establishes no winner or successful mutation; preserve actual
failure/unavailability. No browser response hold substitutes for a provider lock, and no helper directly edits active or
invokes application handlers.

Use separately ledgered fresh legacy cohorts for the provider DELETE fault and the reconciliation/DELETE wait. Never
perform the Group-edit or attributed-note journey on those provider target Persons/rows: the helper deliberately
requires their original Person slug and original saved work/notes. The dedicated Group-edit cohort also keeps its
original slug through its Group edits. Capture each cohort's exact IDs and keep them distinct; no privileged restoration
or relaxed helper predicate is needed.

The fixed provider helper validates the exact running checkout/worker/session/container, authenticated doctor, original
ledgered legacy cohort and prepared work/notes. Run from the repository root with actual owned values:

```bash
P='.agents/skills/verify-trooptotask/helpers/onboarding-removal-provider.py'
PYTHONDONTWRITEBYTECODE=1 python3 "$P" capture --worker "$WORKER" --session-id "$SESSION_ID" --seed "$SEED" --evidence "$EVIDENCE"
PYTHONDONTWRITEBYTECODE=1 python3 "$P" fault-on --worker "$WORKER" --session-id "$SESSION_ID" --seed "$SEED" --evidence "$EVIDENCE" --prepared "$PREPARED"
PYTHONDONTWRITEBYTECODE=1 python3 "$P" fault-off --worker "$WORKER" --session-id "$SESSION_ID" --seed "$SEED" --evidence "$EVIDENCE" --prepared "$PREPARED"
PYTHONDONTWRITEBYTECODE=1 python3 "$P" wait --worker "$WORKER" --session-id "$SESSION_ID" --seed "$SEED" --evidence "$EVIDENCE" --prepared "$PREPARED" --reconcile-body "$RECONCILE_BODY" --delete-body "$DELETE_BODY"
```

`SEED`, `PREPARED`, request body files and `EVIDENCE` are absolute nonsymlink paths beneath this checkout's durable
evidence root. Use the actual `prepared.json` returned by capture; each invocation creates a new evidence directory
without overwriting. Freeze wait bodies as
`{onboardingId: packetId, newTemplateId: originalPaperworkDefinitionTemplateId}` and `{id: originalPaperworkId}`. Wait
for `HOLDING`, start only that ordinary reconciliation, wait for `RECONCILIATION_WAITING`, then start only that DELETE.
The helper must observe DELETE's blocking chain through the same RPC backend to the holder; additional/unclassified
writers or unavailable observations are inconclusive. It auto-rolls back after observed ordering, with a default
35-second observation bound (maximum 60) and separate bounded SQL/cleanup latency. Its held transaction has an
independent 75-second idle timeout. Preserve direct holder/backend absence; timeout or process exit alone supplies no
accepted outcome. Drain and save both page request records before navigation or restoration.

A successful `fault-on` intentionally leaves its exact marked trigger until `fault-off`; require recorded
function/trigger catalog absence before seed cleanup. An install failure attempts exact removal and records any missing
absence proof. A stale/unavailable doctor cannot authorize a different provider for cleanup: stop app work, inspect the
recorded cleanup and use exact owned-worker disposal when supported cleanup cannot proceed. No production or maintenance
database is admitted.

Restore capture namespaces/hooks, temporary Person fields and exact provider objects. Clean native-created temporary
templates through the normal UI, clean recorded helper seeds, and independently check absence of every captured helper
and ordinary-generated progress ID, unchanged selected original A/B rows, final doctor and exact owned resources after
disposal.

## Add Person, Calendar and Training consumers

Use `onboardingPersonnelScoped` for `Start onboarding` → Add Person. Alpha must be the only Group choice, with no
unassigned option. An otherwise valid form without a Group must remain unsaved. Create a uniquely named Alpha Person,
require the confirmed ID selected in the outer form, then start and reload its linked packet. Preserve both saved IDs
and three progress snapshots. Probe valid Personnel create bodies for Bravo, foreign and unassigned targets separately
through that signed-in ordinary session: require 403 and unchanged captured A/B rows. Onboarding-only actors retain
their existing lookup/creation denial contract. Visibly cancel the native-created packet; record its Person/packet IDs
separately because `clean-seeds` does not own them. Retained cancelled history may be disposed with the entire owned
worker; do not claim pre-disposal deletion in that case.

`seed onboarding-consumers` provides a tagged Alpha Person with active and completed packets, a saved incomplete active
Training step, a saved completed inactive Training step and an incomplete terminal Training snapshot for the **same
Person/type**. Each keeps distinct marked notes. Positive active Bravo A and Foreign B packets distinguish real scope
exclusion from empty data. Setup is privileged disposable data; all exact IDs enter the existing ledger before any
insert. It is not native creation or ordinary authority proof.

As Calendar-only `calendarLane`, fresh-load Calendar and inspect the Alpha and Bravo active markers; completed March
history supplies no marker and B remains absent. Use the visible Show Onboarding control: turning it off removes the
cell tint while the header dot remains; restore it to on. Through the separately authorized Onboarding session, cancel
the tagged Alpha packet, reopen it through the supported ordinary API and complete it natively with the incomplete-step
warning. Fresh Calendar loads must respectively remove, restore and remove that Person's marker/tint, preserving other
active markers. Capture actual page/workspace marker reads separately from `calendar-range`, which does not carry marker
IDs. As `calendarScoped`, inspect the positive Alpha marker and exclude Bravo, Unassigned and B. This actor has
Personnel view as well as Calendar operate; the Organization-wide `calendarLane` case independently establishes
Calendar-only access. Capture canonical History/Templates/Training links rather than assuming the URL segment equals the
database UUID.

As `trainingScopedConfig`, save current Required Training for the tagged Alpha Person through its matrix cell, then
delete it visibly with configure authority. Repeat with the literal expired completion/expiration dates from `fixture`,
using the date picker's native month/year/day controls. Current and expired matching records both complete the active
Onboarding Training projection after fresh load; actual deletion makes it incomplete again. The Onboarding session
retains Training none. Terminal and inactive Training snapshots, IDs, notes and raw progress values must remain
unchanged throughout, including the original March witness and B controls. These reference reads do not persist the
derived completion to raw progress. Preserve each real create/delete response and reload/readback; an operate-only
approval request is not deletion.

Restore Calendar preferences and every capture hook, visibly delete temporary Training records, compare full original
A/B business rows, clean the helper cohort and verify its exact absence/empty ledger before final doctor and owned
disposal. Distinguish native actions, ordinary authenticated API observations and privileged setup/readbacks.

## Discriminating History readback

Use `$V seed onboarding-history` for a temporary cohort: completed Alpha, cancelled archived Alpha, completed Bravo, and
completed foreign B Persons/packets. Each retains a checked checkbox, incomplete paperwork (Reviewed in A; an unknown
saved Archived review in B), an incomplete Training snapshot, and completed/pending removed steps, with marked notes.
Alpha has a matching current Training record despite its saved incomplete history step. This is privileged disposable
setup, not UI creation or permission proof; all IDs are recorded before writes and removed by `clean-seeds`.

As `onboardingView`, enter History through the visible Onboarding link and inspect the actual Person names, Groups,
template names, started/terminal dates, statuses and final progress. Open a packet through its native disclosure button,
then exercise Enter/Space and ArrowDown navigation; opening another packet must close the first. Inspect the saved
labels, Reviewed paperwork stage and incomplete Training status despite the matching Training record. Removed steps
follow the active ones with their completed/pending labels. `Notes · N` lists every note on the packet, removed steps'
included, with step, author and date; reload and reopen. History has no note editor. Provider readback still owns each
note's retained text, timestamp and author id. Confirm the terminal packet/progress rows are unchanged by reads and
navigation.

Repeat as `onboardingScoped`: both Alpha names, including the archived Person, remain; Bravo and B are absent.
`onboardingEmpty` has no history. Switch A → B → A through the visible Organization menu as `onboardingSwitch`: B
retains only its own foreign history and view-only packet controls, and returning to A restores only A history. Open B's
foreign packet: its saved unknown paperwork stage must remain identified as Archived review, without marking a listed
stage current. History offers no stage control. These actors have no Personnel/Training lane. Capture
before/action/after/reloaded snapshots, screenshots, ordinary loaded reads and exact packet/progress/Training readbacks.
Compare the cohort and original March witness before and after, clean the helper cohort, then verify exact absence and
the unchanged original witness before owned cleanup.

For the read-only paperwork stage display, open the Alpha completed packet as `onboardingView`. The Paperwork step shows
its saved stage as text (`Reviewed`) in `Final packet · read only`; History offers no stage control. Capture the open
packet in light and dark themes at about 390px and 1440px.

## Raw and readable packet exports

Prepare the helper-owned `onboarding-history` and `onboarding-legacy` cohorts. Capture complete A/B packet/progress rows
with `rows` (including packet created time and progress updated time), Training and `data_exports` before actions. This
supplies active/null-template, completed/cancelled, archived-Person, saved known/unknown stages, saved Training
snapshots, inactive work and retained attributed notes. Original March history remains a separate witness; setup is not
native creation or permission proof.

As `orgOwner`, enter Settings → Exports. Arm `network arm-observe PAGE export` and `export arm PAGE`, select the visible
JSON download, retain actual response status/Content-Type/Content-Disposition, save its captured `.json`, and restore
both controls. Repeat for `export-excel` and the visible Excel control; save actual bytes and inspect readable
**Onboarding Progress**, **Raw - Personnel Onboardings** and **Raw - Onboarding Step Progress** using `workbook`.
Readable progress retains Person labels/status/started/completed/cancelled dates. Raw JSON preserves both top-level and
`sections` keys, exact inventory counts and every saved row/field; raw workbook cells preserve the same IDs, null
references, timestamps, flags, stages and full note text/time/author. Arrays/objects serialize as JSON cells and null
cells are empty. Require all A packet/progress IDs and no B IDs. The unknown-stage witness belongs to B and is excluded;
same-Organization unknown-stage preservation is covered by the raw-read contract checks. Exports must use saved Training
completion rather than recompute terminal work. Capture reload/visible export result and actual lifecycle rows,
requester, completed status, byte count and timestamps separately from the download; lifecycle updates remain
best-effort.

Use an Onboarding-only actor's Settings/Exports denial and ordinary `export request PAGE orgA json|excel` to establish
admission independently of packet access. Also request foreign B as the A owner. Preserve exact request/status/body and
unchanged A/B export records and packet/progress; a malformed method or body is not permission proof. Organization
export admission is the owner/admin/member-manager rule and source RLS, with no Onboarding lane requirement or
privileged packet provider.

Exercise a visible failed export and retry: arm `network arm-fail PAGE export|export-excel` with Blob capture, click the
actual download control, require readable failure, no captured artifact and no successful export lifecycle row, restore
the network control, arm ordinary observation and retry visibly. Require real 200/artifact and unchanged saved
packet/progress. A client503 is UI recovery, not provider failure. Existing export execution/lifecycle checks own their
separate saved-failure boundary; any actual synthetic provider fault needs its own recorded setup, restoration and
outcomes. Restore every capture before cleanup. Clean helper cohorts, compare original full packet/progress fields and
Training, record resulting export lifecycle rows separately, finish doctor/owned disposal, and package actual files
byte-for-byte only after cleanup.

## Ordinary note and lifecycle overlaps

Use fresh ledgered `onboarding-legacy` cohorts separately for notes and lifecycle, keeping the original March history
unchanged. Ordinary Operate and Configure actors use valid step/parent IDs in their allowed Alpha scope. Warm their
sessions with a valid-shaped request to a target UUID proven absent in the captured table before the write. These are
ordinary authenticated API observations, with native readback separately identified.

For note append, hold only the cohort’s recorded Orientation progress row without changing it; send two ordinary addNote
requests with distinct markers. Observe both exact `public.append_onboarding_step_note` RPC backends waiting directly or
transitively on the exact held backend, capture unchanged committed parent/progress, then roll back the holder and drain
both requests. Two successful additions must retain original notes and exactly one of each new marker with its
authenticated author and valid saved timestamp. Later inspect the saved notes through native History after a supported
terminal transition/reload. The packet's `Add note` is the native editor; this overlap uses ordinary requests so two
appends wait together. Separate isolated SQL checks cover current capability/Person scope after a real wait, rollback,
saved attributes and supported terminal/inactive edits. One normal request makes one RPC transaction; this does not
establish safety for several direct appends within a caller-managed transaction or arbitrary direct writers.

For lifecycle, hold only a new cohort’s recorded in-progress parent with null terminal dates; send ordinary cancel and
complete requests. Observe both parent UPDATE waits against unchanged committed state, release, and drain. Exactly one
transition from that shared active state may succeed; the conditional provider’s waiting stale request must report 409
without a success audit. The successful ordinary response must match the authoritative saved status and terminal dates.
The saved status has its matching terminal timestamp and no contradictory terminal timestamp. Inspect that packet’s
native History summary and reload, including the absence of the opposite terminal date. Retain existing sequential
invalid-transition 400 behavior; do not assume which concurrent request wins. Separately use a fresh cohort for native
Cancel → supported API Reopen → native Complete with the unfinished-step warning; dismiss each confirmation before
saving and require no request or saved effect. Reopen clears both terminal dates and retains checklist
identities/work/notes. Repeated terminal transitions must fail without changing captured rows. This separately verifies
the three operations through the same conditional provider; it does not establish every mutation overlap or an atomic
count against simultaneous step edits.

Use only the authenticated doctor’s exact disposable project/container, recorded seed ledger and PID/backend-start
identity. Release the holder in every outcome and prove its absence; drain each HTTP process independently before
cleaning cohorts. Missing two waits, timing out or forced child cleanup is inconclusive. Record actual failed
expectations, full before/after A/B packet/progress and selected Training, native snapshots/reload, doctor and exact
disposal.

### Later selections while saves are pending

Use a fresh `onboarding-legacy` cohort and normal `onboardingOperate` session. Preserve original A/B Personnel,
packet/progress and Training rows. Open the tagged native packet and save Paperwork → Submitted; require the same step
ID, Submitted/incomplete, unchanged retained notes and a matching reload. Arm `network arm-hold PAGE onboarding-steps 1`
before reopening that packet, then select Reviewed. This holds delivery after the real response: require one matching
PUT, a real 200, `held=true`, and provider Reviewed/incomplete before the next selection. Unavailable readback/transport
evidence or a missing hold makes the attempt inconclusive. A matched successful request with an available exact readback
that contradicts Reviewed/incomplete is an observed product failure.

From a fresh snapshot select Filed. Preserve both exact native business request/response bodies before navigation. Once
the second request succeeds and the provider is Filed/complete, the immediate UI must show that confirmed state. Release
the older Reviewed response and require the UI to retain Filed/complete, the provider to remain Filed, and reload/reopen
to agree. Capture any immediate disagreement before corrective reload; reload alone cannot pass this case. Open the
done-steps toggle and the done paperwork step's stage controls when present to inspect the actual current stage. Compare
unchanged parent/progress IDs, other steps and notes. This causal sequence proves response delivery against known
persistence order; it does not promise a winner for unknown backend order or a later independent writer. Restore the
hook, clean only ledgered rows, compare originals, finish doctor and exact owned disposal. Native interaction, provider
readback and lower deferred-response checks remain distinct evidence.

Also preserve independent checklist edits in that packet: from a known Filed/complete state, hold a real native
Paperwork reversal to Reviewed after persistence, then toggle the completed Orientation checkbox incomplete. Require
both saved values and both immediate visible values, release the held stage response, then reload/reopen and compare the
same IDs and retained notes. Restore the hook before testing failure. Arm one `onboarding-steps` failure and rendered
feedback capture before opening the packet; a native stage selection must report the synthetic 503, roll back to the
saved stage and show an error. Restore, reopen and retry the same selection successfully, with exact provider readback
and reload. Keep these separate from provider rollback or authorization proof. Lower deferred-response checks cover a
newer selection failing while an older request is pending, retained removal and freshly loaded notes, same-Organization
refresh, and invalidation when leaving the workspace.

### Reversing a checkbox while its saved response is held

Use a fresh ledgered `onboarding-legacy` cohort and normal Onboarding-only Operate actor. Capture original A/B
Personnel, packets, progress, Training, templates and definitions before setup; privileged seeds/readbacks are separate
from the native action. The seed's Orientation checkbox starts complete. First reverse it through **Mark Orientation
incomplete**, require the real saved response and exact incomplete provider row, then reload/reopen to confirm
incomplete before arming the hold. Arm `network arm-hold PAGE onboarding-steps 1` before opening its tagged packet.
Click **Mark Orientation complete**. Require the exact ordinary PUT body, real 200 response held after persistence, the
same progress ID saved complete, and native optimistic completion. Open the done-steps toggle and click **Mark
Orientation incomplete** while that first response remains held. Require the second exact PUT/200 body, saved incomplete
and immediate native incomplete. Release the older response; native state must remain incomplete, with unchanged saved
rows. Reload/reopen and require the same state and identities. Save request/response bodies before navigation; missing
hold or unreadable persistence/body evidence is inconclusive. Record immediate or late native disagreement as a failure
before corrective reload. This proves delivery order after known persistence order, not a winner for requests whose
provider order is unknown.

On a fresh arm, fail one native completion with `network arm-fail PAGE onboarding-steps` and rendered feedback capture.
Require readable error, incomplete rollback and unchanged rows; restore and retry visibly to real 200, complete and
matching reload. Reversing back incomplete restores the starting value. Preserve unrelated Paperwork/Training progress
and notes. Deferred-response store checks separately cover a newer reversal failing while an older completion is
pending, independent step progress and freshly loaded notes, same-Organization refresh and Organization/invalidation
guards. They do not claim native note creation or SQL rollback. Restore all hooks, remove only ledgered seeds, compare
every captured original field and temporary-ID absence, finish doctor and verify exact owned disposal.

### Re-sync and template response delivery

Use normal Onboarding-only Configure in an owned worker. Capture all original A/B Personnel, packets, progress,
Training, templates and definitions before setup. Through the normal Templates UI, duplicate two uniquely named
temporary templates in Organization A; rename their actual checkbox and paperwork definitions to exactly **Orientation**
and **Paperwork**. Preserve the real definition IDs and remaining steps. Canonical fixture names include Verification
and do not match the legacy seed. Seed one ledgered `onboarding-legacy` cohort, then normally `Assign template` A,
requiring real saved response, retained matching progress IDs/work/notes, inactive Historic task and matching reload. A
null-template Re-sync is not a valid ordering witness. Prepare Orientation incomplete natively and confirm the provider
row/reload before the first hold.

1. **Re-sync followed by saved progress:** Arm `network arm-hold PAGE onboarding-resync 1` before reopening the packet;
   arming reloads. Choose `Re-sync with template` in `More packet actions` and require its real 200 response held after
   persistence. Save its full ordinary request/response bodies and provider rows. While held, natively complete
   Orientation and require its real PUT/200, exact saved true and immediate native complete. Release the older Re-sync
   response: completion must remain visible, with the same saved step ID, notes and sibling work. Reload/reopen must
   agree. Record any disagreement before corrective reload.
2. **Re-sync followed by a saved template choice:** From the assigned packet, hold another real saved Re-sync response.
   Normally `Switch template` to distinct temporary B while the older response waits. Require the newer real 200, saved
   B and its actual active/inactive definition references/IDs, immediate native template/checklist and retained older
   work/notes. Release Re-sync: B and its checklist must remain visible and saved. Reload/reopen and compare the same
   IDs. The newer template selection is not inferred from a queued request or dialog closure.
3. **Fresh definitions while progress waits:** On B, prepare Orientation incomplete natively when necessary and require
   its saved row/reload before arming. Then use `onboarding-steps` to hold one real native completion response after
   persistence, reopening the packet after arming. In a second native page in the same owned actor context, normally add
   one uniquely named checkbox definition to temporary B. Capture its real saved ID/order. Re-sync the first page
   normally while the earlier step response remains held. Require its real 200 and saved new progress ID. The new
   definition/order must appear immediately alongside the pending checkbox selection, before releasing that response.
   Release, then reload/reopen: identities, notes, progress and the new definition must remain. A definition appearing
   only after release or reload fails the immediate expectation.

4. **A newer reconciliation resets an invalid stage:** On temporary B, prepare Paperwork at Submitted/incomplete and
   confirm saved state before arming. Hold a real native Filed completion response after persistence. In the second
   normal owned page, edit only B’s Paperwork definition and remove Filed, retaining Submitted/Reviewed in order.
   Re-sync the first page normally; require its real 200 and the same progress ID reset to Submitted/incomplete with
   updated stages, retained notes and other work. That newer authoritative reset must appear immediately and survive the
   older Filed response release/reload. The reset follows the existing invalid-stage reconciliation contract; older
   delivery must not restore a stage absent from the returned definition. Unknown persistence order remains a separate
   limit.

Restore controls between cases; only one network family can be held or failed at a time. Separately exercise one
`onboarding-resync` client503 for native Re-sync and another for native Switch. Require each path’s readable error and
unchanged saved work, with the Switch draft retained; restore and retry each visibly to real 200 and matching reload.
Re-sync feedback must be readable inside its open packet, and must not appear in another packet. Deferred public-store
checks cover a newer failed progress/template request while an older response waits, same-template return choices,
inactive removal, independent saved fields, refresh and Organization/invalidation guards. Context checks separately
cover Switch/Assign old success/failure after reopening, a newer submission already pending, Re-sync callback ordering,
and existing lifetime guards. These prove their client seam, not provider rollback or unknown database order. For native
draft lifetime, hold an actual Switch response after persistence, normally Cancel/close its dialog and open a new Switch
draft. Require the new draft enabled with its selected template before releasing the older response. Releasing that
older completion must preserve the new dialog and selection; do not submit the new draft merely to hide a failure.
Record the immediate outcome, then cancel without a write. A held Re-sync alone does not exercise the Switch completion
handler. Return the packet to B through normal Switch before the final History journey when necessary.

After all held requests settle, a separate ordinary authenticated note append to a current active B step followed by
native Cancel/History disclosure can verify retained supported API notes and read-only History, where every note lists
its step, author and date. This does not use a native note editor. Restore every hook/feedback capture, clean only
ledgered cohorts, normally delete the temporary templates, compare every captured original field and verify all recorded
generated Person/packet/progress/template/definition IDs absent. Finish doctor and exact owned disposal. These cases
establish delivery after known persistence order, not a winner for unordered writes or another independent writer.

## Start save failure and retry

Use one fresh `seed onboarding-start` cohort at a time. It creates one recorded Alpha Person and one expired matching
Training record, with no packet/progress, referencing the original three-step template. First drive a valid native Start
as `onboardingOperate` (Personnel/Training lanes absent), compare all saved snapshot fields/IDs and reload; matching
Training presence remains complete even when expired. Restore request observations, run `clean-seeds`, and compare
complete original A/B rows. Person deletion cascades only this declared cohort's native packet/progress; audit records
may remain until whole-worker disposal.

For a fresh second cohort, use the fixed [Start provider helper](../helpers/onboarding-start-provider.py). Capture all
original A/B Personnel, packets, progress, Training, templates and definitions before seeding. Save the actual seed
output and doctor session UUID. The helper accepts only the same checkout's running doctor-verified disposable worker
and exact helper ledger; it accepts no arbitrary SQL or target ID:

```bash
python3 .agents/skills/verify-trooptotask/helpers/onboarding-start-provider.py capture \
  --worker "$WORKER" --session-id SESSION_UUID --seed .verification/evidence/verify-trooptotask/RUN/seed.json \
  --evidence .verification/evidence/verify-trooptotask/RUN
```

Use the returned `prepared.json` with identical arguments plus `--prepared PATH` for `fault-on`, `readback` and
`fault-off`. `fault-on` installs two marker-owned, Person/Organization-restricted provider faults: progress INSERT and
compensating parent DELETE each raise `P0001`. Preserve their exact SQL and actual catalog results. This paired failure
is a deliberate deterministic case; a single ordinary provider fault does not produce both failures.

Arm ordinary request observation without interception, then open the tagged Person/template/date native draft and submit
Start. Capture the real POST/body/status, readable error, retained draft, provider parent/progress and all original
rows. The real failure must leave no saved parent or steps and a usable retry; an error followed by an active zero-step
parent is a failure. Restore both faults with `fault-off`, prove every owned function/trigger absent and retry the same
native draft. The retry must save exactly one complete three-step packet with the original prepared
defaults/Training-presence behavior, retained input and matching reload; a 409 retaining an empty parent is a failure.

Run `PYTHONDONTWRITEBYTECODE=1 python3 .agents/skills/verify-trooptotask/helpers/onboarding-start-provider.test.py` for
target and cleanup guard checks; those are not provider acceptance. SQL/ordinary-client checks separately own
transaction rollback, the caller check before Start writes as its owner, grants, scope denials, template-derived steps,
simultaneous Starts and populated upgrade. They do not substitute for native Start/error/retry/reload. Capture every
generated parent/step ID before seed cleanup, verify actual cascade absence and full originals, finish doctor and exact
owned disposal, then package artifacts. Restore faults before `clean-seeds`, even after a failed drive. A committed
success whose response is lost may still leave one complete packet; this selection does not promise exactly-once
delivery.

New Start requires a configured template. On a fresh declared Person, separately submit ordinary authenticated POST
bodies with missing/null/empty or non-string template values; require 400 and no packet/progress, without treating
historical null-template packets as new Start inputs. A valid nonexistent or foreign template UUID must receive 404
without effects. Use valid Person/template/date bodies for separate view, empty-Group, out-of-Group, Unassigned and
foreign-actor denials; malformed input is not authorization proof. Organization-wide operation retains Unassigned and
existing archived-Person API behavior; SQL/provider checks own those non-native cases.

Preserve valid configured empty-template support. As Configure, create one uniquely named temporary template through
Templates without adding steps, capture its saved ID and actual empty definitions, then reload. Use a fresh
`onboarding-start` Person as Operate, select this specific template through the normal Start selector, confirm
Member/date and submit. Require a real 200, one in-progress parent with that template ID and zero progress, matching
native row and packet after reload. This valid empty definition set is separate from a failed three-step save. Clean
only the declared Person cohort. Delete the temporary template through visible confirmation, then read back its absence.
Compare every captured field in the full original rowsets; the maintained row helper projects columns. No original
template or definition needs editing.

## Fresh Person packet journey

Use one fresh owned journey. As `onboardingPersonnelScoped`, open Start → Add Person, choose an active rank and Alpha,
save unique names, and require the confirmed Person ID selected in Member. Native Start must save that exact
Person/template/date and three fresh progress IDs; inspect the row and packet and reload. Open Start again and verify
the active Person is excluded without submitting another packet. Arm one `onboarding-steps` failure and feedback capture
before reopening the packet; native Orientation completion must roll back incomplete, show readable feedback and leave
complete selected provider rows unchanged. Restore hooks, retry visibly, retain full real PUT body/response and provider
completion, open the done-steps toggle and reload. Client503 is intercepted UI recovery, not a real wire/provider fault.

Add a unique saved note by ordinary authenticated `onboarding-request PAGE orgA PUT onboarding-steps` with
`{action:'addNote',stepId,text}`; retain actual status/body, saved author/time and complete step rows, without claiming
a native editor. Select Paperwork Reviewed through the native detail and require the saved stage/incomplete state.
Native Cancel carries the same packet/work to History. As read-only `onboardingView`, exercise native
Enter/Space/ArrowDown and single-open disclosures against that packet and the original March witness, read the saved
note with its step, author and date, inspect the Reviewed stage, then reload/reopen. Saved notes and progress identities
must survive the terminal transition and every read.

Capture all full original A/B Personnel, packets, progress, Training, templates and definitions before the first
mutation and compare after. Helper cleanup owns ledgered seeds only; a native-created Person/cancelled packet may remain
until exact owned-worker disposal and must be identified as residual, without claiming pre-disposal hard deletion.
Restore every capture, finish doctor and supported owned cleanup, and independently verify exact owned
process/container/volume/network/private-directory absence.

### Independent packet Re-sync feedback

Re-sync loading, result lifetime and failure belong to the affected packet. On two distinct configured active packets in
the owned synthetic Organization, fail A Re-sync using the documented client503 control; require its own readable error
in its packet, enabled retry and unchanged saved rows. Restore, close A, open B and normally Re-sync B to real200/saved
readback. Returning to A must preserve its failure and enabled retry; B must never inherit A's error. Retry A normally
to real200, require its feedback clears and reload matches saved work. Capture the initial failure before
correction/reload. The `onboarding-legacy` plus small `onboarding-retention` ledger cohorts supply distinct active
People; normally Assign the legacy packet first. This feedback proof does not invoke the retention job. Clean both
ledger cohorts and compare full projected originals before owned disposal.

Deferred context checks separately require independent A/B loading and failures while requests overlap, and suppress
older feedback only when a newer request supersedes it for the same packet. Preserve global banner dismissal and
Organization/disposal guards. Delayed public-store nonOK body and thrown-request checks establish invalidated failure
result consistency separately; native synthetic503 is not provider failure.

## Reopen collision and retry

Use a fresh owned `onboarding-legacy` seed as `onboardingOperate`; no template assignment or new seed is required.
Capture all original projected A/B Personnel, packets, progress, Training, templates and definitions before setup.
Normally Cancel the legacy packet, inspect History and reload, preserving its saved cancellation date and every retained
progress/note field. Return to Onboarding and normally Start a configured packet for that same temporary Person.
Preserve the actual submitted Person/template/date, real200, competing parent and fresh progress IDs; reload and require
exactly one active packet.

With no synthetic failure or hold, use
`$V onboarding-request PAGE orgA PUT onboarding '{"id":"OLD_CANCELLED_PACKET_UUID","status":"in_progress"}'`,
substituting this run's cancelled ID. Require an actual rejected request and full submitted/status/body receipt, both
parents and all progress unchanged, and only the competitor active. The existing unique active-packet constraint may
surface as500; do not impose the conditional-transition409 contract on this different failure. Preserve the
corresponding sanitized diagnostic naming `personnel_onboardings_active_idx` from this owned worker's private `app.log`
before disposal, separately from the HTTP body. A generic500 alone does not establish the rejection's cause; do not
claim an observed numeric provider code when only the constraint diagnostic is available.

Natively Cancel the competitor, preserve its real200 and unchanged work, then retry the identical ordinary Reopen body.
Require real200, the original ID/in-progress status, both terminal dates cleared, and unchanged
Person/template/start/created time and every retained progress ID/work/stage/note/timestamp. The competitor remains
cancelled. Reload/open the original active row and inspect its retained work. This is ordinary API Reopen followed by
native readback, without a native Reopen control. Use fresh snapshot UIDs for the unique seeded Person, Start's Member
choice and both Cancel confirmations.

`clean-seeds` owns the legacy Person/parent/progress, not the normally created competitor IDs. Deleting that ledgered
temporary Person also cascades its packets/progress under the existing foreign keys; record the ordinary generated IDs
and prove their actual absence after cleanup rather than claiming direct ledger ownership. Compare every captured
original field, drain/restore all request controls, and finish doctor and exact owned disposal. No existing local or
remote database is used.

## Separate retention/provider proof

`$V seed onboarding-retention` creates expired completed/cancelled A packets and recent, null-terminal, active A and
recent B sentinels, each with a retained note/progress witness. All IDs are recorded before writes.
`$V retention cron missing|wrong|run onboarding` targets only the owned app's `/api/cleanup-expired-onboardings`;
missing/wrong credentials must return 401 without effects. An admitted real job must remove only expired terminal
parents and their progress, report actual counts and notify administrators; repeat reports zero.
`$V seed onboarding-retention-1001` prepares 1,001 expired completed packets plus one expired cancellation and the same
bounded sentinels, proving actual provider traversal beyond its default page. Clean the first seed before starting the
larger cohort.

Preserve original March history and all retained sentinels. Separately use a recorded, seed-ID-restricted fault on only
the owned disposable provider: rejected parent deletion must leave parent and progress/note together. A supported reopen
or recent re-cancellation between discovery and deletion must preserve the now-ineligible packet and progress; compare
actual rows/counts. Freeze and retain the exact controlled SQL/probe and restore every temporary fault before cleanup.
Client503 is not provider proof. Existing notification-failure and strict-cutoff/month-end service tests cover their
distinct boundaries without freezing the app clock. Run existing workflow RLS SQL only from the verified disposable
provider directory; never use the maintenance stack or legacy seed.

### Retention, History and export composition

Use the small `onboarding-retention` cohort for current composition: two expired terminal A packets and six
recent/null-terminal/active A/recent B sentinels, each with a retained note. Read `$V retention settings` first and
preserve actual settings and all A/B packet/progress fields. The admitted job processes every synthetic Organization, so
B must remain unexpired. Before the job, open both expired witnesses in native History and disclose their tagged
steps/notes; inspect a recent completion and null-terminal cancellation too. Their collapsed captions share a
Person/start date; distinguish status and terminal date, then verify the exact tagged step after opening. Do not infer
packet identity from row position.

Run the documented missing/wrong credential checks without effects, then the real admitted onboarding cron.
Require200/count2/one affected Organization, exact expired parent/progress absence, and every captured survivor field
unchanged, including March history and any recently cancelled/reopened collision cohort. Capture actual administrator
summaries separately. Repeat must report200/zero/zero with no further row or notification changes. After native History
navigation and a separate reload, both expired witnesses are absent; recent/null-terminal histories and their disclosed
note text/time remain. Active packets belong to the active page. These observations do not replace fixed-time cutoff,
provider fault/race or bulk traversal proof; reuse those accepted boundaries only after their actual inputs and
surviving source are checked.

As normal `orgOwner` in Settings → Exports, use the [raw/readable export controls](#raw-and-readable-packet-exports) for
actual native Export JSON and Export Excel clicks, ordinary observation and saved Blob bytes. Require deleted
packet/progress IDs absent, every surviving A ID present and B IDs absent. Compare every captured saved field and nested
note text/time/author in both JSON top-level/section arrays and Excel raw sheets, with inventory counts matching actual
rows. Inspect `Onboarding Progress`, `Raw - Personnel Onboardings` and `Raw - Onboarding Step Progress` using
`$V workbook`. The readable sheet carries Person/status/start/completed/cancelled values; notes/stages/IDs belong to raw
sections. Decode JSON-valued workbook cells and treat nulls as empty cells; compare readable duplicate rows without
relying on incidental order. Reload the visible export controls and separately record actual export lifecycle
requester/status/bytes/completion time instead of inferring tracking from a download.

Restore every network/Blob/request control, clean the ledger cohorts, prove all recorded generated IDs absent and every
original projected field unchanged, then finish matching doctor/frozen inputs and exact owned disposal. New
export/audit/notification rows are separate declared effects until whole-provider disposal; `clean-seeds` does not own
them.

## Gotchas

- Feature entry, row labels and closed dialogs do not establish persistence or permission. Compare actual
  packet/progress IDs, values and ordinary authenticated response statuses.
- Network `onboarding-steps` and `onboarding-resync` controls reload before adapter creation; arm before opening a
  draft. `onboarding` uses the current page. Client503/held-response proof does not establish a multiwrite provider
  transaction or concurrency guarantee.
- Completing with incomplete steps is intentionally supported with warning and an audit count. Training completion is
  source-derived; preserve that distinction from manual checkbox and paperwork progress.
- Completed packet snapshots survive template edits/deletion. Do not automatically resync history or confuse a template
  definition with its saved progress snapshot.
- Retention cutoff, deletion counts, permissions and provider failure require separate service/SQL proof. UI history is
  not proof of retention and source inspection is not live evidence.
- Existing lifecycle/query/progress/resync/retention, route, store, interaction and SQL `onboarding_workflow_rls.sql`
  and `feature_direct_write_authority.sql` checks own distinct lower-level behavior. Reuse them.

Compare complete eight-key parent, thirteen-key nested progress (with `progress_changed_at`) and seven-key progress
acknowledgements against separately captured saved rows. Missing nullable references/stages/currentStage map to null,
nonarray notes to an empty array and missing/null active to true. Array note items retain legacy authorless content.
Dashboard and terminal History retain saved Training progress; active workspace hydration remains a separate admitted
reference read.

Bind resource closure to the doctor's exact project/container IDs and recorded process start identities. An
all-new-container diff can include an unrelated project. Record those resource differences separately, verify owned
mounted-volume names and network name/label absence, and retain any unavailable historical full network ID as a
limitation. Keep credential-bearing Docker inspection and exact SSR-auth originals private with mode0600; check actual
known token literals across public captures before packaging.

## Training switched off during a packet

With Onboarding on and Training off, resync, switch, and assign responses keep Training steps as manual checkboxes
without a reload. Tick one, re-enable Training, and reload: its saved completion remains visible even without a matching
Training record. Onboarding receives only Training type IDs and names, including while Training is on.
