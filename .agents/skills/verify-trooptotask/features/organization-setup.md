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
3. `Review them in Ranks`. Branch coverage reads Army `28 active`, Navy `0 active, 23 retired`, Air Force 19, Marine
   Corps 26, Coast Guard 22 and Space Force 20 retired; Catalog `30 active · 110 retired · 0 custom`. Settings › Ranks
   shows the same numbers. A new unit that only ever chose Army shows the other services `Not added`, not retired.
4. In the embedded editor open `More actions for Navy` › `Reactivate retired ranks (23)` and confirm. The URL stays
   `/setup/ranks`; Navy reads `23 active`; Catalog `53 active · 87 retired`. Settings › Ranks matches after reload.
5. `/setup/groups` lists the unit's Groups (a new unit: Leadership, Alpha, Bravo, each `0 people`) under `3 groups`.
   `Manage groups` opens the Personnel Group manager; a Group added there appears in the list on Done.
   `Continue to Ranks` marks Groups Done.
6. Continue from Ranks to Personnel: `0 people so far`, `A handful of people?` with `Add a person`, and the import drop
   zone with `Columns we look for`. `Continue to Calendar` with nobody on the roster, or before the count loads, marks
   Personnel `later`.
7. `/setup/calendar` shows Calendar settings with Status Types 7, Assignment Types 1 and Holidays & closures 44 on a
   new unit, and no `Back to Calendar`. `Continue to Training` marks Calendar Done: `5 of 12`.
8. Back on Personnel, `Add a person`, fill Last name `Fixround`, First name `Jane` and MOS `68W`, then
   `Add Personnel`. Without a reload expect `1 person so far` and the rail's Personnel row Done. A reload keeps both.
9. As `orgAdmin` on the fixture unit every step shows the same editor actions (`Manage groups`, rank pack buttons,
   `Add a person`, the drop zone, Calendar `Add new`), and choosing a service saves.
10. `$V fault arm org-setup-ranks-references`, reload `/setup/ranks`. Expect an alert
    `The rank editor could not be loaded` with Retry, the rail states unchanged and `Continue to Personnel` enabled.
    `$V fault state` shows one match on `GET /rest/v1/training_types`. Restore, then Retry shows the editor.
11. At 1440, 1024 and 390 px no step scrolls sideways. At 1024 the embedded import stacks the drop zone above the
    column list and Calendar settings stacks its section list above the editor; at 1440 Calendar settings shows them
    side by side with Holidays & closures stacked.
12. Rank errors on the setup page: on `/setup/ranks` choose `Add custom rank`, Code `SGT`, Label `Squad Sergeant`, then
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
