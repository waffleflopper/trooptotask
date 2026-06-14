# Plan 066: Split Calendar settings and delete stale managers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 9a1e439b..HEAD -- src/features/calendar/components/CalendarSettingsPage.svelte src/features/calendar/components/CalendarSettingsPage.test.ts src/features/calendar/components/StatusTypeManager.svelte src/features/calendar/components/AssignmentTypeManager.svelte src/features/calendar/components/SpecialDayManager.svelte src/features/calendar/components/PersonStatusModal.svelte src/features/calendar/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `9a1e439b`, 2026-06-14

## Why this matters

Calendar settings now has a single 1,100-line component that owns status types,
assignment types, closures, navigation, dialogs, filtering, and permissions. At
the same time, older manager components for similar concepts still exist but are
not imported anywhere except comments in `calendar/index.ts`. This invites
contributors to edit the wrong path and makes the active settings page expensive
to change.

## Current state

- `CalendarSettingsPage.svelte` owns three sections through a local
  `Section` union: `status`, `assignments`, and `closures`.
- The same file contains separate state/handler blocks for status types,
  assignment types, and closures.
- Old `StatusTypeManager.svelte`, `AssignmentTypeManager.svelte`,
  `SpecialDayManager.svelte`, and `PersonStatusModal.svelte` files still exist.
- `rg` finds those old manager names only in comments in
  `src/features/calendar/index.ts`.

Current excerpts:

```svelte
<!-- src/features/calendar/components/CalendarSettingsPage.svelte:44 -->
type Section = 'status' | 'assignments' | 'closures';
let activeSection = $state<Section>('status');
```

```svelte
<!-- src/features/calendar/components/CalendarSettingsPage.svelte:73 -->
<!-- ---- Status Types ---- -->
let addStatusOpen = $state(false);
```

```svelte
<!-- src/features/calendar/components/CalendarSettingsPage.svelte:175 -->
<!-- ---- Assignment Types ---- -->
let addAssignmentOpen = $state(false);
```

```svelte
<!-- src/features/calendar/components/CalendarSettingsPage.svelte:277 -->
<!-- ---- Holidays & Special Days ---- -->
let addClosureOpen = $state(false);
```

```ts
// src/features/calendar/index.ts:34
// $features/calendar/components/StatusTypeManager.svelte
// $features/calendar/components/SpecialDayManager.svelte
// $features/calendar/components/PersonStatusModal.svelte
// $features/calendar/components/AssignmentTypeManager.svelte
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Svelte docs flow | Svelte MCP `list-sections`, then `get-documentation` for relevant sections | docs read before Svelte edits |
| Calendar settings tests | `npx vitest run src/features/calendar/components/CalendarSettingsPage.test.ts` | exits 0 |
| Stale manager grep | `rg -n "StatusTypeManager|AssignmentTypeManager|SpecialDayManager|PersonStatusModal" src/features/calendar src/routes` | no matches |
| Svelte autofix | `svelte-autofixer` on edited Svelte files | no issues or suggestions |
| Format | `npm run format` | exits 0 |
| Lint | `npm run lint` | exits 0 |
| Governance | `npm run governance:check` | exits 0 |
| Typecheck | `npm run check` | exits 0 |
| Unit tests | `npm run test` | exits 0 |

## Suggested executor toolkit

- Because this touches Svelte files, follow `docs/agents/svelte.md`: call the
  Svelte MCP `list-sections`, read every relevant returned `use_cases` section
  with `get-documentation`, and run `svelte-autofixer` until clean.

## Scope

**In scope**:

- `src/features/calendar/components/CalendarSettingsPage.svelte`
- `src/features/calendar/components/CalendarSettingsPage.test.ts`
- New section components under `src/features/calendar/components/`, for example
  `CalendarStatusSettingsSection.svelte`,
  `CalendarAssignmentSettingsSection.svelte`, and
  `CalendarClosureSettingsSection.svelte`
- `src/features/calendar/components/StatusTypeManager.svelte`
- `src/features/calendar/components/AssignmentTypeManager.svelte`
- `src/features/calendar/components/SpecialDayManager.svelte`
- `src/features/calendar/components/PersonStatusModal.svelte`
- `src/features/calendar/index.ts`
- `plans/README.md` status row only

**Out of scope**:

- Do not change Calendar settings behavior, copy, permissions, or API calls.
- Do not redesign the UI.
- Do not change Calendar stores.
- Do not add migrations.
- Do not batch this with other Calendar settings work.

## Git workflow

- Branch: `codex/066-split-calendar-settings-and-delete-stale-managers`
- Commit style: short imperative subject. Suggested: `Split Calendar settings sections`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Delete stale manager files

Run:

```bash
rg -n "StatusTypeManager|AssignmentTypeManager|SpecialDayManager|PersonStatusModal" src/features/calendar src/routes
```

If the only matches are the comments in `src/features/calendar/index.ts`, delete:

- `StatusTypeManager.svelte`,
- `AssignmentTypeManager.svelte`,
- `SpecialDayManager.svelte`,
- `PersonStatusModal.svelte`.

Remove the corresponding comments from `src/features/calendar/index.ts`.

**Verify**:
`rg -n "StatusTypeManager|AssignmentTypeManager|SpecialDayManager|PersonStatusModal" src/features/calendar src/routes`
returns no matches.

### Step 2: Extract the status settings section

Move status-type state, derived values, handlers, dialogs, and markup out of
`CalendarSettingsPage.svelte` into a new component such as
`CalendarStatusSettingsSection.svelte`.

Keep existing stores and permission behavior:

- `statusTypesStore`,
- `availabilityStore.removeByStatusTypeLocal`,
- `canMutate`,
- DA6 duty roster treatment controls,
- dirty-dialog close behavior.

`CalendarSettingsPage.svelte` should still own top-level navigation and
`activeSection`, but the status section should own its add/edit/delete state.

**Verify**:
`npx vitest run src/features/calendar/components/CalendarSettingsPage.test.ts`
exits 0.

### Step 3: Extract the assignment settings section

Move assignment-type state, derived values, handlers, dialogs, and markup into a
new component such as `CalendarAssignmentSettingsSection.svelte`.

Preserve:

- filtering of archived assignment types,
- add/edit/delete behavior,
- `showInDateHeader` behavior,
- existing button labels and test selectors.

**Verify**:
`npx vitest run src/features/calendar/components/CalendarSettingsPage.test.ts`
exits 0.

### Step 4: Extract the closure settings section

Move holiday/special-day state, derived values, handlers, dialogs, and markup
into a new component such as `CalendarClosureSettingsSection.svelte`.

Preserve:

- `formatDate(new Date())` local-date default,
- year filtering,
- add/edit/delete behavior,
- reset federal holidays behavior,
- existing confirmation dialogs.

**Verify**:
`npx vitest run src/features/calendar/components/CalendarSettingsPage.test.ts`
exits 0.

### Step 5: Keep the page as a coordinator

After extraction, `CalendarSettingsPage.svelte` should mainly contain:

- permission gate,
- `activeSection`,
- search query if it remains shared,
- section navigation,
- section component selection.

Do not leave unused state blocks for extracted sections in the page file.

**Verify**:
`wc -l src/features/calendar/components/CalendarSettingsPage.svelte` is
substantially lower than the current 1,141 lines, and
`npx vitest run src/features/calendar/components/CalendarSettingsPage.test.ts`
still exits 0.

### Step 6: Run Svelte autofix and full gate

Run `svelte-autofixer` on each edited or new Svelte component until it reports
no issues or suggestions.

Then run:

```bash
npm run format
npm run lint
npm run governance:check
npm run check
npm run test
```

**Verify**: every command exits 0.

## Test plan

- Existing Calendar settings tests should continue to cover restricted state,
  status controls, assignment controls, closure controls, dirty dialogs, and
  permissions.
- Add small section-component tests only if extraction makes a behavior hard to
  assert through `CalendarSettingsPage.test.ts`.
- Svelte autofixer and full repo gate.

## Done criteria

- [ ] Stale manager files are gone.
- [ ] `CalendarSettingsPage.svelte` is a coordinator, not the owner of every
      section's local state.
- [ ] Existing Calendar settings behavior is unchanged.
- [ ] Svelte MCP/autofixer workflow completed for Svelte edits.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row for 066 is updated.

## STOP conditions

Stop and report back if:

- Any stale manager file is actually imported by active runtime code.
- Extracting sections requires changing store APIs or user-visible behavior.
- Svelte autofixer reports a structural problem that cannot be resolved without
  redesigning the component.
- Tests reveal Calendar settings has hidden coupling to another route or modal.

## Maintenance notes

Keep future Calendar settings work section-owned. If a fourth settings section
is added, create a sibling section component instead of growing the coordinator.

