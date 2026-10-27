# Organization setup

An owner or admin walks a guided pass over the unit: Welcome, then Groups, Ranks, Personnel, Calendar, one step per
feature and Invite, ending on a Done summary. Each step has its own URL and remembers whether it is reviewed.

## Sub-features

- `setup-entry`: Settings › General links to setup; `/org/<seg>/setup` opens the first unanswered step, or Done.
- `setup-rail`: the step rail shows every step grouped Your unit, Features and Team, each Done, Later, Off or not
  answered, with `N of 12 reviewed` and a progress bar. Below 1024 px it collapses to a step header with
  `All steps`.
- `setup-continue`: Continue records the step reviewed unless unit data already makes it Done, then opens the next
  step; the last step opens Done.
- `setup-history`: browser Back and Forward move between step URLs; a reload keeps rail state.
- `setup-done`: the summary counts Groups, Ranks, People, Statuses and pending invites, sorts features into On, Later
  and Off, and Finish lands on the Dashboard.
- `setup-failures`: a failed save keeps the owner on the step with `Couldn't save.` and the reason; a failed fact
  source marks only its steps and shows a load error with Retry.
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

1. `$V actor orgOwner settings/general`. Expect an `Organization setup` row with `Open setup`. Choose it. Expect
   `/setup/welcome` on fresh seed, title `Welcome`, no Back button, and `Continue to Groups`. The rail shows rows as
   skeleton glyphs first, then states, with no layout shift of the step body.
2. Choose `Continue to Groups`, then `Continue to Ranks`. Expect `/setup/ranks`; Welcome and Groups show Done and the
   counter reads `2 of 12 reviewed` or higher when seeded data already makes steps Done. Reload: the same counter and
   glyphs return.
3. Browser Back: `/setup/groups`. Forward: `/setup/ranks`. The rail's current row follows the URL.
4. Open `/setup/done`. Expect `N of 12 reviewed`, a headline naming the Organization when all steps are reviewed or
   `K steps still open` with links, the five counts, and On, Later and Off columns. Choose `Finish`; expect the
   Dashboard at `/org/<seg>`.
5. Repeat steps 1 and 2 as `orgAdmin`.
6. `$V actor orgMember settings/general` shows no setup row, and `/org/<seg>/setup/welcome` answers 403.
7. On a step that is not Done, `$V fault arm org-setup-answer`, then Continue. Expect the URL unchanged, an alert
   `Couldn't save.` with the reason, and the rail unchanged. `$V fault state` shows one match; `$V fault restore`, then
   Continue succeeds.
8. `$V fault arm org-setup-training-count`, reload `/setup/training`. Expect the Training rail row with an alert icon
   and an alert naming `Training types` with Retry; other rows keep their states and Continue stays enabled. Restore,
   then Retry clears the alert.
9. Capture a step and Done at 1440, 1024 and 390 px. At 390 px the rail is a step header (`Step n of 12 · Group`,
   `All steps`, a segmented bar), the footer stays at the bottom, and the page has no horizontal scroll.

## Gotchas

- Continue writes nothing for a step the unit's data already makes Done, so the counter may start above zero.
- A feature turned off in Settings › Features shows its step as Off with a struck title; Continue skips the write.
- Setup state lives on the Organization. Finish and every answer persist across workers' sessions until reseed.
