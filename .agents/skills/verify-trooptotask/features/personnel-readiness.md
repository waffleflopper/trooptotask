# Personnel Readiness tab

A leader opens one Soldier's Readiness tab to see every training requirement and critical task with its status, the
active evaluation, loss dates and onboarding progress. From the same tab they log a completion with a certificate,
correct a past completion, mark an item exempt and record a critical-task validation. The tab badge in the record header
counts training requirements and critical tasks that need attention.

## Sub-features

- `readiness-tables`: Training and Critical tasks tables list problem rows first (Expired, Missing, Expiring), then a
  `CURRENT · N` group, with `N of M ready` and a footer naming not-required and exempt counts.
- `readiness-rail`: Evaluation, Loss and Onboarding blocks beside the tables.
- `readiness-sources`: each of the five sources streams and fails on its own. A failed or denied source reads
  `Couldn't check <source>. Reload the page to try again.` and never reads as clear. Organization switches that disable
  Training, Critical Tasks, Evals or Onboarding omit their blocks without an error; Loss still renders.
- `readiness-badge`: the layout streams the badge, counting only training and critical-task problems. Only failures
  of those two sources make it incomplete; evaluation, loss and onboarding failures do not. Complete:
  `N item(s) need(s) attention`, hidden at zero. Incomplete:
  `N+` labelled `N or more items need attention`, or `–` labelled `not every item could be checked`. Hidden from a
  viewer who cannot read the Person's sensitive records.
- `training-drawer`: log a completion (`Expires on` for expiration-date-only types, `Completed on` otherwise) with an
  optional certificate (a PDF or a JPG, PNG or HEIC photo, up to 10 MB,
  checked by its leading bytes), see History with certificate links, correct a past completion in place, and mark exempt
  with a ten-second Undo. A new completion's Notes are exactly what the form sent, so blank Notes clear the current note
  while History keeps the old one. A completion saved without dates still lands in History when a new completion
  replaces it, even after its type gains a cycle. An uploaded certificate opens through the app; a legacy certificate
  URL shows as `Certificate on <host>` and links straight to that site, and the app's certificate route refuses it.
- `critical-task-drawer`: record a validation with method, validator and notes, or correct a History entry in place.
- `readiness-intents`: `?item=training:<typeId>` or `?item=critical-task:<taskId>` opens that item's drawer;
  `?add=training` or `?add=critical-task` opens the picker. An id that no longer applies opens the picker. Closing
  removes the parameter without a navigation.

## How to get to it (user POV)

Choose `Personnel`, open a Person, then choose the `Readiness` tab under the record header. Choose a row anywhere, its
title, detail line or an empty cell, to open its drawer, or `Log completion` and `Record validation` for the picker.

## Driving it with verify:app

Preconditions: owned launch and `doctor` pass; set `V` per the index. `$V actor orgOwner personnel` signs in the owner.
Able (`verify-able`, 68W, Alpha) has Required training current, Targeted training missing, Optional training not
required, and one of two critical tasks validated, so the badge starts at `2 items need attention`. No seeded training
type allows exemption. As the owner, open Training → Types, choose a type, `Edit`, tick `Can be exempted` and `Save`,
then confirm with `$V rows training_types orgA`.

1. **Loaded.** Open `personnel/verify-able/readiness`. Expect both tables, the rail and the badge. Set a marker with
   `evaluate_script` (`window.__marker = 1`) to prove later saves do not reload.
2. **Skeleton.** `$V server-source arm personnel_trainings hold 1 120000`, then choose the Readiness tab from Overview.
   Training shows a busy skeleton while critical tasks and the rail render. The skeleton is shaped like the smallest
   typical table (one problem, the Current group row, one current item and the footer), so for a Person with one of
   each, such as Able, `Critical tasks` keeps its top when Training loads. Each additional row adds 57 px.
   `$V server-source release`, then `restore`. Holding `personnel_ict_completions` or `rating_scheme_entries` shows the
   same for Critical tasks and the Evaluation card (its empty state, 90 px).
3. **Unchecked.** `$V server-source arm personnel_trainings fail-hard 1`, choose the tab. Expect
   `Couldn't check training. Reload the page to try again.` with the other sections loaded. Restore. On a full page load
   one match serves both the layout and the page, so the badge reads `1 or more items need attention`.
4. **Log with certificate.** Open a training row, pick a date, attach a small synthetic PDF and `Save completion`.
   Repeat once with a small PNG: the `Certificate` link opens it with `content-type: image/png`. Expect
   `POST api/personnel-trainings/completions`, then `readiness/__data.json?x-sveltekit-invalidated=00011` only, the
   marker intact, the row's new dates, and History with the current row (`Certificate` link) above the superseded row.
   The link opens a `storage/v1/object/sign/training-certificates/...` URL; click it, because a scripted `fetch` fails
   on the cross-origin redirect. `$V rows personnel_trainings orgA` shows the certificate path;
   `$V rows personnel_training_history orgA` shows the superseded row. Repeat with a temporary type configured as
   `Date on the card` through the [type recipe](training-catalog-views.md#driving-it-with-verifyapp). Its drawer asks
   `Expires on`; save a future date and require null `completion_date` and that `expiration_date` in the current row.
   Correct the date in History and require the same row ID with the changed expiry.
5. **Blank notes and undated history after a cycle change.** As the owner create a required, never-expiring, exemptible
   type in Training → Types. In the Training matrix open Able's cell for it, tick `Mark as Complete` without a date, add
   Notes and a synthetic Certificate URL such as `https://legacy.example.test/never.pdf`, and Save. Open
   `readiness?item=training:<typeId>`. History shows `— → does not expire` with the note and a
   `Certificate on legacy.example.test` link whose URL is the legacy address. `evaluate_script` a `fetch` of
   `api/personnel-trainings/certificate?kind=current&id=<recordId>` with `redirect: 'manual'` answers 404
   `Certificate not found` with no `location`. Edit the type in Training → Types to a 12-month cycle and Save, so the
   undated row no longer counts as current. Reopen the item and save a new completion with Notes empty.
   `$V rows personnel_trainings orgA` shows the new date with null notes and certificate;
   `$V rows personnel_training_history orgA` shows the undated row with its note and URL.
6. **Correct.** In History choose `Edit <dates>` on the superseded row, pick another date and save. Expect
   `PATCH api/personnel-trainings/corrections`, the row changed in place with no new row, and the drawer still open.
7. **Exempt with permission.** As the owner, open an exemptible item and choose `Mark exempt`. Expect
   `PUT api/training-types/<type>/exemptions/<person>`, the row gone from the table, the footer's exempt count up by
   one, and the Person's id in that type's `exempt_personnel_ids`. Choose `Undo` in the toast within ten seconds; the
   row returns and the id is gone. The tab offers no other way back, so a missed Undo needs the Training matrix.
8. **Exempt without permission.** `$V actor rosterManager personnel` (Training operate). Open the same item with
   `?item=training:<typeId>`. The drawer offers `Save completion` and no `Mark exempt`. This actor also cannot read
   critical tasks, evaluations or onboarding: those sections read `Couldn't check ...` and the badge reads
   `1 or more items need attention`. That is expected, not an outage.
9. **Critical-task validation.** As the owner, open the missing critical task. The method is a native select; set it
   with `fill` and the option's value. `Save validation`. Expect `POST api/personnel-ict-completions`, then `00011`, the
   row moved to Current with `<method> by <validator>`, the badge down by one and the marker intact. Reopen it and
   choose the History entry's `Edit <dates>`, change Notes and choose `Save correction`. Expect
   `PUT api/personnel-ict-completions`, the drawer still open and the same completion ID with changed notes in
   `$V rows personnel_ict_completions orgA`. Reload and reopen to confirm the correction without an extra completion.

## Gotchas

- Editing a helper or source makes `doctor` report `STALE_CANDIDATE`; restart the worker and redo the type setup.
- The exempt Undo toast lasts ten seconds. Take one snapshot and click straight away.
- `upload_file` reads only paths inside the checkout; put the synthetic PDF or photo under the run's evidence folder.
- `rows personnel_training_history` needs the table in the helper's readback allowlist (`helpers/control.mjs`).
