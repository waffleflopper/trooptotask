# Onboarding System Rebuild PRD

## Problem Statement

The current onboarding system was built without a clear architecture and has become a maintenance burden. It bypasses the ports & adapters architecture with a hand-written `onboardingRepository.ts` that calls Supabase directly, has 6 separate API route files with raw Supabase queries instead of use cases, and stores step progress in a way that makes template changes painful. The system also loads all training data for the entire org just to check whether a few soldiers have specific trainings — wasteful and unscalable.

The rebuild replaces this with a clean, ports & adapters-aligned onboarding system built from first principles: template-based checklists with snapshotted instances, three distinct step types with appropriate completion semantics, and proper separation of configuration (templates) from operations (active onboardings).

## Solution

Rebuild onboarding as a template-to-instance system following the snapshot pattern used by every major workflow/checklist platform:

1. **Templates** are blueprints — an admin creates a checklist template with ordered steps of three types: checkbox, paperwork (multi-stage linear workflow), and training (linked to an existing training type).
2. **Instances** are snapshots — when a leader starts onboarding a soldier, the template's steps are stamped into the instance as independent copies. The instance then lives on its own.
3. **Resync** is the controlled update path — if a template changes, a privileged user can explicitly pull those changes into an active onboarding with a simple diff (deactivate removed steps, add new steps, update changed metadata).
4. **Training steps derive completion** from the training records system — no duplication of write paths, single source of truth.
5. **All server-side logic flows through ports & adapters** — use cases depend on `DataStore`, `AuthContext`, `AuditPort`, and `ReadOnlyGuard` interfaces. The hand-written repository is eliminated.

## User Stories

1. As an admin, I want to create onboarding templates with a name and description, so that I can define reusable onboarding checklists for my organization.
2. As an admin, I want to add checkbox steps to a template (e.g., "has a military email"), so that I can include simple yes/no items in the onboarding checklist.
3. As an admin, I want to add paperwork steps with named stages (e.g., "with soldier" -> "received by manager" -> "submitted" -> "access granted"), so that I can track multi-step approval workflows.
4. As an admin, I want to add training steps linked to a training type (e.g., CPR certification), so that onboarding can track required trainings.
5. As an admin, I want to reorder, edit, and delete template steps, so that I can maintain templates as requirements change.
6. As an admin, I want to delete a template even if active onboardings reference it, so that I'm not blocked by in-flight onboardings (their snapshotted steps continue unaffected).
7. As a leader, I want to start an onboarding by selecting a soldier and a template, so that the soldier gets a checklist stamped from that template.
8. As a leader, I want soldiers with active onboardings excluded from the "start onboarding" selection list, so that I can't accidentally create duplicate onboardings.
9. As a leader, I want to check off checkbox steps on a soldier's onboarding, so that I can track simple task completion.
10. As a leader, I want to advance or regress a paperwork step through its stages, so that I can track where paperwork is in an approval chain (including sending things back for correction).
11. As a leader, I want a paperwork step to automatically be marked complete when it reaches the final stage, so that I don't have to manually check it off after the workflow finishes.
12. As a leader, I want training steps to automatically reflect whether the soldier has a valid training record, so that I don't have to manually track what the training system already knows.
13. As a leader, I want a link/button on incomplete training steps that takes me to record the training, so that I have a fast path to fix an incomplete item.
14. As a leader, I want to add timestamped notes to any step, so that I can track communications, corrections, and context (e.g., "emailed soldier to fix form on 3/15").
15. As a leader, I want to see who wrote each note, so that I know who communicated what when multiple leaders share onboarding duties.
16. As a leader, I want to cancel an onboarding, so that I can stop tracking a soldier who is no longer being onboarded.
17. As a leader, I want to reopen a cancelled onboarding with all steps and notes preserved, so that I can resume if a soldier returns (e.g., from leave).
18. As a leader, I want to explicitly mark an onboarding as complete, with a soft warning if steps are still incomplete, so that I have a deliberate sign-off moment.
19. As a privileged user, I want to resync an active onboarding against its template, so that template changes propagate in a controlled way — with removed steps deactivated, new steps added, and changed metadata updated.
20. As a privileged user, I want to switch which template an active onboarding follows (effectively a resync against a different template), so that I can correct a template assignment mistake.
21. As a leader, I want to see a list of all active onboardings with progress indicators (e.g., "8/12 steps"), so that I can quickly assess who needs attention.
22. As a leader, I want to click into a soldier's onboarding to see a flat, ordered checklist with all step types, completed steps visually muted, so that I can focus on what's outstanding.
23. As a leader, I want to access onboarding history (completed and cancelled onboardings) from the page toolbar, so that I can review past onboardings as read-only records.
24. As a leader, I want to see an onboarding indicator on the calendar (dot + shaded row) for soldiers who are actively onboarding, so that I have at-a-glance awareness during daily planning.
25. As a group-scoped member, I want to only see onboardings for soldiers in my group, so that I'm focused on my team.
26. As an admin, I want completed and cancelled onboardings automatically deleted based on the organization's archive retention setting, so that old records don't accumulate indefinitely.

## Implementation Decisions

### Architecture

- Onboarding is a feature module at `src/features/onboarding/` with its own components, stores, types, and utils.
- Two routes: `/onboarding` (operational — list and detail views) and `/onboarding/templates` (configuration — template management).
- Template management route is accessible via a conditional button in the PageToolbar, visible only to full-editor/admin/owner.
- All server-side logic goes through the ports & adapters architecture. The existing `onboardingRepository.ts` is eliminated. No direct Supabase calls in use cases or API handlers.
- API routes use the `apiRoute` wrapper with proper permission, audit, validation, and read-only configuration.

### Use Cases

Four use case modules in `src/lib/server/core/useCases/`:

1. **`onboardingTemplateCrud.ts`** — Template and template step CRUD using `createCrudUseCases()`. Permission: full-editor required. Includes `afterDelete` hook on templates to null out `template_id` on referencing onboardings.

2. **`onboardingLifecycle.ts`** — Start, cancel, reopen, complete.
   - `startOnboarding(ctx, { personnelId, templateId })` — Enforces one-active-per-soldier. Snapshots template steps into step progress rows. Sets paperwork steps to first stage. Training steps get `completed` set by checking for existing training records.
   - `cancelOnboarding(ctx, id)` — Sets status to `cancelled`, records `cancelled_at`.
   - `reopenOnboarding(ctx, id)` — Sets status back to `in_progress`, clears `cancelled_at`. Only works on cancelled onboardings.
   - `completeOnboarding(ctx, id)` — Sets status to `completed`, records `completed_at`. Returns incomplete step count for soft warning (caller decides whether to proceed).

3. **`onboardingStepProgress.ts`** — Step-level mutations.
   - `toggleCheckbox(ctx, stepId, completed)` — Only for checkbox type steps. Sets `completed` boolean.
   - `advanceStage(ctx, stepId, stageName)` — Sets `currentStage` on a paperwork step. Server computes and sets `completed = true` if stage is the last in the array.
   - `addNote(ctx, stepId, { text, userId })` — Appends to the notes JSON array with server-generated timestamp.
   - `removeInactiveStep(ctx, stepId)` — Removes a deactivated legacy step. Only works on steps where `active = false`.

4. **`onboardingResync.ts`** — Template sync logic. Permission: full-editor required.
   - `resyncOnboarding(ctx, onboardingId)` — Reads the onboarding's `template_id`, fetches current template steps, performs simple diff:
     - Steps in instance but not in template (by `template_step_id`) -> set `active = false`
     - Steps in template but not in instance -> insert as new step progress rows
     - Steps in both -> update `step_name`, `description`, `step_type`, `training_type_id`, `stages`, `sort_order` while preserving `completed`, `current_stage`, `notes`
   - `switchTemplate(ctx, onboardingId, newTemplateId)` — Updates `template_id` on the onboarding, then runs the same diff logic against the new template.

### Entity Definitions

In `src/lib/server/entities/`:

- **`onboardingTemplate.ts`** — Table: `onboarding_templates`. Fields: id, orgId, name, description, createdAt. Group scope: none.
- **`onboardingTemplateStep.ts`** — Table: `onboarding_template_steps`. Fields: id, templateId, name, description, stepType (checkbox|paperwork|training), trainingTypeId, stages, sortOrder. Group scope: none.
- **`personnelOnboarding.ts`** — Table: `personnel_onboardings`. Fields: id, personnelId, templateId, status (in_progress|completed|cancelled), startedAt, completedAt, cancelledAt. Group scope: via personnel_id. Custom select with nested `onboarding_step_progress(*)` join and custom transform (same pattern as current, but cleaner).
- **`onboardingStepProgress.ts`** (new standalone entity) — Table: `onboarding_step_progress`. Fields: id, onboardingId, templateStepId, stepName, stepType, trainingTypeId, stages, sortOrder, completed, currentStage, notes (jsonb), active. Group scope: none (accessed through parent onboarding).

### Schema Changes — `personnel_onboardings` (modify)

- Add `cancelled_at` (timestamptz, nullable) — retention cron uses this or `completed_at` depending on status.
- Keep: `id`, `organization_id`, `personnel_id`, `template_id`, `status`, `started_at`, `completed_at`, `created_at`.
- Add unique partial index: `CREATE UNIQUE INDEX idx_one_active_onboarding ON personnel_onboardings (personnel_id) WHERE status = 'in_progress'` — database-enforced one-active-per-soldier constraint.
- Change `template_id` FK to `ON DELETE SET NULL` — template deletion nulls the reference, snapshotted steps continue.

### Schema Changes — `onboarding_step_progress` (modify)

- Add `active` (boolean, default true) — inactive steps are legacy items from resync that no longer count toward completion.
- Keep: `id`, `onboarding_id`, `template_step_id`, `step_name`, `step_type`, `training_type_id`, `stages`, `sort_order`, `completed`, `current_stage`, `notes`.
- `completed` remains on all step types. For checkbox steps it's set by user action. For paperwork and training steps it's set by the server (materialized derivation). This allows simple completion queries without type-aware branching.
- `notes` column is jsonb, stores array of `{ text: string, timestamp: string, userId: string }`.

### Completion Semantics

- **Checkbox:** `completed` set directly by user toggle.
- **Paperwork:** `completed` set by server when `currentStage === stages[stages.length - 1]`. Regressing the stage sets `completed = false`.
- **Training:** `completed` set by server based on whether a valid training record exists for the soldier + training type. Recomputed when the onboarding detail is loaded and when training steps are part of a resync. The query is targeted: only fetch training records for that soldier's specific training type IDs, not bulk org data.
- **Onboarding complete check:** `SELECT count(*) FROM onboarding_step_progress WHERE onboarding_id = $1 AND active = true AND completed = false`. Type-agnostic.

### Training Step Integration

- Training steps are read-only on the onboarding page. The user cannot toggle them.
- Completion is derived from the training records system. When loading an onboarding detail, the server queries `personnel_trainings` for the specific soldier and specific training type IDs referenced by their onboarding steps. Not a bulk load.
- The `completed` field on training step progress rows is updated server-side whenever the onboarding detail is fetched (or on resync). This is a read-through cache pattern — the materialized `completed` value is refreshed on access.
- Each training step displays a link/button to navigate to the training feature to record the training if incomplete.

### Resync Behavior

- Resync is an explicit user action, not automatic. Available only to full-editor/admin/owner.
- Uses simple diff by `template_step_id`:
  - **Removed from template:** Step progress row set to `active = false`. Retains all progress and notes. Does not count toward completion. User can manually remove it.
  - **Added to template:** New step progress row inserted with `active = true`, `completed = false`, paperwork starts at first stage. Inserted at template's sort order position.
  - **Modified in template:** Step metadata updated (name, description, stages, sort order, training type). Progress preserved. If paperwork stages changed and `currentStage` no longer exists in the new stages array, `currentStage` resets to `stages[0]` and `completed` resets to `false`.
- If `template_id` is null (template was deleted), resync is unavailable. UI hides the resync button.

### Permissions

| Action | Required Permission |
|---|---|
| View onboarding list & detail | `canViewOnboarding` (group-scoped) |
| Start/cancel/reopen/complete onboarding | `canEditOnboarding` (group-scoped) |
| Toggle checkbox, advance paperwork stage, add notes | `canEditOnboarding` (group-scoped) |
| Template CRUD (create, edit, delete templates & steps) | Full-editor / admin / owner |
| Resync onboarding against template | Full-editor / admin / owner |
| Switch onboarding template | Full-editor / admin / owner |
| Remove inactive (legacy) steps | `canEditOnboarding` (group-scoped) |

Group scoping: members with `scoped_group_id` only see onboardings for personnel in their group. Enforced at query level (filter by personnel IDs in group) and mutation level (`requireGroupAccess` on the personnel ID).

### API Routes

Consolidated from 6 files to a clean set using `apiRoute` wrapper:

- **`/api/onboarding-templates`** — POST/PUT/DELETE for templates. Uses `createCrudUseCases`. Full-editor required.
- **`/api/onboarding-template-steps`** — POST/PUT/DELETE for template steps. Uses `createCrudUseCases`. Full-editor required.
- **`/api/onboarding`** — POST (start), PUT (cancel/reopen/complete). Uses `onboardingLifecycle` use case. Edit onboarding permission, group-scoped.
- **`/api/onboarding-steps`** — PUT (toggle checkbox, advance stage, add note), DELETE (remove inactive step). Uses `onboardingStepProgress` use case. Edit onboarding permission, group-scoped.
- **`/api/onboarding-resync`** — POST (resync or switch template). Uses `onboardingResync` use case. Full-editor required.

All routes enforce: permission checks, read-only guard, input validation via Zod, audit logging, rate limiting.

### Data Loading

- **Onboarding list page** (`/onboarding/+layout.server.ts`): Loads all active onboarding instances for the org (group-scoped) with step progress joined. Also loads templates list (for the start onboarding modal).
- **Onboarding detail**: Loaded as part of the list data (onboarding with nested steps). Training step completion is recomputed on load by querying only the relevant training records for that soldier.
- **History page**: Loads completed/cancelled onboardings. Could be paginated if volume warrants it (likely not at current scale).
- **Template management page** (`/onboarding/templates/+page.server.ts`): Loads all templates and all template steps for the org.
- **Calendar integration**: The calendar layout load adds a lightweight query: `SELECT DISTINCT personnel_id FROM personnel_onboardings WHERE organization_id = $1 AND status = 'in_progress'`. Returns a `Set<string>` of personnel IDs with active onboardings. Calendar uses this to render indicator dot and row tint using existing `--color-onboarding-tint` and `--color-primary` design tokens.

### UI Structure

**Main onboarding page** (`/onboarding`):
- List of active onboardings showing: soldier name/rank, template name, progress (e.g., "8/12"), started date.
- PageToolbar with: "Start Onboarding" button, "History" link, conditional "Manage Templates" link (full-editor+ only).
- Start Onboarding modal: select soldier (filtered to exclude those with active onboardings), select template, confirm.
- Empty state when no active onboardings.

**Detail view** (click into a soldier's onboarding):
- Header: soldier name/rank, template name (or "template deleted"), started date, status.
- Flat ordered checklist of steps. Each step shows:
  - **Checkbox:** Toggle control + step name + description.
  - **Paperwork:** Stepper primitive showing stages, clickable to advance/regress + step name.
  - **Training:** Read-only completion indicator + step name + link to record training if incomplete.
  - All types: expandable notes section, "Add Note" input.
- Completed steps are visually muted but not hidden or moved.
- Inactive (legacy) steps shown in a distinct muted/collapsed state with option to remove.
- Action buttons: Cancel / Complete (with soft warning) / Resync (full-editor+ only, hidden if no template).

**History view** (from toolbar link):
- List of completed/cancelled onboardings across all soldiers.
- Shows: soldier name/rank, template name, status, started/completed/cancelled dates.
- Clickable into read-only detail view (same layout as active detail, but no interactive controls).

**Template management page** (`/onboarding/templates`):
- Template list/selector.
- Step editor for the selected template: add/edit/remove/reorder steps.
- Step type picker (checkbox, paperwork, training).
- Paperwork steps: editable stages list.
- Training steps: training type selector (from org's existing training types).

### Shared UI Primitives

Two new shared components in `src/lib/components/ui/`:

1. **`Stepper.svelte`** — Linear stage indicator for multi-step workflows. Props: `stages: string[]`, `currentStage: string`, `onStageClick?: (stage: string) => void`, `disabled?: boolean`. Shows stages in order with current stage highlighted. Clickable when not disabled (for advancing/regressing). Reusable for duty roster or any future multi-stage workflow.

2. **`InlineNotes.svelte`** — Collapsible timestamped comment thread. Props: `notes: Array<{ text: string, timestamp: string, userId: string }>`, `onAddNote?: (text: string) => void`, `resolveAuthor: (userId: string) => string`, `disabled?: boolean`. Shows note list with author names and timestamps, plus an input to add new notes. Reusable for any feature needing per-item commentary.

Both components use existing design system CSS variables. No hardcoded values.

### Calendar Integration

- The calendar page receives a `Set<string>` of personnel IDs with active onboardings from layout data.
- For soldiers in that set: render a small dot indicator by their name using `--color-primary`, and shade their row using `--color-onboarding-tint` (already exists in the design system).
- Read-only — the calendar does not modify onboarding data.

### Retention / Cleanup

- Completed and cancelled onboardings are auto-deleted by the existing Vercel cron job pattern (same as archived personnel cleanup).
- Retention clock starts from `completed_at` (for completed) or `cancelled_at` (for cancelled).
- Uses the org's `archive_retention_months` setting.
- Deletion cascades to step progress rows.
- Notifies admins when records are cleaned up (same notification pattern as archived personnel cleanup).

## Testing Decisions

Good tests verify external behavior (API contracts, rendered output, navigation) rather than implementation details.

### Server-side tests (unit/integration)

- **Use case tests** (using in-memory DataStore adapter):
  - `onboardingLifecycle`: Start enforces one-active-per-soldier, snapshots template steps correctly, cancel/reopen/complete status transitions, complete returns incomplete count.
  - `onboardingStepProgress`: Checkbox toggle, paperwork stage advance/regress with auto-completion, note addition with timestamp/userId, inactive step removal.
  - `onboardingResync`: Simple diff — deactivate removed steps, add new steps, update metadata, handle stage reset when currentStage no longer exists, block resync when template_id is null.
  - `onboardingTemplateCrud`: Standard CRUD, template deletion nulls onboarding references.
  - Permission enforcement: group scoping, full-editor requirement for templates/resync, read-only guard.
- **Training step completion derivation**: Verify that training step `completed` is correctly set based on training record existence.
- **Data loading**: Verify targeted training record query (only relevant soldier + training type IDs, not bulk org data).

### E2E tests

- **Template management flow**: Create template, add steps of each type, reorder, edit, delete step, delete template.
- **Onboarding lifecycle flow**: Start onboarding (select soldier + template), verify steps appear, check off a checkbox, advance a paperwork stage, complete onboarding, verify it moves to history.
- **Cancel and reopen flow**: Cancel active onboarding, verify it disappears from active list, reopen, verify progress preserved.
- **Permission flow**: Non-privileged user cannot see template management link, cannot resync. Group-scoped user only sees their group's onboardings.
- **Calendar integration**: Verify onboarding indicator appears for actively onboarding soldiers.
- **Prior art**: Patterns from existing E2E specs in `e2e/specs/`.

## Out of Scope

- **Bulk start/bulk operations**: Not needed at current scale. Can be added later if it becomes a pain point.
- **Automatic template propagation**: Templates do not auto-push changes to active onboardings. Resync is always explicit.
- **Template versioning**: No version history for templates. If you need to know what a template looked like when an onboarding started, the snapshotted steps on the instance are that record.
- **Onboarding assignment to specific leaders**: Onboardings are org/group-scoped, not assigned to a specific leader.
- **Notifications for onboarding events**: No automated notifications when steps are completed or onboardings finish. Could be added later.
- **Print/export of onboarding records**: May be added later but not part of this rebuild.
- **Training record creation from onboarding page**: Training steps are read-only on onboarding. Users navigate to the training feature to record trainings. No dual write path.

## Further Notes

- The existing `onboardingRepository.ts` and its tests are deleted as part of this rebuild. All data access goes through the `DataStore` port.
- The existing 6 API route files under `src/routes/org/[orgId]/api/onboarding*` are replaced by the consolidated set described above.
- The `PersonnelOnboardingEntity` custom transform pattern (joining `onboarding_step_progress` via nested select) is retained since it works through the entity system and the DataStore port's `select` parameter already supports Supabase's nested select syntax.
- The `onboardingLayoutServer.ts` file is eliminated — data loading moves to standard `+layout.server.ts` / `+page.server.ts` files.
- All new API routes must use the `apiRoute` wrapper with proper permission, audit, and validation configuration per existing conventions.
- Migration must handle existing production data: add new columns with defaults, create partial unique index, alter FK constraint. No destructive changes to existing rows.
- Demo/sandbox data should be updated to showcase the rebuilt system with realistic templates and onboarding instances.
