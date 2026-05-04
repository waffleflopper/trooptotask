# Advanced Duty Run Revision And Module Deepening RFC

## Purpose

Deepen the **Advanced Duty Run** module so preview, apply, post-apply edits, reapply, export, recovery, and revision history align around stable product concepts instead of route/use-case orchestration.

Published parent issue: [#776](https://github.com/waffleflopper/trooptotask/issues/776).

The first Advanced Duty Run RFC established **Snapshot Custody** and the first apply path. This follow-on RFC covers the remaining architecture gap: after an **Advanced Run Snapshot** is applied, edits still risk becoming direct event mutations instead of reviewed, explainable run revisions.

The goal is not a helper-function shuffle. The goal is a deeper module with a smaller interface:

- first preview and first apply go through the **Advanced Run Snapshot**
- post-apply edits go through one active **Advanced Duty Revision Draft**
- reapply persists compact **Advanced Duty Revision Change Sets**
- `dutyEventCrud.ts` becomes persistence and request-facing orchestration, not the long-term owner of Advanced Duty Run product behavior

## Current State

- `src/features/duty-roster/advanced-run/advancedDutyRun.ts` owns a large part of advanced generation: slot proposals, fairness, availability classification, conflict summaries, DA6 matrix support, and **Team Duty Packet Export Model** construction.
- `src/lib/server/core/useCases/advancedDutyRunSnapshotCustody.ts` owns persisted draft snapshot lifecycle for preview/apply.
- `src/lib/server/core/useCases/dutyEventCrud.ts` still owns too much of the workflow: preview shaping, apply orchestration, snapshot state transitions, collision review, persistence, rollback, run reconciliation, deletion, and existing-event update behavior.
- `previewDutyEventFromTemplate` and `previewDutyEventSeriesFromTemplate` now create draft **Advanced Run Snapshots**.
- `applyDutyEventFromTemplate` and `applyDutyEventSeriesFromTemplate` now consume approved snapshots.
- `updateExistingDutyEvent` still behaves like a direct post-apply event update path and does not yet use an **Advanced Duty Revision Draft** or **Advanced Duty Revision Change Set**.

## Target Product Rules

### First Preview And First Apply

- Before first apply, preview edits belong to the **Advanced Run Snapshot** review flow.
- Applying an **Advanced Run Snapshot** requires snapshot identity plus a fingerprint of the reviewed preview.
- First apply must persist the reviewed snapshot result, not regenerate assignment choices from current template/personnel/status data.

### Post-Apply Edits

- After apply, edits create or reopen one active **Advanced Duty Revision Draft** for the applied **Advanced Duty Run**.
- One applied **Advanced Duty Run** may have only one active **Advanced Duty Revision Draft** at a time.
- A draft may include changes across multiple event dates in the same run.
- Starting edits on a run that already has an active draft should reopen that draft instead of creating a parallel draft.
- Discarding a draft leaves the applied operational records unchanged.

### Reapply

- Reapply validates current safety, permissions, read-only state, and conflicts.
- Reapply must not re-run the assignment algorithm or silently choose different Soldiers.
- Hard conflicts block reapply.
- Reviewable conflicts may be confirmed only with an explicit reason.
- Reapply stores compact **Advanced Duty Revision Change Sets**, not full copies of the entire **Advanced Run Snapshot** for every dropdown change.
- **Advanced Duty Revision Change Sets** should be visible in the **Advanced Duty Workspace** as a simple revision history with date, actor, reason, and changed slots.

### Conflict Split

Hard conflicts:

- selected Soldier no longer exists in the **Organization**
- selected Soldier is archived
- selected Soldier no longer satisfies a non-waivable slot eligibility rule
- event, run, or source snapshot was deleted or already superseded
- **Organization** is in **Read-Only Mode**
- actor no longer has permission

Reviewable conflicts:

- overlapping advanced duty
- cooldown conflict
- **Availability Status** that marks the Soldier unavailable
- replacement of a previously applied slot assignment
- soft-preference or fairness warning

## Interface Options

### Option A: Keep Direct Event Updates

`updateExistingDutyEvent` continues to rebuild a preview from current data and immediately mutate `duty_events` / `duty_event_slots`.

Rejected. This is the shallow interface that caused the current concern. It lets post-apply edits drift away from **Snapshot Custody**, makes revisions hard to explain, and keeps product rules spread through `dutyEventCrud.ts`.

### Option B: Store Full Revision Snapshots

Every dropdown change stores a full copy of the full **Advanced Run Snapshot**.

Rejected. This preserves too much data for too little meaning. A large run could create many near-identical snapshot copies while the real product fact is only "this slot changed from Soldier A to Soldier B for this reason."

### Option C: Advanced Duty Revision Module

Create a deeper revision path behind the Advanced Duty Run module:

- build or reopen the single active **Advanced Duty Revision Draft** for a run
- update draft slot choices without mutating operational records
- validate draft reapply against current safety facts without regenerating assignment choices
- derive compact **Advanced Duty Revision Change Sets**
- apply the reviewed change set to operational `duty_events` / `duty_event_slots`
- expose revision history for the **Advanced Duty Workspace**

Recommended. This keeps the interface product-shaped and small: draft, review, reapply, discard, history. The implementation can still use internal seams for persistence, safety validation, and event updates.

### Option D: Generic Audit Log Only

Keep direct event updates but rely on generic audit log entries to explain changes.

Rejected. Generic audit logs are useful but too shallow as the primary product model. They do not give the **Advanced Duty Workspace** a clean revision history, and they do not prevent direct mutation from becoming the default post-apply workflow.

## Proposed Module Shape

Feature-owned module area:

- `src/features/duty-roster/advanced-run/advancedDutyRun.ts`
- `src/features/duty-roster/advanced-run/advancedDutyRevision.ts`
- `src/features/duty-roster/advanced-run/advancedDutyRevision.types.ts`
- `src/features/duty-roster/advanced-run/advancedDutyRevision.test.ts`

Server use-case integration:

- `src/lib/server/core/useCases/dutyEventCrud.ts`
- `src/lib/server/core/useCases/advancedDutyRevisionDrafts.ts`
- `src/lib/server/entities/*` for new storage rows if needed
- `src/lib/server/adapters/advancedDutyPersistence.ts`

Route/UI integration:

- `src/routes/org/[orgId]/api/duty-events/**`
- `src/features/duty-roster/components/**`

The Advanced Duty Run module should own:

- reviewed snapshot interpretation
- revision draft semantics
- compact change-set construction
- conflict classification for hard versus reviewable conflicts
- revision-history display model
- formatting-neutral revision/export data

The server use cases should own:

- authorization and **Read-Only Mode** checks
- loading current applied run/event/slot records
- loading current safety facts needed for reapply validation
- persistence through ports/adapters
- rollback or recovery behavior
- audit and notifications where applicable

The Svelte UI should own:

- displaying active draft state
- slot editing controls
- required reason capture
- conflict confirmation
- discard/reapply actions
- revision history rendering

## Vertical Slice Breakdown

### Slice 1: Record The Revision Contract

Type: AFK

Blocked by: None

What to build:

Turn this RFC into the source of truth for **Advanced Duty Revision Draft** and **Advanced Duty Revision Change Set** behavior.

Acceptance criteria:

- `CONTEXT.md` and `UBIQUITOUS_LANGUAGE.md` contain the revision terms and relationships.
- `docs/architecture/MODULE_CONVENTIONS.md` describes the target Advanced Duty Run / revision module boundary.
- Existing Advanced Duty Run RFC links to this follow-on RFC.
- No product runtime behavior changes in this slice.

### Slice 2: Design Revision Storage And Migration

Type: AFK after storage decisions are approved

Blocked by: Slice 1

What to build:

Define storage for one active **Advanced Duty Revision Draft** per applied run and append-only **Advanced Duty Revision Change Sets** without storing full snapshot copies for each edit.

Storage decision:

- An active **Advanced Duty Revision Draft** should store editable draft slot changes as compact working-state JSON on the draft row.
- Applied **Advanced Duty Revision Change Sets** should be stored as normalized append-only child rows so revision history is queryable, auditable, and display-ready without exposing raw full snapshot payloads.
- An active **Advanced Duty Revision Draft** belongs to the applied **Advanced Duty Run**, keyed by `duty_event_runs.id`, rather than to a single `duty_events.id`. Individual draft slot changes may still reference the affected event/date/slot inside that run.
- One active **Advanced Duty Revision Draft** per applied run should be enforced with a partial unique database index on `(organization_id, applied_run_id)` where `status = 'draft'`. App/use-case behavior should reopen the existing active draft instead of creating a parallel draft, while the database remains the concurrency backstop.
- **Advanced Duty Revision Draft** status should stay limited to `draft`, `applied`, and `discarded`. Failed validation or failed reapply attempts should leave the draft in `draft` status and store latest error/validation metadata separately, so the operator can keep correcting the same draft.
- Discarding an **Advanced Duty Revision Draft** should preserve the draft row with `status = 'discarded'` instead of deleting it immediately, but discarded draft rows should have an explicit finite cleanup window so abandoned working state does not live forever.
- Discarded **Advanced Duty Revision Draft** rows should be retained for 30 days, then become eligible for cleanup. Official applied revision history should live in normalized **Advanced Duty Revision Change Set** rows rather than in retained discarded drafts.
- **Advanced Duty Revision Draft** reads and writes should be restricted to actors with access to the advanced-duty roster functionality. They should not inherit broad Calendar view access, because draft rows may expose proposed replacements, conflict state, and abandoned correction intent.
- Applied **Advanced Duty Revision Change Set** history should be viewable anywhere the applied run itself is viewable, but only as compact official history: revision date, actor display, reason, and changed slots. Raw draft payloads, candidate lists, validation internals, and abandoned draft details should remain restricted to the draft workflow.
- Each applied **Advanced Duty Revision Change Set** should represent one reapply action for an applied run. A parent change-set row should record the run, source draft, actor, reason, confirmation/conflict summary, and applied timestamp; child slot-change rows should record the individual event/date/slot deltas.
- Slot-change rows should store stable previous/new Soldier ids when present plus compact previous/new Soldier display snapshots such as rank, first name, last name, and any existing applied-roster group label needed for history display. The ids preserve relational lookup; the display snapshots keep old revision history readable after later personnel changes.
- Every reapply action should require one human reason on the parent **Advanced Duty Revision Change Set**. Individual slot-change rows may store warning/conflict metadata, but the parent reason is the official explanation for approving the revision.
- Reapply should block hard conflicts entirely and allow reviewable conflicts only with explicit confirmation. The parent **Advanced Duty Revision Change Set** should record whether reviewable conflicts were confirmed and summarize the confirmed conflict/warning state.
- Draft `slot_changes` should store only the latest desired state per event/date/slot, not every intermediate dropdown edit. Intermediate draft edits are working state; the durable audit record is created only when the draft is reapplied into an **Advanced Duty Revision Change Set**.
- Clear slot, manual assignment, locked assignment, and locked-open intent should be explicit slot-change states in draft `slot_changes` and normalized child slot-change rows. The model should not infer operator intent only from `new_personnel_id = null`.
- A draft should store source pointers such as the applied run id, source snapshot id, source snapshot fingerprint, and source run/update timestamps when available. It should not copy the full **Advanced Run Snapshot** into the draft; the draft should point back to the source and store only the current desired slot changes.
- Reapply should stop if the applied run has changed since the draft was opened. The draft should store the source run/update timestamp it was opened from, and reapply should require the operator to reopen or review the draft if the current applied run no longer matches that source.
- Active drafts should expire after 7 days of inactivity. After expiration, the operator should reopen or review the draft against the current applied run before changes can be reapplied.
- The storage/migration slice should create the revision draft, change-set, and slot-change tables, indexes, RLS rules, and entity/schema tests without wiring route or UI behavior to the new tables yet.
- After the storage shape is settled, follow-on issues should be updated with the chosen table/field structure so later agents build against the approved contract instead of guessing.
- Table names should be `advanced_duty_revision_drafts`, `advanced_duty_revision_change_sets`, and `advanced_duty_revision_slot_changes`.
- `advanced_duty_revision_drafts` should include a `draft_version` number that increments on each save so the app can detect when another tab or user has changed the draft before overwriting it.
- The migration should include database checks for key JSON fields, such as requiring draft `slot_changes` to be an array and validation/conflict summary fields to be objects or `null`.
- The storage/migration slice should include TypeScript entity/schema definitions and focused tests for revision draft rows, change-set parent rows, and change-set slot rows. Later slices should consume those definitions instead of inventing ad hoc row shapes.

Acceptance criteria:

- Storage shape records draft identity, run id, source snapshot/run facts, draft slot changes, reason state, actor, timestamps, and status.
- Storage shape records applied change sets compactly: event date, slot key, previous Soldier, new Soldier, cleared/locked/manual state, reason, actor, timestamp, and relevant warning/conflict metadata.
- Database migration is drafted but not run remotely.
- RLS follows the existing advanced-duty management posture and does not expose draft candidate details more broadly than intended.
- One-active-draft-per-run uniqueness is enforced by storage or a transactional adapter.

### Slice 3: Add The Advanced Duty Revision Module Core

Type: AFK

Blocked by: Slice 2

What to build:

Add a feature-owned module that can build/reopen a draft from an applied **Advanced Duty Run**, update draft slot changes, derive compact change sets, and classify hard versus reviewable conflicts from already-loaded facts.

Acceptance criteria:

- Module interface covers draft creation/reopen, draft update, discard, reapply validation, change-set derivation, and revision-history display model.
- The module does not query Supabase or mutate operational records directly.
- Tests cover one active draft, multi-date run changes, compact change-set output, no full-snapshot duplication, hard conflicts, reviewable conflicts, and required reason handling.
- Existing first-preview / first-apply snapshot tests remain unchanged.

### Slice 4: Persist Revision Drafts Behind An Adapter

Type: AFK

Blocked by: Slices 2-3

What to build:

Wire revision draft and change-set storage behind app-owned use cases and the advanced-duty persistence adapter.

Acceptance criteria:

- Use cases can create/reopen, update, discard, list, and read one active draft for a run.
- Persistence enforces one active draft per applied run.
- In-memory adapter supports focused tests.
- Supabase adapter uses the approved storage shape.
- No route or Svelte component writes revision rows directly.

### Slice 5: Replace Direct Post-Apply Event Edits With Draft Review

Type: AFK

Blocked by: Slices 3-4

What to build:

Change the post-apply edit path so editing an applied advanced duty event creates or reopens an **Advanced Duty Revision Draft** instead of immediately mutating `duty_events` / `duty_event_slots`.

Acceptance criteria:

- Existing applied event editing UI opens an active draft when present.
- Dropdown changes update the draft only.
- Discard removes the active draft and leaves applied operational records unchanged.
- The UI makes pending draft state obvious.
- Tests prove starting edits twice reopens the same draft.

### Slice 6: Implement Reapply With Live Safety Validation

Type: AFK

Blocked by: Slice 5

What to build:

Reapply a reviewed **Advanced Duty Revision Draft** into operational records while validating current safety and writing compact **Advanced Duty Revision Change Sets**.

Acceptance criteria:

- Reapply checks permission and **Read-Only Mode**.
- Reapply blocks hard conflicts.
- Reapply allows reviewable conflicts only with explicit confirmation and a required reason.
- Reapply does not re-run the assignment algorithm or silently choose different Soldiers.
- Reapply persists only the changed operational slots/events and a compact change set.
- Tests prove roster/template/status changes after draft creation do not silently regenerate assignments.

### Slice 7: Add Revision History To The Advanced Duty Workspace

Type: AFK

Blocked by: Slice 6

What to build:

Show **Advanced Duty Revision Change Sets** in the **Advanced Duty Workspace** as simple revision history.

Acceptance criteria:

- Applied run inspection shows revision date, actor, reason, and changed slots.
- History distinguishes generated original proposal, current applied state, and manual revision changes.
- History does not expose raw full snapshot payloads.
- Empty state is clear when no revisions exist.
- UI tests cover revision history rendering and pending draft visibility.

### Slice 8: Thin `dutyEventCrud.ts` Around The New Module Interface

Type: AFK

Blocked by: Slices 3-7

What to build:

Move remaining Advanced Duty Run product rules out of `dutyEventCrud.ts` where they now belong to the deeper module.

Acceptance criteria:

- `dutyEventCrud.ts` primarily loads authorized data, calls the Advanced Duty Run / revision modules, persists through adapters, and returns route-facing payloads.
- Preview, apply, reapply, export, and revision-history behavior remain covered through module-level and use-case tests.
- No browser adapter rebuilds generation, conflict, warning, revision, or export decisions.
- Architecture docs list the new module boundary and any remaining tolerated exceptions.

## Proposed Issue Queue

1. [#777](https://github.com/waffleflopper/trooptotask/issues/777) AFK: Record the revision contract.
2. [#778](https://github.com/waffleflopper/trooptotask/issues/778) AFK after storage decisions: Design revision storage and migration.
3. [#779](https://github.com/waffleflopper/trooptotask/issues/779) AFK: Add the Advanced Duty Revision module core.
4. [#780](https://github.com/waffleflopper/trooptotask/issues/780) AFK: Persist revision drafts behind an adapter.
5. [#781](https://github.com/waffleflopper/trooptotask/issues/781) AFK: Replace direct post-apply event edits with draft review.
6. [#782](https://github.com/waffleflopper/trooptotask/issues/782) AFK: Implement reapply with live safety validation.
7. [#783](https://github.com/waffleflopper/trooptotask/issues/783) AFK: Add revision history to the Advanced Duty Workspace.
8. [#784](https://github.com/waffleflopper/trooptotask/issues/784) AFK: Thin `dutyEventCrud.ts` around the new module interface.

## Verification Expectations

Every implementation slice should run:

- `npm run format`
- `npm run lint`
- `npm run governance:check`
- `npm run check`
- `npm run test`

For doc-only slices, `git diff --check` is acceptable during drafting, but published implementation work should use the full repo gate stack.

## Stop Conditions

Stop and ask before implementing if a slice requires:

- running a migration against the remote production database
- storing full revision copies of entire **Advanced Run Snapshots** as the normal edit path
- allowing multiple active revision drafts for one applied run
- changing first-preview / first-apply **Snapshot Custody**
- re-running assignment generation during reapply
- redefining Calendar permission or **Feature Lane** ownership
- expanding deprecated demo/sandbox behavior
- redesigning the **Advanced Duty Workspace** beyond the issue scope

## Recommended Parent Issue

Title:

`RFC: Advanced Duty Run revision and module deepening`

Labels:

- `needs-triage`
- `rfc`
- `PRD-RFC`

The child issues should be created in dependency order after the slice granularity is approved, then linked as GitHub sub-issues of the parent issue.
