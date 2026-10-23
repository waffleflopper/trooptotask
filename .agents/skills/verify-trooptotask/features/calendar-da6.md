# DA 6

An Organization-wide Calendar viewer reads one person-assigned duty roster as a DA Form 6 for one month. Closed forms
show their saved record; the open form is worked out from today's facts. The page is read-only.

## Sub-features

- `da6-grid`: header fields (Nature of duty, Organization, From, To), one column per detail day, sticky Grade and Name,
  plain counts, pulled duty in bold with a corner mark, `A` and code cells (`D5`, `U3`) on a gray fill, today's column
  highlighted and future columns shaded. Under Separate count the weekend and holiday numbers are red; under No duty
  those columns are left out.
- `da6-switch`: the roster toggle lists every active person-assigned type by short code and keeps the month; month
  navigation writes `?month=YYYY-MM`, and Back returns to the previous roster or month.
- `da6-show-the-work`: the rule (DA PAM 220-45, para 6), the selected day worked out, and the tie-break. A column header
  selects its day; the default is today, else the last day before today, else the first.
- `da6-form-boundary`: a month that spans a rule change shows the closed form, a boundary note and the new form.
- `da6-print`: `Print DA 6` prints a month at readable size on landscape Letter, with every form of that month in order
  and never another month; a roster too long for one sheet continues on the next like a paper DA 6, the Grade, Name and
  day header row repeating at the top of each sheet and no person's row split. The header fields sit on the first sheet,
  the legend and remarks after the last row, the closed form's note between forms, and weekend numbers are red; Show the
  work and the controls are left off.
- `da6-states`: a loading skeleton, the page's own load error, the not-permitted state for a Group-scoped viewer, and a
  load error in place of a closed form whose saved record cannot be read.
- `da6-setup`: `?setup=1` opens the open form in setup mode, where a configurator copies the last numbers from a paper
  DA 6 into the first column of each track. A blank box starts at the lowest typed number. `Save starting numbers` saves
  them and re-picks the roster's planned days; hand-assigned days stay. `Skip, start everyone even` saves nothing; once
  numbers are saved the button reads `Cancel` and keeps them. Once a detail on the form is served, or the numbers were
  carried from the last form, the boxes become the read-only record and the server refuses an edit.

## How to get to it (user POV)

Open `/org/<org>/calendar/rosters/<assignment type id>`, optionally with `?month=YYYY-MM`. The title reads
`DA 6 · <type name>` under the eyebrow `Calendar · Duty roster`. The header holds the roster toggle (each item named by
the type's full name), `Today`, `Previous month`, the month picker, `Next month`, `Back to planner` and `Print DA 6`.
Each form is a region named `DA 6, <type>, <From> to <To or open>`; its grid is a scroll region named
`<type> DA 6 grid, <Month YYYY>`. A day's column header is a button named `<D Mon>` with `aria-pressed`.

Setup mode is `/org/<org>/calendar/rosters/<assignment type id>?setup=1`, reached from the type sheet's
`Starting numbers` row ([Calendar catalogs](calendar-catalogs.md)). Its form region is named
`DA 6 starting numbers, <type>`; each box is a textbox named `<rank> <last name>, starting number`, or
`<rank> <last name>, weekday starting number` and `…, weekend and holiday starting number` under Separate count.

## Helper controls

`$V seed da6` creates, in Organization A, eight `92Y` People (SGT Grant, SGT Okafor, SPC Kim, SPC Nguyen, SPC Patel, PFC
Brooks, PFC Ortiz, PV2 Diaz) and two person-assigned types matching MOS `92Y`, `Staff Duty` (`SD`) and
`Charge of Quarters` (`CQ`). Their forms open on the UTC day the seed runs (call it d0). Staff Duty has an assignment
every day d0–d20, Charge of Quarters on d1, d5, d9 and d14, both picked by the DA 6 rule, and Okafor has
`Verification Leave` on d8–d9. The seed returns both type IDs, the people's IDs and the dated picks. Their attribute
history starts 30 days before d0, so days before the forms have a pool. `clean-seeds` removes it. `$V seed da6 YYYY-MM`
(a month within 120 days) instead gives Staff Duty a detail on every day of that month and seeds no CQ or leave, for the
widest grid: open the month's DA 6 and print it. A third argument, `$V seed da6 YYYY-MM 60`, adds synthetic
`Recruit01`... People (8 to 80 in all) for a roster that spans printed sheets.

The DA 6 data read lists assignment types, so `$V server-source arm assignment_types hold|fail-hard 1` reaches it on a
client navigation (month change). On a full page load the Calendar layout reads assignment types first and the layout's
error shows instead.

`print save PAGE URL FILE.pdf` admits the DA 6 path with its `month` key.

## Driving it with verify:app

Preconditions: doctor passes; `$V seed da6` returns `staffDuty` and `chargeOfQuarters`;
`$V actor calendarConfigure calendar` returns `PAGE`; resize to 1440x900 and navigate to
`/org/<orgA>/calendar/rosters/<staffDuty>`. Dates below are seed days; open the month that holds each one.

1. **Grid.** One region reads From d0 and To `Open`. The toggle lists `VSD`, `VRD`, `SD` and `CQ`, with `SD` pressed.
   Remarks read `None.` Reading the visible cells from d0 through d9:
   - Grant `1 D1 2 3 4 5 6 7 8 1`, with d0 and d8 bold.
   - Okafor `1 2 1 2 3 D4 5 6 A A`.
   - Kim `1 2 3 1 2 3 4 5 6 D7`.
   - Diaz `1 2 3 4 5 6 7 8 1 2`.
   - Each cell's screen-reader text follows its label, for example `A, away (Verification Leave), count holds at 6` and
     `D7, on other duty (Charge of Quarters), count runs`.
   - The legend lists `Pulled duty`, `Away, count holds`, `Other duty, count runs` and `Planned, not yet served`.
2. **Show the work.** The strip opens on d0: `All 8 sit at 1. Grant is higher on the form, so Grant pulls it.` Choose
   the d9 column header; it reads `aria-pressed="true"` and the strip's heading reads `<d9>, planned`, with
   `SPC Kim sits at 7 and SGT Okafor sits at 6, ahead of SPC Nguyen at 6. Kim is on other duty (Charge of Quarters) and Okafor is away (Verification Leave), so Nguyen pulls it. Kim's count keeps running.`
   It ends `Okafor holds at 6.`, or `Okafor holds at 6 and goes first after returning, on <d11>.` when d11 is in the
   same month.
3. **Switch and month.** Choose `Charge of Quarters`: the URL keeps `?month=`, the title reads
   `DA 6 · Charge of Quarters`, and the columns are d1, d5 and d9 when they share d0's month. Choose `Next month`:
   `?month=` advances and From reads the month's first day. Back twice returns to the previous month, then to Staff
   Duty.
4. **Rule change.** In Settings → `Assignment Types`, choose `More actions for Staff Duty` → `Edit`, then
   `Separate count` and `Save Changes`. `Start a new DA 6?` names d1. Choose `Save changes`.
   `$V rows roster_forms orgA assignment_type_id <staffDuty>` shows a form d0–d0 with a `record`, and an open one from
   d1 with `weekendMode` `separate`. Reopen the DA 6 for d0's month:
   - The first region reads From d0 and To d0; every count is `1`, with Grant bold.
   - Between the forms, the note reads `Form closed <d0>. A new DA 6 opened <d1> when the roster rules changed.`
   - The second region reads From d1 and To `Open`. Its Saturday and Sunday numbers, and their weekend-track counts, are
     red, and the legend adds `Weekend and holiday count`.
5. **Print.** Run `$V print arm PAGE`, choose `Print DA 6`, and run `$V print state PAGE`: `before` reads `1`. Then run
   `$V print save PAGE '<exact URL>' .verification/evidence/verify-trooptotask/<run>/da6.pdf letter on` and
   `$V print restore PAGE`. The PDF is 792x612 pt, one month, and the closed and open forms of the rule-change month
   follow each other:
   - The title line reads `DA Form 6 · Duty roster · <Month YYYY>`.
   - Each page keeps the header fields, corner marks inside their cells, the legend, the remarks and the red weekend
     numbers.
   - It leaves out the Show the work strip, the selection underline and the controls.
   - With `$V seed da6 YYYY-MM 60`, the month's 60 rows do not shrink to fit: page 1 holds the header fields and the
     first rows, page 2 begins with the Grade, Name and day-number header row and carries on, and the legend and remarks
     come after the last row. No row is cut between pages.
6. **Layout.** Capture 1440x900, 900x800 and 390x844. `document.documentElement.scrollWidth` equals `innerWidth`. At 390
   px, set the grid region's `scrollLeft` to its maximum. The Grade and Name cells stay at the region's left edge while
   the days scroll.
7. **Loading and failure.** Run `$V server-source arm assignment_types hold 1 30000`, then choose `Previous month`:
   - The title reads `DA 6`, a `role="status"` reads `Loading the DA 6`, and `Print DA 6` is disabled.
   - `$V server-source release` renders the month. Then run `$V server-source restore`.
   - With `fail-hard 1` instead, `Next month` shows `Unable to load DA 6` with `Retry DA 6`. After `restore`, Retry
     renders the month.
8. **Access.** `$V actor calendarScoped calendar` opens a new page. Navigate it to the same DA 6: the main region shows
   `Access Restricted` and `You don't have permission to view the DA 6.` Fetching the page HTML from that page contains
   none of the seeded last names.

9. **Starting numbers.** Run on a fresh `$V seed da6`, before step 4, when d9 is in d0's month. Charge of Quarters has
   no detail on d0, so its numbers are editable; Staff Duty's d0 detail locks its own.
   - **Planned days.** In the planner open `Charge of Quarters column actions`, set `First day` d2 and `Last day` d8,
     and choose `Fill 6 days`. `$V rows daily_assignments orgA` shows Charge of Quarters on d2 Okafor, d3 Kim, d4
     Nguyen, d6 Patel, d7 Brooks and d8 Ortiz with `source` `roster`, and d1, d5, d9 and d14 `manual`.
   - **Copy it in.** Open the type sheet's `Copy it in`. The title reads `DA 6 · Charge of Quarters`, the banner
     `Carrying over a paper DA 6? Copy the last numbers into the first columns.`, and one input column reads `<d0>` with
     `<d1> – <month end> · Fills in as duty is pulled` beside it. Focus Grant's box and press Tab: focus moves to
     Okafor's. Type Okafor `7`, Kim `11`, Nguyen `2`, Patel `6`, Brooks `3` and Ortiz `4`, leaving Grant and Diaz blank.
     Tab from Ortiz lands on Diaz.
   - **Save.** `Save starting numbers` replaces the page with the DA 6 (Back does not return to setup).
     `$V rows roster_starting_numbers orgA form_id <open form>` shows the six numbers with origin `typed` and no row for
     Grant or Diaz. The roster days d4 and d8 re-pick to Ortiz and Nguyen; d2, d3, d6 and d7 keep their people and the
     four manual days are unchanged. Reading d1 through d9:
     - Grant `*3 1 2 3 4 5 6 D7 8`, Okafor `D8 *9 1 2 *3 1 2 A A`, Kim `12 D13 *14 1 2 3 4 5 *6`.
     - Nguyen `3 4 D5 6 7 8 9 *10 D1`, Patel `7 8 9 D10 11 *12 1 2 3`, Brooks `4 5 6 7 D8 9 *10 1 2`.
     - Ortiz `5 6 7 *8 1 D2 3 4 5`, Diaz `3 4 5 6 7 8 D9 10 11` (`*` is bold pulled duty). The blanks start at 2, the
       lowest typed number, so they read 3 on d1.
   - **Skip.** Open `Verification Staff Duty`'s setup, type `5` in the first box and choose `Skip, start everyone even`:
     the DA 6 opens and that form keeps no starting number.
   - **Lock.** Assign Charge of Quarters on d0 to anyone. Reopen its setup: there are no textboxes, the header offers
     `Open DA 6`, and the boxes show `- 7 11 2 6 3 4 -`. The banner reads
     `These starting numbers are part of the record.` and
     `The first CQ on this DA 6 has been pulled, so the numbers it started from don’t change.` An authenticated
     `POST /org/<orgA>/api/duty-rosters/starting-numbers` with `{typeId, formId, today, numbers}` returns `409` with
     `Duty has been pulled on this DA 6, so its starting numbers are part of the record now.` and the rows unchanged. As
     `calendarOperate` the same POST returns `403`.
   - **Locked while typing.** Open an editable setup, type a number, assign the type on d0 from another request, then
     choose `Save starting numbers`. The page stays, an alert reads `Starting numbers not saved` with the 409 message,
     and the boxes become the saved record without the typed number.
   - **Separate count.** Add a Person type with `Separate count`, open its `Copy it in`. Two input columns, oldest
     first, read the first weekday and the first weekend or holiday on or after d0, the weekend one in red; the footer
     adds `Red is the weekend & holiday count, kept separately because this roster uses a separate count.` Tab from the
     last weekday box moves to the first person's weekend box. Saving writes `weekday` and `weekend` rows.
   - **Layout.** Capture setup at 1440x900, 900x800 and 390x844: `document.documentElement.scrollWidth` equals
     `innerWidth`, and at 390 px Grade and Name stay sticky while the grid scrolls.

## Gotchas

- Forms open on the UTC day a type becomes person-assigned. `roster_forms` and `roster_starting_numbers` accept writes
  only inside `close_roster_form` and `set_roster_starting_numbers`, even from the service role, so the seed cannot
  backdate history and a malformed saved record cannot be planted. `src/features/calendar/da6Operations.server.test.ts`
  and `components/da6/Da6Page.test.ts` prove the unreadable-record load error.
- A full-page `take_screenshot` captures only the viewport, because the app scrolls inside its main region. Scroll the
  main region for the lower part.
- `take_screenshot` with `filePath` writes the image; `tool ... --text --save` writes only the text reply.
- Today, the highlighted column and the default month follow the viewer's day (`t2t_tz`). With the browser zone ahead of
  UTC, d0 can be yesterday and the highlighted column is the day after d0.
