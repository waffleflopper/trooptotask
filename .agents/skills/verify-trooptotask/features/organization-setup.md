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
```

`org-setup-answer` fails the Continue write before it reaches the database. `org-setup-training-count` fails the first
training type count after arming; arm it, then reload a setup page so the setup facts are the first read.

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

## Gotchas

- Continue writes nothing for a step the unit's data already makes Done, so the counter may start above zero.
- A feature turned off in Settings › Features shows its step as Off with a struck title; Continue skips the write.
- Setup state lives on the Organization. Finish and every answer persist across workers' sessions until reseed.

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
$V fault arm org-feature-switch # next PATCH /rest/v1/organizations carrying disabled_features returns 500
```

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
   checked, and `8 of 8 selected`; the seed's own training types are not on the Army list. The count shows a skeleton
   until the unit's types load. Uncheck 5. Expect `3 of 8 selected`, the note `Adds 3 training types` and
   `Add 3 and continue`. Choose it: `/setup/critical-tasks`. `$V rows training_types orgA` lists the 3 names; Training ›
   Types shows each `Every 12 months`. Back on `/setup/training` the 3 rows read `Added`, checked and disabled.
2. `/setup/critical-tasks`: choose `Later`, Continue. The answer is stored (revisit shows `Later` checked), but the rail
   stays Done because seed task lists make the step Done; Done outranks Later.
3. `/setup/evaluations`: choose `Later`, Continue. Expect the rail row `Evaluations, later`, and on the Dashboard the
   hint `Evaluations is on, but there are no rating scheme entries yet` with `Add an entry`.
4. Back on `/setup/evaluations`, choose `We won’t use it`. Expect the consequence panel.
   `$V fault arm org-feature-switch`, then `Turn off Evaluations and continue`: the URL stays, the alert reads
   `Couldn't save. Internal server error`, the rail is unchanged and `$V fault state` shows one match.
   `$V fault restore`, then choose it again: `/setup/onboarding`, the rail row `Evaluations, off`, and Evals is gone
   from the sidebar. The newest `$V rows audit_logs orgA` row is `organization.settings_updated` with
   `{disabled_features: ['evaluations'], previous_disabled_features: []}`.
5. Settings › Features shows the Evaluations switch off. Turn it on there: the audit row has the same action with
   `{disabled_features: [], previous_disabled_features: ['evaluations']}`. `/setup/evaluations` opens on `Later`, the
   rail reads `Evaluations, later` and Evals is back in the sidebar.
6. `/setup/onboarding`: check `First Week Operations`. Expect the note `Adds a template and 2 training types` and
   `Add First Week Operations and continue`. Choose it: `/setup/losses-and-awards`, Onboarding Done.
   `$V rows onboarding_templates orgA` gains `New Arrival Packet`; `$V rows training_types orgA` gains
   `Unit Orientation` and `Required Annual Training`.
7. `/setup/losses-and-awards` shows the loss warning window (`180 days` on seed) and `change it in Settings › Features`.
   Continue marks it Done.
8. `/setup/events-and-taskings`: turn it off. Expect `/setup/invite` and the rail row Off. Reopen the step:
   `We won’t use it` is checked, the panel reads `Events & Taskings is off`. `Turn Events & Taskings back on` returns
   the sidebar link, sets the rail row to not answered and selects `Set it up now` with `Open Events` and
   `Open Taskings`.
9. As `orgAdmin`, every step shows the same actions as the owner. Admins always hold configure on every feature, so the
   `capability_overrides` on admin fixtures such as `deletionReviewer` change nothing here; a viewer without Training
   configure is covered by the component test only.
10. Layout: at 1440 px the three cards sit in one row and the Army list in two columns. At 1024 px the cards stack and
    the list is one column. At 390 px the footer is the dark band, the list shows 3 rows and `Show 5 more`, a long label
    such as `Turn off Events & Taskings and continue` wraps to two lines beside its note, and the page never scrolls
    sideways.
