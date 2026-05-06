# Advanced Duty Workspace Redesign Plan

> Supersession note: the replacement target is now `docs/plans/2026-05-03-duty-roster-replacement-da6-prd.md`. This workspace redesign is no longer the current target UI. Future UI work should focus on the template-first DA6 Duty Roster workspace, with URL-addressable Generate, History, and Settings views.

## Purpose

Turn issue #708 into an implementation-ready design plan for the **Advanced Duty Workspace**.

This plan keeps the product direction from #699 and ADR 0007 intact: advanced duties remain team-duty runs, preview creates a server-custodied draft **Advanced Run Snapshot**, apply consumes that reviewed snapshot by identity, and preview-only export stays clearly labeled as not applied output.

The goal was not to restyle the then-current wizard. The goal was to replace the rigid stepper and stacked preview/history layout with a workspace that let an operator configure, review, edit, apply, export, and inspect advanced duty runs without losing the active run as the primary job.

## Historical State At Plan Time

- The removed legacy page had a top-level toggle between the old wizard and advanced template management.
- The removed legacy wizard owned lane selection, simple duty generation, advanced template selection, policy review, date pattern setup, candidate review, preview, apply, and the applied-event manager.
- Removed legacy preview components rendered the active advanced preview as stacked date or pool cards.
- Removed legacy applied-event components were permanently stacked under the active advanced flow when the user was not in the simple template list or simple generator.
- This made applied-event history visually compete with the active run, even when the operator was trying to review one draft snapshot.
- The old stepper was useful as a first-run guide, but it became a narrow path once the operator needed to iterate between setup, candidates, preview, overrides, collisions, export, and apply.

## Design Register

This is product UI. The interface should feel like a dense operational work surface, not a marketing page or decorative dashboard.

Use the existing TroopToTask design language:

- warm paper surfaces
- dark ink text
- hairline rules
- tight radii
- mono metadata labels
- operational amber only for selection, focus, status, or primary action
- tables and grids as work surfaces, not card soup

The physical scene is an NCO or staff leader reviewing CQ or staff-duty coverage on a common 1920x1080 workstation during routine planning, with interruptions likely and confidence more valuable than visual flourish. The surface should be light, dense, and stable.

## Goals

1. Make active-run review the default and primary workspace.
2. Preserve the app shell and global left navigation.
3. Keep simple duty roster generation available without making it drive the advanced workflow shape.
4. Move applied-event inspection into a separate reachable workspace view.
5. Replace accordion-heavy preview review with a dense scan-and-edit table.
6. Keep snapshot state visible: draft, stale, expired, applying, applied/finalized, failed-before-persistence, and partial recovery.
7. Keep generated proposal, user-changed, locked, cleared/unfilled, warning, and conflict states plain-language and scannable.
8. Make later implementation slices vertical and reversible enough to land safely.

## Non-Goals

- Do not redesign the app shell or global left navigation.
- Do not change authorization, group scope, or production migration behavior.
- Do not revisit snapshot custody from ADR 0007.
- Do not turn advanced duties into DA6-style simple rosters.
- Do not hide the broader redesign inside #706.
- Do not expand deprecated demo or sandbox behavior.
- Do not require the first implementation slice to solve every advanced-duty export or recovery edge case.

## Workspace Information Architecture

The duty roster route should keep a clear top-level split:

- **Assignments / Taskings**: the existing daily assignment and tasking workflow.
- **Advanced Workspace**: the default advanced duty run workspace described here.
- **Advanced Templates**: template management for users who can manage advanced templates.

Inside **Advanced Workspace**, use tabs or a segmented control for:

- **Active Run**: configure, preview, edit, apply, and export the draft or reviewed run.
- **Applied Events**: inspect, edit, export, and delete already-applied advanced duty events and runs.

The default advanced view should be **Active Run**. Applied Events should be one click away, but it should not permanently occupy vertical space below the active run.

## Wide-Screen Layout

On wide screens, the Advanced Workspace should use two interior regions:

- A left setup rail, approximately 280-340px wide.
- A main review workspace that keeps the generated run table, status, warnings, and actions in view.

The left setup rail owns:

- template selection
- date pattern
- candidate pool summary and entry point
- run state summary
- regenerate controls
- snapshot metadata once available

The main review workspace owns:

- active run status band
- dense review table
- warning and conflict review
- slot editing controls
- apply, preview-only export, and regenerate actions

The page should not exceed a narrow centered max-width like the current `1200px` shell for this view. The advanced review surface needs enough horizontal room to show date, coverage, slot, proposed Soldier, source, warnings/conflicts, unfilled state, and actions without collapsing into a long card stack.

## Narrow-Screen Layout

On narrower screens:

- Collapse the setup rail into a top summary bar or drawer-like section within the workspace.
- Keep Active Run and Applied Events as separate views.
- Preserve table scanability with sticky first columns, grouped rows, or compact stacked rows only when the viewport cannot support the full grid.
- Keep apply/export/regenerate reachable without forcing the operator to scroll past the entire run output.

Mobile can be functional and honest, but the primary optimization target is still common desktop duty planning.

## Active Run Surface

The active run should behave like a review board rather than a wizard step.

Recommended structure:

1. **Run Header**
   - template name
   - run date pattern
   - event count
   - slot fill summary
   - snapshot state
   - last generated or expiration timestamp when available

2. **Persistent Action Bar**
   - regenerate preview
   - preview-only export
   - apply run
   - retry apply when allowed
   - recovery action when partial failure exists

3. **Setup Rail**
   - compact template selector
   - date pattern controls
   - candidate pool summary and edit entry
   - policy summary with an edit-template path
   - snapshot state and regeneration reason

4. **Review Table**
   - one row per slot instance
   - date
   - coverage
   - role or slot
   - proposed Soldier
   - assignment source
   - state or issue
   - action controls

5. **Review Panels**
   - collisions
   - unfilled slots
   - stale or expired snapshot notices
   - apply failure or partial recovery details

Use filters or grouping controls above the table:

- date
- rotation pool
- assignment source
- warnings/conflicts
- unfilled only

These controls should aid scanning, not replace the table with nested accordions.

## Review Table Behavior

The table should support the work operators actually do:

- Scan all generated slot proposals quickly.
- See which assignments are generated, manually changed, locked, cleared, conflicting, or unfilled.
- Change a proposed Soldier in place.
- Lock a slot.
- Clear a slot intentionally.
- Reset a changed slot to the generated proposal.
- Filter to conflicts or unfilled slots before apply.
- Confirm collision or shortfall review before apply when required.

Recommended columns:

| Column | Purpose |
| --- | --- |
| Date | Groups the event or series date. |
| Coverage | Shows all-day or timed coverage. |
| Slot | Shows role label and slot number. |
| Proposed Soldier | Main editable assignment cell. |
| Source | Generated, Changed by user, Locked, Cleared, or Unfilled. |
| Issue | Warning, Conflict, Low confidence, or No issue. |
| Actions | Replace, lock/unlock, clear, reset. |

The row state vocabulary should stay plain-language:

- **Generated**: produced by the run engine.
- **Changed by user**: manually replaced after generation.
- **Locked**: intentionally held through regeneration.
- **Cleared**: intentionally left open by the operator.
- **Unfilled**: the system could not fill the slot.
- **Conflict**: overlaps another duty or assignment that needs review.
- **Warning**: safe enough to review, but requires attention.
- **Low confidence**: generated with incomplete history or weak fairness data.

## Snapshot State Language

The workspace should reserve visible state language for snapshot lifecycle and apply recovery:

| State | User meaning | Primary action |
| --- | --- | --- |
| Draft preview | This is the generated run currently under review. | Apply, export preview, edit, regenerate |
| Stale preview | Source data or reviewed inputs no longer match the preview. | Regenerate |
| Expired preview | The 24-hour draft snapshot can no longer be applied. | Regenerate |
| Applying | The reviewed snapshot is being persisted. | Wait |
| Applied | The run is finalized and cannot be normally applied again. | View in Applied Events |
| Failed before persistence | Nothing was persisted, retry may be allowed if the draft is still valid. | Retry apply or regenerate |
| Partial recovery | Some persistence succeeded and recovery must be explicit. | Follow recovery action, do not blindly retry |

Preview-only export should be labeled as preview output, not final applied history.

## Applied Events View

Applied Events should become its own workspace view, not a permanent section beneath the active run.

It should keep current capabilities:

- inspect applied event groups
- open an applied event editor
- preview changes to an applied event
- save applied-event changes
- export applied duty packets
- delete an event or applied run when authorized

It should not decide active-run generation rules. Editing applied events remains operational record maintenance, separate from the draft run review.

## Component Direction

Use a phased component shape so implementation can land in vertical slices:

- `AdvancedDutyWorkspace.svelte`: owns Active Run vs Applied Events workspace tabs and layout shell.
- `AdvancedDutySetupRail.svelte`: owns template/date/candidate summary and regenerate affordances.
- `AdvancedDutyRunReviewTable.svelte`: owns dense preview rows and slot controls.
- `AdvancedDutyRunActionBar.svelte`: owns apply/export/regenerate/retry/recovery actions.
- `AdvancedDutyRunStateBanner.svelte`: owns snapshot and recovery state language.
- Existing applied-event manager: moves behind the Applied Events view first, then can be refined later.

These names are directional, not mandatory. The implementation should follow existing feature-module conventions and keep the page component as orchestration rather than business logic.

## Vertical Implementation Slices

### Slice 1: Workspace Shell And IA

Replace the advanced wizard default layout with an Advanced Workspace shell while preserving existing behavior.

Acceptance criteria:

- The duty roster page exposes Assignments / Taskings, Advanced Workspace, and Advanced Templates where authorized.
- Advanced Workspace has Active Run and Applied Events views.
- Applied Events no longer renders permanently under the active-run flow.
- Existing advanced template selection, date pattern, candidate review, preview, apply, and applied-event actions remain reachable.
- The app shell and global left navigation are unchanged.

### Slice 2: Setup Rail For Active Runs

Move advanced setup controls into a left rail on wide screens and a collapsed/top layout on narrower screens.

Acceptance criteria:

- Template, date pattern, candidate pool, policy summary, and regenerate controls are grouped in the setup rail.
- The main workspace remains wide enough for review output on 1920x1080 displays.
- The rail collapses or stacks before it makes the review table unusable.
- The current preview/apply contracts remain unchanged.

### Slice 3: Dense Run Review Table

Replace stacked preview cards with a dense review table for active run output.

Acceptance criteria:

- Slot proposals render in a table with date, coverage, slot, proposed Soldier, source, issue, and actions.
- Existing replace, lock, clear, and reset behavior remains available.
- Date and pool filters support fast scanning.
- Collision and unfilled review still block apply until acknowledged.
- Normal-sized runs fit with limited page-level scrolling on 1920x1080 displays.

### Slice 4: Persistent Run Actions And Snapshot State

Add a persistent action/state layer for regenerate, preview-only export, apply, retry, and recovery language.

Acceptance criteria:

- Apply/export/regenerate remain reachable while reviewing the run.
- Draft, stale, expired, applying, applied, failed-before-persistence, and partial-recovery states have clear plain-language copy.
- Preview-only export is visibly labeled as not applied.
- ADR 0007 snapshot identity and fingerprint assumptions remain intact.

### Slice 5: Responsive Polish And Focus States

Harden the workspace for narrower screens, keyboard use, and dense-table readability.

Acceptance criteria:

- The setup rail, table, filters, and action bar do not overlap or obscure each other.
- Keyboard focus states are visible for table controls, filters, tabs, and action buttons.
- Text fits inside controls at common desktop and narrower breakpoints.
- The layout keeps the active run primary and Applied Events separate.

## Stop Conditions

Stop and ask before implementation if the work requires:

- changing snapshot custody or draft expiration behavior
- adding or running database migrations
- changing authorization or group-scope semantics
- changing advanced duties into DA6 simple-roster behavior
- changing user-visible status treatment labels beyond the workspace state language above
- redesigning the global app shell or left navigation
- expanding deprecated demo or sandbox behavior

## Verification Expectations

For this planning slice:

- `git diff --check`

For implementation slices:

- focused component or module tests for the touched surface
- `npm run format`
- `npm run lint`
- `npm run governance:check`
- `npm run check`
- `npm run test`

## Source Issues And Docs

- Issue #708: Redesign Advanced Duty Workspace
- Parent RFC #699: Advanced Duty Run Module
- Related simple-run RFC #691: Duty Roster Run Module
- Related review issue #706: Advanced wizard flow review after snapshot integration
- ADR 0007: `docs/architecture/adrs/0007-advanced-duty-snapshot-custody.md`
- Domain docs: `CONTEXT.md`, `UBIQUITOUS_LANGUAGE.md`, `docs/architecture/MODULE_CONVENTIONS.md`
