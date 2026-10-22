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
- `da6-print`: `Print DA 6` prints a month at readable size on landscape Letter, with every form of that month in
  order and never another month; a roster too long for one sheet continues on the next like a paper DA 6, the Grade, Name
  and day header row repeating at the top of each sheet and no person's row split. The header fields sit on the first
  sheet, the legend and remarks after the last row, the closed form's note between forms, and weekend numbers are red;
  Show the work and the controls are left off.
- `da6-states`: a loading skeleton, the page's own load error, the not-permitted state for a Group-scoped viewer, and a
  load error in place of a closed form whose saved record cannot be read.

## How to get to it (user POV)

Open `/org/<org>/calendar/rosters/<assignment type id>`, optionally with `?month=YYYY-MM`. The title reads
`DA 6 · <type name>` under the eyebrow `Calendar · Duty roster`. The header holds the roster toggle (each item named by
the type's full name), `Today`, `Previous month`, the month picker, `Next month`, `Back to planner` and `Print DA 6`.
Each form is a region named `DA 6, <type>, <From> to <To or open>`; its grid is a scroll region named
`<type> DA 6 grid, <Month YYYY>`. A day's column header is a button named `<D Mon>` with `aria-pressed`.

## Helper controls

`$V seed da6` creates, in Organization A, eight `92Y` People (SGT Grant, SGT Okafor, SPC Kim, SPC Nguyen, SPC Patel, PFC
Brooks, PFC Ortiz, PV2 Diaz) and two person-assigned types matching MOS `92Y`, `Staff Duty` (`SD`) and
`Charge of Quarters` (`CQ`). Their forms open on the UTC day the seed runs (call it d0). Staff Duty has an assignment
every day d0–d20, Charge of Quarters on d1, d5, d9 and d14, both picked by the DA 6 rule, and Okafor has
`Verification Leave` on d8–d9. The seed returns both type IDs, the people's IDs and the dated picks. `clean-seeds`
removes it. `$V seed da6 YYYY-MM` (a month within 120 days) instead gives Staff Duty a detail on every day of that
month and seeds no CQ or leave, for the widest grid: open the month's DA 6 and print it. A third argument,
`$V seed da6 YYYY-MM 60`, adds synthetic `Recruit01`... People (8 to 80 in all) for a roster that spans printed sheets.

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

## Gotchas

- Forms open on the UTC day a type becomes person-assigned. `roster_forms` and `roster_starting_numbers` accept writes
  only inside `close_roster_form`, even from the service role, so the seed cannot backdate history and a malformed saved
  record cannot be planted. `src/features/calendar/da6Operations.server.test.ts` and `components/da6/Da6Page.test.ts`
  prove the unreadable-record load error.
- A full-page `take_screenshot` captures only the viewport, because the app scrolls inside its main region. Scroll the
  main region for the lower part.
- `take_screenshot` with `filePath` writes the image; `tool ... --text --save` writes only the text reply.
- Today, the highlighted column and the default month follow the viewer's day (`t2t_tz`). With the browser zone ahead
  of UTC, d0 can be yesterday and the highlighted column is the day after d0.
