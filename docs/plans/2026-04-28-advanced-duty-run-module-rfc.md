# Advanced Duty Run Module RFC

> Supersession note: the replacement target is now `docs/plans/2026-05-03-duty-roster-replacement-da6-prd.md`. The new direction treats the advanced team-duty model as legacy current-state and replaces the old simple/advanced split with one DA6 Duty Roster surface. Use this RFC only as historical context unless explicitly working on legacy advanced-duty removal.

## Purpose

Carry the Duty Roster Run Module work into the advanced duty workflow.

Follow-on revision/deepening work is tracked in `docs/plans/2026-05-02-advanced-duty-run-revision-deepening-rfc.md`.

At the time of this RFC, the simple duty lane had a clearer run boundary: generation created an immutable snapshot, preview/apply/history/export used that snapshot, and the Svelte page stayed closer to UI orchestration. The advanced lane still ran through the older template/event flow. That was a bigger problem than it was in the simple generator because advanced duties were the staff duty/CQ-style workflow: templates, teams, slots, coverage windows, per-run candidates, manual overrides, collision review, and series apply all needed to stay tied to the exact generation result the operator reviewed.

This historical RFC defined a follow-up plan for an **Advanced Duty Run Module** that preserved the then-current advanced duty product model while giving it the same kind of snapshot, apply, and export discipline as the simple run module.

## Historical State At RFC Time

- Simple duty generation had `src/features/duty-roster/run/`, with `DutyRosterRun` owning run snapshots, DA6 selection and numbering semantics, snapshot-derived apply/history payloads, and a formatting-neutral export model.
- Advanced duty generation lived mostly in `src/lib/server/core/useCases/dutyEventCrud.ts`.
- `previewDutyEventFromTemplate` and `previewDutyEventSeriesFromTemplate` generate advanced event previews from the current template, personnel, status, special-day, duty-event, and override state.
- `applyDutyEventFromTemplate` and `applyDutyEventSeriesFromTemplate` rebuild previews during apply instead of consuming an immutable preview snapshot.
- Advanced event records preserve a `rulesSnapshot` and `originalProposal`, but there is no first-class advanced run snapshot that captures the whole previewed run, including date pattern, candidate filter, transient series history, slot overrides, warnings, collision state, final apply payloads, and export-ready team duty packet data.
- The removed legacy wizard stored transient wizard state and called preview/apply callbacks, while its removed helper module owned input shaping and browser-side duty packet markup.
- Advanced series preview already used transient events so later dates in the series could consider earlier previewed dates for fairness, but apply recomputed the same logic later from fresh state.

## Problem

The advanced lane is where snapshot correctness matters most.

For a simple one-person duty roster, preview/apply drift is bad. For an advanced staff duty or CQ run, it is worse: one run can include multiple dates, multiple slots per date, role eligibility, blocking/cooldown behavior, per-run candidate filtering, manual overrides, locked open slots, collision review, and replacement of existing events.

If apply rebuilds from current data instead of the previewed run snapshot, the operator can approve one team and persist a subtly different team. Even when the recomputation usually matches, the code shape makes that guarantee implicit and hard to test.

## Goals

1. Give advanced duty generation a first-class run boundary parallel to the simple Duty Roster Run Module.
2. Preserve advanced duties as team/event workflows, not DA6 clones.
3. Keep preview, manual overrides, collision review, apply, original proposal, and export tied to the exact generated run.
4. Preserve then-current advanced duty behavior unless a slice explicitly changes it.
5. Make the server use case thinner by moving stable generation rules behind a smaller module interface.
6. Keep template rules snapshotted so old duty events remain auditable after template edits.
7. Produce export-ready team duty packet data without browser markup living in wizard helpers.
8. Leave clear seams for future event-level regeneration, correction history, and sitewide export.

## Non-Goals

- Do not replace the simple Duty Roster Run Module.
- Do not force advanced duties into DA Form 6 output. Advanced duty export should be a team roster / duty packet model unless a future product decision says otherwise.
- Do not redesign the entire advanced wizard in the first slice.
- Do not add a new generic qualifications/tagging subsystem.
- Do not expand deprecated demo/sandbox duty behavior.
- Do not touch production data or run migrations remotely.

## Vocabulary

- **Advanced Duty Run**: One generated advanced duty run for a selected template and event date pattern.
- **Advanced Run Snapshot**: The immutable inputs and outputs for an advanced duty run preview.
- **Advanced Event Snapshot**: The previewed result for one event/date inside an advanced run.
- **Slot Proposal**: The generated or manually overridden assignment for one slot instance.
- **Original Proposal**: The machine-generated slot proposal before manual overrides.
- **Final Applied State**: The slot assignments persisted after operator review and overrides.
- **Team Duty Packet Export Model**: Formatting-neutral data for a staff duty/CQ-style packet or team roster.
- **Snapshot Custody**: The decision about where a preview snapshot lives between preview and apply.

## Key Product Decisions

### Advanced Runs Are Not DA6 Clones

Simple one-person rosters should keep DA6-style run behavior. Advanced duties should preserve the team-duty model from the advanced-duty PRD:

- template-defined slots and quantities
- role/rank/group/MOS/role eligibility
- rotation pools and soft preferences
- event/date grouped preview
- manual replace, clear, and lock behavior
- first-class duty events that remain editable as a team

Advanced export should be a team duty packet or roster export model, not a DA6 matrix, unless a later RFC explicitly changes that.

### Preview And Apply Must Be Snapshot-Bound

An advanced apply should persist the same event/date/slot results that the operator approved.

Changing template settings, personnel fields, status entries, special days, existing duty events, or candidate selection after preview should not silently mutate the approved run. The user should refresh/regenerate the preview if they want new source data considered.

### Snapshot Custody

Because advanced generation runs server-side, the app needs an explicit way to carry the preview snapshot into apply.

Decision: advanced preview snapshots are persisted server-side as draft **Advanced Run Snapshots** and applied by snapshot identity.

Decision record: `docs/architecture/adrs/0007-advanced-duty-snapshot-custody.md`.

Follow-on slices should implement this as:

- preview creates a draft server-side snapshot
- draft snapshots are stored in `advanced_duty_run_snapshots`
- preview returns a snapshot id and fingerprint/version metadata
- apply requires `snapshotId` and `snapshotFingerprint`
- apply verifies snapshot status, expiration, organization, actor permission, template id, date pattern, and submitted override state before persisting events
- draft snapshots expire after 24 hours
- cleanup may remove expired draft snapshots
- unapplied draft snapshots may be exported as preview-only team duty packets
- snapshots are finalized/consumed after successful apply and cannot be normally re-applied
- an unexpired draft snapshot may be retried only when apply fails before persistence begins
- partial failure recovery must be explicit and idempotent rather than a generic apply retry
- stale, missing, expired, or mismatched snapshots require the user to regenerate the preview
- signed client snapshot payloads are rejected as the primary custody model

Rationale: persisted draft snapshots avoid very large signed payloads, support multi-step review, and leave a better seam for retry, export, and reopen behavior. The tradeoff is a schema/storage cleanup slice, so implementation must not require production migration work before the migration has been reviewed by the user.

Preview exports from unapplied draft snapshots must be clearly labeled as preview/not applied output. They are review artifacts, not final applied records.

After successful apply, the snapshot becomes finalized/consumed. Normal apply cannot be repeated from the same snapshot because that could duplicate operational duty events. If apply fails before persistence begins, the same unexpired draft can be retried. If apply partially succeeds, recovery must be explicit and safe to repeat without duplicating events.

The apply contract is `snapshotId` plus `snapshotFingerprint`. The snapshot id identifies the persisted draft; the fingerprint proves the client is applying the same preview response the operator reviewed. Apply must also validate snapshot status, expiration, organization boundary, actor permission, template id, date pattern, and submitted override state. If any check fails, the user must regenerate the preview instead of applying silently changed data.

The draft storage table is `advanced_duty_run_snapshots`. It stores the snapshot lifecycle status, `snapshot_fingerprint`, `snapshot_version`, 24-hour `expires_at`, reviewed input/snapshot/preview payloads, optional export model, apply error text, and an applied run link when one exists. Draft snapshot RLS is intentionally owner/admin-only rather than Calendar-view readable because draft previews can include full candidate and override details.

### Existing Event Records Stay First-Class

The new module should not bypass `duty_events`, `duty_event_slots`, or `duty_event_runs`. Those remain the operational records. The advanced run snapshot is the generation contract that feeds those records honestly.

## Proposed Module Shape

Candidate feature-owned area:

`src/features/duty-roster/advanced-run/`

Candidate files:

- `advancedDutyRun.types.ts`
- `advancedDutyRun.ts`
- `advancedDutyRunSnapshot.ts`
- `advancedDutyRunExportModel.ts`
- `advancedDutyRun.test.ts`

Server use-case integration stays under:

- `src/lib/server/core/useCases/dutyEventCrud.ts`

The public interface should stay small:

- build an advanced run snapshot from resolved, authorized input data
- build a single-event snapshot from the same engine
- derive apply payloads from a snapshot
- derive replacement/collision review state from a snapshot
- derive original proposal and final applied slot state from a snapshot
- derive a formatting-neutral team duty packet export model from a snapshot

The server use case remains responsible for:

- authorization
- read-only guard checks
- loading templates, personnel, status entries, special days, existing duty events, and slot history
- persistence
- audit logging
- transaction/rollback behavior where available

The Svelte wizard remains responsible for:

- step state
- rendering
- candidate review controls
- manual override controls
- user feedback/progress states

## Proposed Slices

### Slice 1: Decide Advanced Snapshot Custody

Type: HITL

Blocked by: None

What to settle:

- Persisted draft advanced run snapshots are the chosen custody model.
- Draft snapshots expire after 24 hours, and cleanup may remove expired drafts.
- Apply requires `snapshotId` plus `snapshotFingerprint` validation.
- Unapplied draft snapshots may be exported as preview-only team duty packets.
- Retry is allowed only before persistence starts; successful snapshots cannot be normally re-applied, and partial failures need explicit idempotent recovery.

Acceptance criteria:

- Follow-on slices know preview creates a persisted draft snapshot and hands apply a snapshot id plus fingerprint/version metadata.
- Draft snapshot storage is defined by `advanced_duty_run_snapshots` before preview/apply implementation begins.
- The chosen path does not require production migration work before the migration has been reviewed by the user.

### Slice 2: Extract Advanced Run Snapshot Builder

Type: AFK

Blocked by: Slice 1 if custody affects the snapshot type; otherwise can start from the current in-memory contract.

What to build:

Move the stable advanced generation behavior out of `dutyEventCrud.ts` into an advanced run module while preserving current preview output.

Acceptance criteria:

- Advanced run snapshot can be built from a resolved template, event dates, personnel, status exemptions, holiday/closure dates, existing duty event history, candidate ids, and slot overrides.
- Series snapshots preserve transient-series fairness behavior, so later preview dates account for earlier preview dates.
- Slot proposals preserve generated, manual, locked, cleared, warning, conflict, unfilled, and fairness-confidence behavior.
- Snapshot captures template rules and relevant personnel display fields at generation time.
- Existing preview API output remains compatible.
- Focused tests cover hardest-slot-first fill, rotation-pool history, candidate filtering, status exemptions, blocking/cooldown conflicts, manual overrides, and series transient history.

### Slice 3: Wire Preview Endpoints To Advanced Run Snapshots

Type: AFK

Blocked by: Slice 2

What to build:

Make single-event and series preview endpoints build and return preview data from the advanced run snapshot boundary.

Acceptance criteria:

- `previewDutyEventFromTemplate` uses the advanced run module.
- `previewDutyEventSeriesFromTemplate` uses the advanced run module.
- Preview response can expose snapshot metadata needed by the custody decision.
- Existing wizard screens still render event/date grouped preview, collisions, warnings, and explanation sections.
- Tests prove preview output stays stable for existing advanced duty scenarios.

### Slice 4: Make Apply Consume The Approved Advanced Snapshot

Type: AFK

Blocked by: Slices 1-3

What to build:

Change single-event and series apply so persistence comes from the approved advanced run snapshot instead of recomputing a fresh preview.

Acceptance criteria:

- Apply persists the slot assignments from the approved snapshot.
- Apply preserves the generated original proposal separately from final applied state after manual overrides.
- Collision review is evaluated against the same snapshot the user reviewed.
- Replacement of existing events keeps current safety behavior.
- Series apply uses one run snapshot for all dates, not one fresh recomputation per date.
- If the snapshot is stale, missing, expired, or does not match the apply request, the user must regenerate preview.
- Tests prove template/personnel/status changes after preview do not silently change the applied assignments.

### Slice 5: Move Advanced Export Model Behind The Snapshot

Type: AFK

Blocked by: Slices 2-4

What to build:

Move advanced duty packet export data out of wizard helper markup and behind a formatting-neutral snapshot-derived export model.

Acceptance criteria:

- Advanced run snapshot exposes a team duty packet export model.
- `buildDutyPacketMarkup` becomes a temporary browser/export adapter that consumes the export model.
- Export model includes template name, event date, coverage, fill summary, slot assignments, assignment source, warnings, explanations, and collision notes.
- Browser markup no longer rebuilds generation or explanation decisions.
- Tests cover export model construction from generated, manually overridden, locked, cleared, and unfilled slots.

### Slice 6: Align Availability And Blocking Semantics Across Simple And Advanced Runs

Type: AFK

Blocked by: Slices 2-4

What to build:

Make the advanced run module consume the same canonical availability/blocking concepts as the simple run module where the product meaning overlaps, without forcing DA6 labels into the advanced UI.

Acceptance criteria:

- Advanced generation uses the shared status treatment and blocking/cooldown logic where applicable.
- Advanced status exemptions remain plain-language and team-duty oriented.
- Simple DA6 `A/D/U` semantics remain simple-lane concepts unless explicitly rendered in a simple-duty context.
- Tests cover authorized absence, other duty, misconduct-unavailable treatment, advanced duty overlap, and cooldown behavior where those states are currently supported.
- Any unsupported status/product decision is documented as a stop condition rather than guessed.

### Slice 7: Advanced Wizard Flow Review After Snapshot Integration

Type: HITL

Blocked by: Slices 3-5

What to review:

Once snapshots are wired in, review whether the advanced flow still makes sense for the deeper model.

Acceptance criteria:

- Policy review, candidate review, preview, collision review, manual override, apply, and export all map cleanly to the advanced run snapshot.
- The UI communicates when a preview is stale and needs regeneration.
- The preview screen distinguishes generated proposal, manual/locked changes, warnings, conflicts, and unfilled slots in plain language.
- Any larger UX redesign is split into separate issues instead of hidden inside the snapshot integration.

### Slice 8: Documentation And Boundary Cleanup

Type: AFK

Blocked by: Slices 2-6

What to build:

Update architecture docs and duty-roster docs so future work knows where simple and advanced run responsibilities live.

Acceptance criteria:

- `docs/architecture/MODULE_CONVENTIONS.md` describes the Advanced Duty Run Module boundary.
- `UBIQUITOUS_LANGUAGE.md` distinguishes Duty Roster Run, Advanced Duty Run, Run Snapshot, Advanced Run Snapshot, and Team Duty Packet Export Model.
- `TODO.md` captures deferred event regeneration, correction history, sitewide export, and any status-treatment follow-ups.
- No route, Svelte component, or browser adapter owns advanced generation decisions after the cleanup.

## Recommended Issue Queue

1. HITL: Decide advanced snapshot custody.
2. AFK: Extract advanced run snapshot builder.
3. AFK: Wire preview endpoints to advanced run snapshots.
4. AFK: Make apply consume the approved advanced snapshot.
5. AFK: Move advanced export model behind the snapshot.
6. AFK: Align availability and blocking semantics across simple and advanced runs.
7. HITL: Review the advanced wizard flow after snapshot integration.
8. AFK: Document and clean up advanced run boundaries.

## Verification Expectations

Each implementation slice should include focused tests for the touched surface. Before a slice is considered complete, run:

- `npm run format`
- `npm run lint`
- `npm run governance:check`
- `npm run check`
- `npm run test`

For early planning/doc-only slices, `git diff --check` is acceptable before publishing the issue, but implementation issues should use the full repo gate stack.

## Stop Conditions

Stop and ask before implementing if a slice requires:

- choosing snapshot custody without a recorded decision
- adding or running database migrations
- changing advanced duty product meaning from team roster to DA6 clone
- changing authorization or group-scope semantics
- changing status treatment labels in a way users would see
- expanding deprecated demo/sandbox duty behavior
- redesigning the wizard beyond what the issue explicitly authorizes

## GitHub Publishing Notes

Recommended parent issue title:

`RFC: Advanced Duty Run Module`

Recommended labels:

- `rfc`
- `PRD-RFC`
- `needs-triage`

Recommended child issue labels:

- `vertical-slice`
- `phase-rollout`
- `needs-triage`
- `AFK` or `HITL`

If child issues are published, attach them to the parent issue using GitHub sub-issue linkage rather than relying only on body links.
