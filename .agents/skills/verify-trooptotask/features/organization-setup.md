# Organization setup

An owner or admin walks a guided pass over the unit: Welcome, then Groups, Ranks, Personnel, Calendar, one step per
feature and Invite, ending on a Done summary. Each step has its own URL and remembers whether it is reviewed.

## Sub-features

- `setup-entry`: Settings › General links to setup; `/org/<seg>/setup` opens the first unanswered step, or Done.
- `setup-rail`: the step rail shows every step grouped Your unit, Features and Team, each Done, Later, Off or not
  answered, with `N of 12 reviewed` and a progress bar. Below 1024 px it collapses to a step header with `All steps`.
- `setup-continue`: Continue records the step reviewed unless unit data already makes it Done, then opens the next step;
  the last step opens Done.
- `setup-history`: browser Back and Forward move between step URLs; a reload keeps rail state.
- `setup-done`: the summary counts Groups, Ranks, People, Statuses and pending invites, sorts features into On, Later
  and Off, and Finish lands on the Dashboard.
- `setup-failures`: a failed save keeps the owner on the step with `Couldn't save.` and the reason; a failed fact source
  marks only its steps and shows a load error with Retry.
- `setup-access`: members get 403 and see no setup link.

## How to get to it (user POV)

As an owner or admin, open Settings › General and choose `Open setup` on the `Organization setup` row. The app opens
`/org/<seg>/setup/<step>`. Steps in order: `welcome`, `groups`, `ranks`, `personnel`, `calendar`, `training`,
`critical-tasks`, `evaluations`, `onboarding`, `losses-and-awards`, `events-and-taskings`, `invite`, then `done`.
`Finish later` in the rail returns to the Dashboard and keeps answers.

## Helper controls

```bash
$V fault arm org-setup-answer         # next POST rpc/save_organization_setup_answer returns 503
$V fault arm org-setup-training-count # next training_types count read returns 500
$V server-source arm calendar_taskings hold 1 30000 # holds every setup fact until release
$V network arm-hold PAGE org-page/setup-training     # holds the Training step's page data until release
```

`org-setup-answer` fails the Continue write before it reaches the database. `org-setup-training-count` fails the first
training type count after arming; arm it, then reload a setup page so the setup facts are the first read. The setup
facts resolve together, so holding their Taskings count keeps every fact loading. The setup document streams while it is
held, so open the page with a `navigate_page` timeout of about 3000 ms and drive it after the timeout.

## Driving it with verify:app

Preconditions: `doctor` passes; use `orgOwner`, `orgAdmin` and `orgMember` from `$V fixture`, each in its own context.

1. `$V actor orgOwner settings/general` (setup is not an actor destination). Expect an `Organization setup` row with
   `Open setup`. Choose it. Expect `/setup/welcome` on fresh seed, title `Welcome`, no Back button, `Continue to Groups`
   and `5 of 12 reviewed`: seed data already makes Personnel, Training, Critical tasks, Onboarding and Invite your team
   Done. The rail shows skeleton glyphs first, then states; a reload records no layout shift.
2. Choose `Continue to Groups`, then `Continue to Ranks`. Expect `/setup/ranks`, Welcome and Groups Done and
   `7 of 12 reviewed`. Reload: the same counter and glyphs return.
3. Browser Back: `/setup/groups`. Forward: `/setup/ranks`. The rail's current row follows the URL.
4. Open `/setup/done`. With every step reviewed the headline names the Organization; otherwise it reads
   `K steps still open` and links each open step. Seed counts: Groups 2, Ranks 4, People 3, Statuses 3, Invites
   pending 0. The On column lists Training `3 training types`, Critical tasks `2 task lists` and Onboarding
   `1 template`; Later and Off read `None`. Choose `Finish`; expect the Dashboard at `/org/<seg>`.
5. As `orgAdmin`, `Open setup` lands on the first open step (Calendar after step 2's owner answers). Continue, reload,
   Back and Forward behave as in steps 2 and 3, and Finish lands on the Dashboard.
6. `$V actor orgMember settings/general` reports `access: denied`: General itself is 403, so no setup link shows.
   `/setup`, `/setup/welcome` and `/setup/done` each answer 403.
7. On a step that is not Done, `$V fault arm org-setup-answer`, then Continue. Expect the URL unchanged, an alert
   `Couldn't save. Internal server error` and the rail unchanged. `$V fault state` shows one match; `$V fault restore`,
   then Continue succeeds.
8. `$V fault arm org-setup-training-count`, open `/setup/training`. Expect the Training rail row marked not answered
   with an alert icon and an alert naming `Training types` with Retry; other rows keep their states and Continue stays
   enabled. Restore, then Retry clears the alert.
9. Capture a step and Done at 1440, 1024 and 390 px. At 390 px the rail is a step header (`Step n of 12 · Group`,
   `All steps`, a segmented bar), the footer stays at the bottom, and the page has no horizontal scroll.

10. Done while facts load: as `orgOwner` on fresh seed, arm the `calendar_taskings` hold and open `/setup/done`. Expect
    skeletons for the summary (eyebrow, headline, note, two list lines), the five counts and one row in each column;
    below 768 px only On shows. `$V server-source release`: the summary reads `7 steps still open`, On lists three
    features and Later and Off read `None`. A buffered `layout-shift` observer reports CLS 0 at 1440 and 390 px; the
    summary keeps 176 px (1440) or 190 px (390) and the counts keep their top.
11. Continue while a step navigation is pending: on `/setup/groups`, `$V network arm-hold PAGE org-page/setup-training`,
    choose the rail's `Training , done` link by snapshot UID (the sidebar has its own `Training` link), then
    `Continue to Ranks` while Groups still shows. Expect Continue busy (`aria-busy`, spinner `Loading`) and no POST to
    `api/organization/setup/answer`. `$V network release PAGE`: the URL stays `/setup/training` and Groups stays not
    answered. `$V network restore PAGE`.

## Gotchas

- Continue writes nothing for a step the unit's data already makes Done, so the counter may start above zero.
- A feature turned off in Settings › Features shows its step as Off with a struck title; Continue skips the write.
- Setup state lives on the Organization. Finish and every answer persist across workers' sessions until reseed.

## Your unit steps

Welcome, Groups, Ranks, Personnel and Calendar embed the same editors as Settings and the Personnel page. Drive them on
a new unit so Personnel starts empty: as `orgOwner`, open `/org/new`, create `S2B Test Unit` and open
`/org/<new seg>/setup`.

```bash
$V fault arm org-setup-ranks-references # next training_types rank-reference read returns 500
```

`org-setup-ranks-references` fails only the Ranks editor's read of training rank references; the setup facts still load.

1. `/setup/welcome` on the new unit: `0 of 12 reviewed`; the unit name with `Rename in Settings`; service buttons Army,
   Navy, Air Force, Marine Corps, Coast Guard, Space Force and `Mixed or joint` (no Civilian); `Start with Groups` is
   disabled with `Choose a service to continue`.
2. Choose `Mixed or joint`. Expect the status `Saved. Every service's ranks are active (140 active ranks).`, Welcome
   Done and `1 of 12`. Choose `Army`. Expect `Start with Groups` enabled and the status
   `Saved. Army ranks are active (30 active ranks); other services' ranks are retired and can be restored.`
3. `Review them in Ranks`. Branch coverage reads Army `28 active`, Navy `0 active, 23 retired`, Air Force 19, Marine
   Corps 26, Coast Guard 22 and Space Force 20 retired; Catalog `30 active · 110 retired · 0 custom`. Settings › Ranks
   shows the same numbers. A new unit that only ever chose Army shows the other services `Not added`, not retired.
4. In the embedded editor open `More actions for Navy` › `Reactivate retired ranks (23)` and confirm. The URL stays
   `/setup/ranks`; Navy reads `23 active`; Catalog `53 active · 87 retired`. Settings › Ranks matches after reload.
5. `/setup/groups` lists the unit's Groups (a new unit: Leadership, Alpha, Bravo, each `0 people`) under `3 groups`.
   `Manage groups` opens the Personnel Group manager; a Group added there appears in the list on Done.
   `Continue to Ranks` marks Groups Done.
6. Continue from Ranks to Personnel: `0 people so far`, `A handful of people?` with `Add a person`, and the import drop
   zone with `Columns we look for`. `Continue to Calendar` with nobody on the roster marks Personnel `later`.
7. `/setup/calendar` shows Calendar settings with Status Types 7, Assignment Types 1 and Holidays & closures 44 on a
   new unit, and no `Back to Calendar`. `Continue to Training` marks Calendar Done: `5 of 12`.
8. Back on Personnel, `Add a person`, fill Last and First name and `Add Personnel`. Without a reload expect
   `1 person so far` and the rail's Personnel row Done. A reload keeps both.
9. As `orgAdmin` on the fixture unit every step shows the same editor actions (`Manage groups`, rank pack buttons,
   `Add a person`, the drop zone, Calendar `Add new`), and choosing a service saves.
10. `$V fault arm org-setup-ranks-references`, reload `/setup/ranks`. Expect an alert
    `The rank editor could not be loaded` with Retry, the rail states unchanged and `Continue to Personnel` enabled.
    `$V fault state` shows one match on `GET /rest/v1/training_types`. Restore, then Retry shows the editor.
11. At 1440, 1024 and 390 px no step scrolls sideways. At 1024 the embedded import stacks the drop zone above the
    column list and Calendar settings stacks its section list above the editor; at 1440 Calendar settings shows them
    side by side with Holidays & closures stacked.
