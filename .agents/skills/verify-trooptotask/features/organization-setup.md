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
$V server-source arm calendar_taskings fail-hard 1   # fails the Taskings fact; a one-shot `fail` is retried unseen
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
   `All steps`, a segmented bar), the footer stays at the bottom, and the page has no horizontal scroll. At 1024 px the
   footer's Back shows only its 40 px icon, every note fits two lines and Continue fits; a long label such as
   `Continue to Events & Taskings` wraps to two lines (58 px). At 1440 px Back keeps its label and the note is one line.
   Tab through `/setup/training` at 1440 and 390 px: each focused row stops at least 16 px above the footer, and focus
   entering the footer does not move `#main-content`'s `scrollTop`.

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
- The sticky footer covers rows that a native `click` scrolls only just into view, so the click lands on the footer.
  Scroll the row to the centre with `evaluate_script` (`scrollIntoView({ block: 'center' })`) before clicking a row
  near the end of the Training step.
- At 390 px only the first 3 Army rows render until `Show 5 more`; expand the list before unchecking `OPSEC`.

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
   `Saved. Army ranks are active (30 active ranks); other services' ranks are retired and can be restored.` Until the
   refreshed count arrives the status omits it; it never shows 140 for Army.
3. `Review them in Ranks`. `Your ranks` reads `30 on · 110 off · 1 custom` with tabs Army `28 of 28 on`, Navy
   `0 of 23 on`, Air Force `0 of 19 on`, Marine Corps `0 of 26 on`, Coast Guard `0 of 22 on`, Space Force `0 of 20 on`
   and Civilian `1 of 1 on`. Settings › Ranks shows the same numbers. A new unit that only ever chose Army reads
   `30 on · 0 off · 1 custom` with only Army and Civilian tabs, `SP4` tagged `History`, and `+ Add a branch`.
4. In the embedded editor open the Navy tab and press `Turn all Enlisted ranks on`. The URL stays `/setup/ranks`; the
   note reads `Turned on 13 Enlisted ranks.` and Navy `13 of 23 on`. Settings › Ranks matches after reload. Press a chip
   off and on again: each press saves without a dialog.
5. `/setup/groups` on a new unit has no Groups: `Split the roster the way you run it` with `Add your Groups` and
   `Skip, keep one roster`, the footer `0 groups · everyone in one roster` and no `Manage groups`. `Add your Groups`
   opens the Group manager with focus on `New group name`, described by the hint
   `Type a Group name here, then select Add.`; the manager shows `Name your first Group` and no Unassigned row, drag
   label or Delete. Escape dismisses the hint and keeps the dialog open. Add `HQ Section`: the hint is gone, the field
   is cleared and focused, and the right side reads `No one in HQ Section yet`. Close and reload: the step lists
   `HQ Section` with `0 people`, the footer reads `1 group · changes save as you make them` and `Manage groups` shows.
   On another new unit `Skip, keep one roster` goes to `/setup/ranks` with Groups Done and `2 of 12`.
6. Continue from Ranks to Personnel: `0 people so far`, `A handful of people?` with `Add a person`, and the import drop
   zone with `Columns we look for`. `Continue to Calendar` with nobody on the roster, or before the count loads, marks
   Personnel `later`.
7. `/setup/calendar` shows Calendar settings with Status Types 7, Assignment Types 1 and Holidays & closures 44 on a
   new unit, and no `Back to Calendar`. `Continue to Training` marks Calendar Done: `5 of 12`.
8. Back on Personnel, `Add a person`, fill Last name `Fixround`, First name `Jane` and MOS `68W`, then
   `Add Personnel`. Without a reload expect `1 person so far` and the rail's Personnel row Done. A reload keeps both.
9. As `orgAdmin` on the fixture unit every step shows the same editor actions (`Manage groups`, rank chips,
   `+ Add a branch`, `Add a person`, the drop zone, Calendar `Add new`), and choosing a service saves.
10. `$V fault arm org-setup-ranks-references`, reload `/setup/ranks`. Expect an alert
    `The rank editor could not be loaded` with Retry, the rail states unchanged and `Continue to Personnel` enabled.
    `$V fault state` shows one match on `GET /rest/v1/training_types`. Restore, then Retry shows the editor.
11. At 1440, 1024 and 390 px no step scrolls sideways. At 1024 the embedded import stacks the drop zone above the
    column list and Calendar settings stacks its section list above the editor; at 1440 Calendar settings shows them
    side by side with Holidays & closures stacked. Welcome's `What TroopToTask does` shows two columns at 1440 and one
    at 1024. On Personnel, upload a 14-row CSV and reach `3 OF 4 · REVIEW`: at 1440 and 390 px, mid-scroll and at the
    end, the review bar's `Import 14 changes` sits above the setup footer (bar bottom 805 at 1440 and 760 at 390, footer
    top 828 and 780) and both take clicks.
12. Rank errors on the setup page: on `/setup/ranks` choose `+ Custom rank`, Code `SGT`, Label `Squad Sergeant`, then
    `Add rank`. Expect the URL unchanged, Code marked invalid and described by
    `Rank catalog entry already exists. Edit it instead.`, and both typed values kept. Settings › Ranks shows the same
    error for the same input.
13. Continue while a rank save is pending: the hold matches only the fixture unit, so as `orgOwner` on
    `/org/<orgA>/setup/ranks` run `$V network arm-hold PAGE settings/ranks/saveRank` and submit step 12's draft. Expect
    `Continue to Personnel` disabled and described by `Saving your change…`, and no POST to
    `api/organization/setup/answer`. `$V network release PAGE`: the duplicate error shows with the draft kept, the URL
    stays `/setup/ranks` and Continue is enabled again. `$V network restore PAGE`. Calendar holds Continue the same way
    while a status type, assignment type, lane order or closure saves.
14. After step 8 (add Jane Fixround, MOS `68W`), import a CSV with the header `Last name,First name,Rank,MOS` and the
    row `Fixround,Jane,SPC,25B`. Review reads `Update · 1` and `0 added · 1 updated`, with MOS `68W` becoming `25B`.
    After `Import 1 change` and a reload the footer still reads `1 person so far`.

## Feature steps

Training, Critical tasks, Evaluations, Onboarding, Losses and awards and Events & Taskings each ask
`Will your unit use <Feature>?` with three cards: `Set it up now`, `Later` and `We won’t use it`.

- `Set it up now` shows the step's entry point; Continue records `reviewed` unless data already makes the step Done.
- `Later` records `later`; the feature stays on and the footer note reads `<Feature> stays on`.
- `We won’t use it` opens a panel in place, `What turning off <Feature> does`, with On, Off and Reversible rows. The
  footer reads `No data is removed` and `Turn off <Feature> and continue`, which writes the Settings › Features switch
  (audit `organization.settings_updated`) and then opens the next step.
- An already-off feature opens on `We won’t use it` with a `<Feature> is off` panel and `Turn <Feature> back on`.

```bash
$V fault arm org-feature-switch             # next PATCH /rest/v1/organizations carrying disabled_features returns 500
$V fault arm org-setup-training-editor-read # next training_types list read returns 500
$V network arm-hold PAGE training-types/editor # holds the Training step's type editor read until release
```

The type editor loads when the Training step mounts, so arm either control on another step and reach Training through
the rail; a reload makes the page's own reads run first.

Preconditions: steps 1-9 above are not required. Training suggestions need the unit's branch. If the Welcome step on
your checkout cannot set it, set Army from the owner page with `evaluate_script`; the request answers 200:

```js
async () =>
	(
		await fetch('/org/<seg>/api/organization/setup/branch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ branch: 'army' })
		})
	).status;
```

1. As `orgOwner`, open `/setup/training`. Expect the `Common Army annual training` panel with 8 rows, each `12 mo`, all
   checked, and `8 of 8 selected`. The seed's own training types are not on the Army list; they appear under
   `Your own types`, below the hint row and `Add your own type`, one row each with a pencil, the name and its period.
   The count shows a skeleton until the unit's types load. Uncheck 5. Expect `3 of 8 selected`, the note
   `Adds 3 training types` and `Add 3 and continue`. Choose it: `/setup/critical-tasks`. `$V rows training_types orgA`
   lists the 3 names; Training › Types shows each `Every 12 months`. Back on `/setup/training` the 3 rows read
   `Added`, checked and disabled.
2. Still on `/setup/training`, uncheck `OPSEC`: `4 of 5 selected`. Choose `Add your own type`. The Training type sheet
   opens over the step with the eyebrow `New training type · <n+1> of <n+1>`, where n is the unit's type count, and the
   URL stays `/setup/training`. Enter `Range Safety`, keep `Every few months` at 12 and choose `Create type`. Expect the
   sheet to close, a `Range Safety` row reading `12 mo` under `Your own types`, `OPSEC` still unchecked and
   `4 of 5 selected`. The newest `$V rows audit_logs orgA` row is `training_type.created`. Choose the `Range Safety`
   row: the sheet reopens as `Edit training type`; `Cancel` closes it with no write. Do not continue.
3. Choose `We won’t use it`, then `Turn off Training and continue`. Reopen `/setup/training`: `Training is off`. Choose
   `Turn Training back on`. Expect `Set it up now` selected and every Army row that is not `Added` checked:
   `5 of 5 selected` and `Add 5 and continue`. Do not continue.
4. Set the branch to `navy` with the request in the preconditions, then reload `/setup/training`. Expect a
   `Training types` panel with no Army list: the hint row and `Add a type` first, then two skeleton rows while the
   types load and one row per unit type, including `Range Safety`. `Add a type` opens the same sheet. Set the branch
   back to `army`.
5. `/setup/critical-tasks`: choose `Later`, Continue. The answer is stored (revisit shows `Later` checked), but the rail
   stays Done because seed task lists make the step Done; Done outranks Later.
6. `/setup/evaluations`: choose `Later`, Continue. Expect the rail row `Evaluations, later`, and on the Dashboard the
   hint `Evaluations is on, but there are no rating scheme entries yet` with `Add an entry`.
7. Back on `/setup/evaluations`, choose `We won’t use it`. Expect the consequence panel.
   `$V fault arm org-feature-switch`, then `Turn off Evaluations and continue`: the URL stays, the alert reads
   `Couldn't save. Internal server error`, the rail is unchanged and `$V fault state` shows one match.
   `$V fault restore`, then choose it again: `/setup/onboarding`, the rail row `Evaluations, off`, and Evals is gone
   from the sidebar. The newest `$V rows audit_logs orgA` row is `organization.settings_updated` with
   `{disabled_features: ['evaluations'], previous_disabled_features: []}`.
8. Settings › Features shows the Evaluations switch off. Turn it on there: the audit row has the same action with
   `{disabled_features: [], previous_disabled_features: ['evaluations']}`. `/setup/evaluations` opens on `Later`, the
   rail reads `Evaluations, later` and Evals is back in the sidebar.
9. `/setup/onboarding`: check `First Week Operations`. Expect the note `Adds a template and 2 training types` and
   `Add First Week Operations and continue`. Choose it: `/setup/losses-and-awards`, Onboarding Done.
   `$V rows onboarding_templates orgA` gains `New Arrival Packet`; `$V rows training_types orgA` gains
   `Unit Orientation` and `Required Annual Training`.
10. `/setup/losses-and-awards` shows the loss warning window (`180 days` on seed) and
    `change it in Settings › Features`. Continue marks it Done.
11. `/setup/events-and-taskings`: turn it off. Expect `/setup/invite` and the rail row Off. Reopen the step:
    `We won’t use it` is checked, the panel reads `Events & Taskings is off`. `Turn Events & Taskings back on` returns
    the sidebar link, sets the rail row to not answered and selects `Set it up now` with `Open Events` and
    `Open Taskings`.
12. As `orgAdmin`, every step shows the same actions as the owner. Admins always hold configure on every feature, so the
    `capability_overrides` on admin fixtures such as `deletionReviewer` change nothing here; a viewer without Training
    configure is covered by the component test only.
13. Layout: at 1440 px the three cards sit in one row and the Army list in two columns. At 1024 px the cards stack and
    the list is one column. At 390 px the footer is the dark band, the list shows 3 rows and `Show 5 more`, a long label
    such as `Turn off Events & Taskings and continue` wraps to two lines beside its note, and the page never scrolls
    sideways. At 1024 px the `Your own types` rows and `Add your own type` fit the 400 px step column without
    truncating `Range Safety`; at 390 px the type sheet fits the screen and its footer buttons stay reachable.
14. Editor load failure: on `/setup/critical-tasks`, `$V fault arm org-setup-training-editor-read`, then choose the
    rail's Training link. Expect an alert in the Army panel, `Internal server error` then
    `Types that already exist are skipped when you add.`, with `Retry`. All 8 rows read `12 mo`, checked and checkable,
    the footer reads `Add 8 and continue`, `Add your own type` is disabled, and the rail and choice cards still work.
    `$V fault state` shows one match on `GET /rest/v1/training_types`. `$V fault restore`, then `Retry`: the alert
    clears and `Your own types` lists the unit's types.
15. Layout shift: on `/setup/critical-tasks` of a unit with own types, register a buffered `layout-shift` observer,
    `$V network arm-hold PAGE training-types/editor` and choose the rail's Training link. While held, the count shows
    its skeleton and `Add your own type` is disabled. `$V network release PAGE`: `Your own types` appears below the hint
    row, and the summed `value` of entries without `hadRecentInput` since the click is 0 at 1440 and 390 px.
    `$V network restore PAGE`.

## Invite your team step

`/setup/invite` embeds the Settings › Members invite strip: the `Invite` email field, `Role` (owner only), `Preset`,
`Groups` and `Send invite`, under a band that says it is the same form as Settings › Members. Below it,
`Waiting on them` lists each pending invitation as `<email>` and `<preset> · sent <relative> · <funnel status>`, with a
link to Settings › Members for Resend and Revoke. The strip posts to the Members `?/invite` action and a sent invitation
reaches the same mail sink as [organization invitations](organization-invitations.md).

1. As `orgOwner`, `$V actor orgOwner settings/general`, then open `/setup/invite`. Expect `Step 12 of 12 · Team`, the
   strip on one line at 1440 px (92 px tall, 816 px wide), no `Waiting on them` list on a fresh seed and
   `Continue to Done`. The seed already has other members, so the rail row reads Done and the counter `5 of 12`.
2. `$V fill PAGE textbox "Invite" s4-invite-one@example.test`, then `$V click PAGE button "Send invite"`. Expect the
   line under the strip to read `Invitation created and email delivery was queued.`, the email field empty, one
   `Waiting on them` row `Editor · sent today · Waiting on them` and, from `$V mail state`, an `account-setup` and an
   `invitation` message for that address. Settings › Members lists the same invitation.
3. Send the same address again. Expect `An invitation for this email is already pending` under the strip, the address
   still in the field and the URL unchanged. With `$V fault arm setup-link-create` and a new address, expect
   `Invitation could not be created because the account setup link could not be issued`, the draft kept and the
   invitation stored `blocked`, not `pending`. `$V fault restore` afterwards.
4. As `orgAdmin`, the same step shows the strip without `Role` and a sent invitation lists the same way. As `orgMember`,
   the step answers 403 like the rest of setup.
5. In a unit with only its owner, create one at `/org/new` and open `/setup/invite`. Expect `0 of 12` and the rail row
   `not answered`. Choose `Continue to Done`: the rail row reads `later`. Return, send an invitation and expect the row
   to read `done` and the counter `1 of 12` without a reload, and the same after a reload.
6. At 1024 and 390 px the strip wraps to more lines (192 px tall) and `#main-content` has no horizontal scroll. A reload
   records no layout shift.

Gotchas: Continue records Later, not Reviewed, when nothing is invited and no other member exists; data that makes the
step Done records nothing. The form's groups and the invitation list stream with the step, so the strip shows a skeleton
first; a failed read shows `The invitation form could not be loaded` with Retry.

## Setup entry and prompts

Only the owner sees any of this. An existing unit's owner gets a one-time invitation on the Dashboard: eyebrow
`For the owner · Organization setup`, title `Finish setting up <Organization>`, a `N of 12 already done` line with one
row per Done step, `Start setup` and `Not now`, and no close button. `Not now` swaps in `Remind me tomorrow` and
`Never ask again`. Escape or a click outside counts as `Remind me tomorrow`. After `Remind me tomorrow` or
`Finish later`, a quiet `Resume setup` button sits left of `Feedback` in the top bar; at 390 px it shows only its icon.
Its popover loads progress when opened: `R of 12 reviewed`, a bar, the unanswered steps in rail order with their group,
`Continue with <first unanswered step>` (or `Review and finish` when none is left) and `Never ask again`. While
`Never ask again` saves, Escape, an outside click and the button leave the popover open. A Dashboard visit opens at most
one prompt; the What's New dialog waits for a later visit when a setup prompt opened.

Writes go to `POST /org/<seg>/api/organization/setup/prompt` with `{ key, choice }`; progress is
`GET /org/<seg>/api/organization/setup/progress`. Both answer 403 for anyone but the owner.

1. New unit: as `orgOwner`, create a unit at `/org/new`. Expect `/org/<new seg>/setup/welcome` with the `Welcome`
   heading, not the Dashboard.
2. Existing unit: `$V actor orgOwner dashboard` on fresh seed, then open `/org/<seg>`. The Dashboard renders first; the
   invitation dialog then opens once with `5 of 12 already done` and rows Personnel, Training, Critical tasks,
   Onboarding and Invite your team, each with a check and its group (`Your unit`, `Features`, `Team`). The dialog opens
   with its count already filled; it does not grow after opening. `Start setup` links to `/org/<seg>/setup`. Press
   Escape: expect exactly one POST `{"key":"setup","choice":"tomorrow"}` answering 200, the dialog closed and
   `Resume setup` in the top bar. A reload shows no invitation and keeps `Resume setup`. A click on the dimmed page
   outside the dialog behaves the same.
3. Remind me tomorrow: on a fresh visit with the invitation open, `Not now`, then `Remind me tomorrow`. Expect one POST
   with `{"key":"setup","choice":"tomorrow"}` answering 200 with `prompts.setup.snoozedUntil` set to the browser's
   tomorrow (`() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA'); }`), the
   dialog closed, `Resume setup` in the top bar and no second dialog after the reload that follows. A full reload shows
   no invitation and keeps `Resume setup`.
4. Resume popover: open `Resume setup`. Expect skeleton lines, then `5 of 12` `reviewed` on fresh seed (the setup rail's
   count once steps are answered), the unanswered steps in rail order Welcome, Groups, Ranks, Calendar, Evaluations,
   Losses and awards, Events & Taskings, and `Continue with Welcome` linking to `/org/<seg>/setup/welcome`. Exactly one
   GET to the progress endpoint per opening and none before the first opening. Close it,
   `$V fault arm org-setup-training-count`, open it again: the count drops to `4 of 12`, Training is listed as
   unanswered and a muted note says more steps may already be done. Close it, `$V fault arm org-setup-state-read`, open
   it again: the progress GET fails and the popover shows a destructive alert
   `Couldn’t load setup progress. Internal server error` with `Try again` and no Continue link; `Try again` loads the
   count. `$V fault restore`.
5. Next local day: the snooze compares the viewer's local day, read from the `t2t_tz` cookie, which a full page load
   rewrites to the browser's zone. Launch with `--browser-timezone Pacific/Kiritimati` (UTC+14). Before step 3's choice,
   run `evaluate_script` `() => { document.cookie = 't2t_tz=Pacific/Pago_Pago; Path=/'; }` (UTC−11, one or two calendar
   days behind Kiritimati). The POST answers with `snoozedUntil` one day after the Pago Pago date, which is no later
   than the Kiritimati day. Reload once: that load still reads the Pago Pago cookie, rewrites it and shows no
   invitation. Reload again: the invitation returns once. Choose `Remind me tomorrow` again; after a reload it stays
   hidden until the next Kiritimati day.
6. Finish later: open `/setup/groups` and choose `Finish later` in the rail. Expect the Dashboard, a POST
   `{"key":"setup","choice":"tomorrow"}` before the navigation, no invitation and `Resume setup` present.
7. Never ask again: from the invitation (`Not now`, `Never ask again`) or the popover's `Never ask again`. Expect a POST
   `{"key":"setup","choice":"never"}`, the dialog or popover closed, `Resume setup` gone, and after a reload neither
   returns. Settings › General still shows `Open setup`. `Finish later` from `/setup/groups` then sends no prompt POST
   and the Dashboard shows no `Resume setup`.
8. Admin and member: `$V actor orgAdmin dashboard` and `$V actor orgMember dashboard`, then open `/org/<seg>`. Expect no
   invitation, no `Resume setup` and no request to either setup endpoint. A direct GET to the progress endpoint and a
   direct prompt POST each answer 403 for both.
9. Failed choice: on a fresh visit with the invitation open, `$V fault arm org-setup-prompt`, then press Escape, or
   choose `Not now` and `Remind me tomorrow`. Expect the POST to answer 500, the dialog still open with a destructive
   alert reading `Internal server error`, the buttons enabled again and no `Resume setup`. `$V fault state` shows one
   match; `$V fault restore`, choose again and the dialog closes. The same fault on the popover's `Never ask again`
   keeps the popover open with the alert.
10. New feature: no registry step has a `since` date. For a live check, add `since: '2099-01-01'` to the
    `eventsAndTaskings` entry in `src/features/organization/setup/registry.ts` without committing it, `restart`, and
    restore the file with `git checkout` before any push. On fresh seed the invitation still wins. With setup snoozed
    (step 5's first reload), the Dashboard opens the new-feature dialog instead: eyebrow `New feature · For the owner`,
    title `Events & Taskings`, the step's pitch, `Set it up` linking to `/org/<seg>/setup/events-and-taskings`,
    `Remind me tomorrow` and `Never ask again`. After `Never ask again` on the invitation, no dialog opens on any visit
    and the top bar shows a `New: Events & Taskings` link with a blue dot to `/org/<seg>/setup/events-and-taskings`
    instead of `Resume setup`; at 390 px it reads `New`. After `Finish` on `/setup/done` with setup not declined, the
    Dashboard opens the new-feature dialog; Escape or a click outside posts
    `{"key":"eventsAndTaskings","choice":"tomorrow"}`, closes it and leaves the `New: Events & Taskings` link.
11. Capture the invitation, the Resume popover, the new-feature dialog and the top bar at 1440, 1024 and 390 px. At 390
    px the dialog's buttons stack with the primary action last, the top bar keeps the breadcrumb, the Resume icon or
    `New`, notifications and theme, and nothing scrolls horizontally (`document.documentElement.scrollWidth` equals
    `innerWidth`).

Gotchas: the invitation and Resume decisions stream after first paint, so the dialog and button appear a moment after
the Dashboard. A choice reruns only the Organization layout's `app:organization-setup` load; the Dashboard page keeps
its data. The setup state persists across workers' sessions until reseed, so record the starting `prompts` from the
first POST response, `restart` between cases, or set a prompt back through the prompt endpoint as the owner with
`evaluate_script` `fetch`. Chromium's Slow 3G emulation does not slow the loopback prompt POST, so the popover's pending
`Never ask again` cannot be held live; `SetupResume.svelte.test.ts` holds it.
