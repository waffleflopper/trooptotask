# Personnel Overview

A leader opens one Soldier's record and sees, without leaving the first tab, where the Soldier will be for the next two
weeks, what needs action ranked by urgency, the open follow-ups, and how to reach them and who rates them. Every row
links to the place a leader fixes it.

## Sub-features

- `next-days`: the `Next 14 days` strip from the viewer's today. It draws the Person's statuses, their own and their
  Group's assignment slots as one-day chips, and DONSA or Holiday closures (named under the day number and outlined in
  dashes over any bar on that day), with a legend line per entry (`<range> · <note>`). `Open in calendar` opens the
  Calendar on today. A viewer without Calendar availability access gets no section; a failed read shows
  `Couldn't load the Calendar.`
- `needs-attention`: one ranked list across training, critical tasks, the active evaluation and loss dates,
  `N items · most urgent first`, with `Full readiness`. A row reads status, title, the fact a leader acts on, category
  and relative timing, and opens the Readiness drawer (`readiness?item=<kind>:<id>`), the Evals entry editor
  (`evals?entry=<id>`) or the Data sheet. Sources that failed or were denied each read
  `Couldn't check <source>. Reload the page to try again.`; what was checked and fine collapses into `Also checked: …`,
  which leaves out a source with nothing current.
- `open-follow-ups`: up to three open follow-ups with `N open · N overdue` and `Open log`. Ticking one completes it at
  once and refreshes the Log badge.
- `rail`: `Reach` (personal phone, email, emergency contact from the Data sheet), `Rating chain · <eval type>` (hidden
  with no active evaluation or no Evals access), `Last counseled` (the newest counseling held on or before the viewer's
  day: relative day, date, title and who held it, or the uploader when no conductor was recorded; a counseling dated
  later is left out, and the Files heading `Last counseled N days ago` names the same one) and `Latest note`.
- `sections`: each section streams on its own with a shaped skeleton and its own error state.

## How to get to it (user POV)

Choose `Personnel`, then a Person's `Details`. The Overview is the first tab under the record header.

## Driving it with verify:app

Cases 2 and 3 can stage Able's data through the app API (`availability`, `daily-assignments`, `special-days`,
`rating-scheme`, `data-sheet`) instead of the Calendar and Evals UI.

Preconditions: owned launch and `doctor` pass; set `V` per the index. `$V actor orgOwner personnel` signs in the owner.
Baker (`verify-baker`, Bravo) holds `Verification Training` across today and two missing readiness items.

1. **Loaded.** Open `personnel/verify-baker`. Expect `Next 14 days` with the Training bar from today and its legend
   line, `Needs attention` with `2 items · most urgent first`, and the rail. Capture at 1440x900 and 390x844; at 390 the
   strip scrolls sideways inside its section and the rows stack status and timing over the title.
2. **A full fortnight.** As the owner, give Able a leave status across the coming weekend (quick-add drag, then
   `Add a note or edit dates…` for a note), a three-day range status, a Duty planner slot on a weekday and a one-day
   closure (`Holidays & closures` → `New closure`, a weekday DONSA). Open Able's Overview: each appears once in the
   strip and the legend, the assignment as a one-day chip, the closure named under its day number. Put the closure on a
   day the leave covers: the dashed outline stays visible over the leave bar. Also upload a counseling dated after today
   and one before it (`artifact-http … POST counseling-records`): `Last counseled` shows the earlier one.
3. **Row targets.** Give Able an active evaluation with a period ending inside the due window and an ETS inside 180
   days. Choose each attention row kind and expect: training and critical task open that Readiness drawer; an evaluation
   opens Evals with that entry's editor and drops `entry` from the URL; loss opens the Data sheet.
4. **Skeleton.** `$V server-source arm availability_entries hold 1 120000`, then choose the Overview tab from Readiness.
   `Next 14 days` holds its skeleton while `Needs attention` and the rail render. Release, then restore. Each skeleton
   is shaped like the section's typical content: Next 14 days with one legend line, Needs attention with one row and the
   `Also checked` line, and no Rating chain placeholder.
5. **Unchecked.** `$V server-source arm personnel_trainings fail-hard 1`, reload. Expect
   `Couldn't check training. Reload the page to try again.` with the rest loaded. Restore.
6. **Follow-up completion.** With an open follow-up on the Person, tick it on the Overview. Expect the `PATCH` to
   `api/personnel/<id>/follow-ups/<id>`, the row struck through with `Reopen`, the counts down by one and the Log badge
   refreshed without a reload.

## Gotchas

- The strip reads the viewer's day from the `t2t_tz` cookie, so a browser zone ahead of UTC can start it a day after the
  server's date.
- `server-source` controls only owned Organization A; restore each control before the next case.
- The record scrolls inside the app shell's `main`, not the window, so a `fullPage` screenshot shows one viewport. Call
  `scrollIntoView()` on the section (`section[aria-label="Open follow-ups"]`) before a capture of the lower sections.
