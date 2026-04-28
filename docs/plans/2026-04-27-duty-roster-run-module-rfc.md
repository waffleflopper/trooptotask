# Duty Roster Run Module RFC

## Purpose

Deepen the simple Duty Roster Generator into a feature-owned **Duty Roster Run Module** that owns DA Form 6-style generation, immutable run snapshots, apply/save payloads, and export-ready data.

The current generator is useful, but too much duty logic lives inside `DutyRosterGenerator.svelte`: setup state, availability checks, advanced-duty blocking, DA6 matrix creation, apply payload creation, history payload creation, and browser export formatting. That makes the page module shallow: callers and tests have to understand nearly the entire implementation to verify one roster run.

This RFC keeps the simple generator easy to use while making the underlying module robust enough for regulation-informed DA6 behavior and future export tooling.

## Current State

- `src/features/duty-roster/components/DutyRosterGenerator.svelte` owns generation, preview, apply, history save, DA6 data, and Excel HTML export behavior.
- The current generator uses a simplified "longest since last duty, then alphabetical" assignment rule.
- Advanced duty overlap and cooldown already affect whether a Soldier can be selected.
- Saved roster history captures a snapshot-like payload, but the shape is assembled inside the Svelte page.
- Export currently builds Excel-compatible HTML in the Svelte page.
- The broader advanced duty rebuild already expects simple duties to remain lightweight while advanced duties gain richer templates and events.

## Goals

1. Move duty-run logic behind a deep module with a small, testable interface.
2. Preserve simple duty roster usability as the default path.
3. Make DA6 behavior explicit enough to support correct A/D/U numbering and future DA6-formatted exports.
4. Treat each generated run as an immutable snapshot.
5. Keep apply, save, retry, and export operations tied to the exact snapshot the user previewed.
6. Support recoverable partial success when calendar apply succeeds but history save fails.
7. Produce export-ready data without formatting files directly.
8. Leave clean seams for future Calendar status semantics, sitewide export, and manual DA6 adjustments.

## Non-Goals

- Do not build the sitewide export module in this slice.
- Do not generate final Excel/PDF/DA6 files inside the Duty Roster Run Module.
- Do not add Calendar status A/D/U semantics in this slice.
- Do not implement misconduct-driven `U` behavior until the product has an explicit human-readable status for it.
- Do not expand deprecated demo/sandbox duty behavior.
- Do not rebuild the full advanced duty template system in this slice.

## Vocabulary

- **Duty Roster Run**: One generated simple-duty roster for a selected duty type and date range.
- **Run Snapshot**: The immutable inputs and outputs for a generated run.
- **DA6 Matrix**: Structured row/column data representing the DA Form 6 duty roster, including chargeable and nonchargeable cells.
- **Roster Row**: The operational output for one duty date: assigned Soldier or unfilled reason.
- **Apply Payload**: The daily-assignment rows that should be created on the calendar from a snapshot.
- **History Payload**: The saved audit/history record built from a snapshot.
- **Export Model**: Formatting-neutral data the future export module can turn into Excel, PDF, or DA6-style output.

## Regulatory References

This plan is informed by AR 220-45 / DA Pam 220-45 public guidance and mirrors:

- DA Form 6 records duty performance for equitable assignment.
- The next detail normally goes to the Soldier with the longest break from that duty.
- New DA6 roster rows are ordered by pay grade, highest first, alphabetically within pay grade.
- `A` means authorized nonchargeable absence and interrupts numbering.
- `D` means eligible but skipped because of previous detail or other duty; numbering continues.
- `U` means unavailable because of misconduct; numbering continues.
- Consolidated weekday/weekend/holiday rosters may use separate numbering sequences and should visually distinguish weekend/holiday periods.

Reference URLs:

- `https://www.hrc.army.mil/content/Duty%20Rosters-%20Frequently%20Asked%20Questions-%20AR%20220-45`
- `https://pdf4pro.com/file/14adb5/epubs_DR_pubs_DR_a_ARN31629_PAM_220_45_000_WEB_1.pdf.pdf`
- `https://www.oocities.org/tomaz429/study/duty_rosters.htm`

## Product Decisions

### Immutable Snapshots

Each generated Duty Roster Run creates one immutable snapshot.

- Preview, apply, save, retry, and export all operate on that snapshot.
- Changing form inputs after generation does not mutate the snapshot.
- The user must generate a new run before applying changed dates, exclusions, assignment type, or exemptions.
- Saved history and later exports use the saved snapshot, not current Personnel or Assignment Type data.

### Snapshot Contents

The snapshot stores:

- assignment type id and display fields
- date range and duty duration
- sequence mode and per-date sequence kind
- excluded status ids
- excluded weekend/holiday/closure toggles
- exempt Personnel ids
- Personnel display fields at generation time
- roster rows
- DA6 matrix rows, columns, and cells
- apply payload
- history payload
- export model
- generation warnings and explanations

### Partial Success

The apply/save flow keeps current operational behavior but makes the outcome explicit.

- Calendar apply success + history save success = success.
- Calendar apply success + history save failure = recoverable partial success.
- Calendar apply failure = failure; history save is not attempted.
- A partial-success snapshot remains available so the user can retry history save or export the snapshot immediately.
- Retrying history save must not re-apply calendar assignments.
- The first implementation should add a small "export snapshot" recovery affordance for this partial-success state. This is a fallback audit-preservation path, not the final sitewide export experience.

### DA6 Availability Mapping

Current product inputs map to DA6 concepts as follows:

| Product state | DA6 treatment | Numbering |
| --- | --- | --- |
| Selected excluded Availability Status | `A` authorized absence | interrupted / nonchargeable |
| Advanced duty overlap | `D` other duty | continues |
| Advanced duty cooldown | `D` other duty | continues |
| Manual exemption from duty type | omitted from this duty roster | not charged |
| Unqualified for duty type | omitted from this duty roster | not charged |
| Future misconduct/AWOL-style state | `U` | continues |

The first implementation should only use states the product can honestly infer today. Misconduct-style `U` support stays blocked until a human-readable status exists.

### DA6 Cell Shape

The DA6 matrix should store structured cells rather than display-only values.

Each cell should be able to express:

- date
- personnel id
- DA6 code: assigned, available-not-selected, authorized absence, blocked by duty, blocked by cooldown, misconduct unavailable
- whether the cell is chargeable
- queue position when applicable
- whether this Soldier was assigned
- human-readable reason
- optional machine-readable reason code

The later export module decides whether this renders as `1`, `D4`, `A`, shaded cells, notes, or another approved format.

### Selection And Ordering

The run module should match DA6 rules where the product has enough data.

- Select the available Soldier with the longest break from the duty.
- If that Soldier is unavailable, choose the next-longest break.
- Tie-break with DA6 roster order.
- DA6 roster order is highest pay grade first, alphabetically within pay grade.
- Canonical rank/pay-grade ordering should live in a shared personnel/domain utility, not inside the Duty Roster Run Module.
- If current rank ordering is incomplete, use a deterministic alphabetical fallback and track follow-up hardening in `TODO.md`.

### Sequence Modes

The default stays simple, but the model should support DA6-compliant opt-in behavior.

- Default `numberingMode`: `single-sequence`.
- Optional `numberingMode`: `separate-weekend-holiday`.
- Each duty date stores a `sequenceKind`: `weekday`, `weekend`, `holiday`, or `weekend-holiday`.
- The export model marks weekend/holiday periods distinctly so the future export module can render red lines or equivalent visual separation.
- Sequence mode starts as a module-level option covered by tests. Do not expose it in the UI during the first implementation.
- Exposing sequence mode in the UI is tracked in `TODO.md`.

### Export Responsibility

The Duty Roster Run Module produces an export-ready model.

It does not:

- build Excel-compatible HTML
- create Blobs
- click download links
- know about browser DOM
- decide final PDF/XLSX formatting

Those belong to a future sitewide export module.

## Proposed Module Shape

Create a feature-owned module area such as:

`src/features/duty-roster/run/`

Candidate files:

- `dutyRosterRun.ts`
- `dutyRosterRun.types.ts`
- `da6Matrix.ts`
- `da6Availability.ts`
- `dutyRosterExportModel.ts`
- `dutyRosterRun.test.ts`
- `da6Matrix.test.ts`

The public interface should stay small:

- build a run snapshot from authorized input data
- derive apply payload from a snapshot
- derive history payload from a snapshot
- derive export model from a snapshot
- classify apply/save outcome for UI messaging

The Svelte page remains the adapter for:

- form state
- rendering
- callbacks such as `onApplyRoster`, `onSaveRoster`, `onDeleteRoster`, and `onUpdateExemptions`
- browser download behavior until the export module exists
- toast/feedback UI

## Implementation Plan

### Slice 1: Pure Run Snapshot And DA6 Tests

Build the pure module and tests without changing UI behavior yet.

Acceptance criteria:

- Shared rank/pay-grade ordering utility exists or is hardened enough for DA6 roster order.
- A run snapshot can be built from Personnel, assignment types, assignments, advanced duty events, Availability Statuses, Special Days, and form config.
- Snapshot captures Personnel display fields at generation time.
- DA6 matrix supports structured cells and chargeable/nonchargeable states.
- `A`, `D`, and future `U` behavior is represented in types and tests.
- Date classification supports weekday/weekend/holiday/closure inputs.
- Tests cover longest-break selection, DA6 roster order, `A` interruption, `D` continuation, and unfilled-date explanations.

### Slice 2: Wire Preview To The Run Module

Replace page-local generation with the run snapshot while preserving the visible preview.

Acceptance criteria:

- `DutyRosterGenerator.svelte` calls the run module to generate preview.
- Existing preview rows still render.
- Generated DA6 data comes from the snapshot, not page-local reconstruction.
- Changing form inputs after generation does not mutate the active snapshot.
- Generating again replaces the active snapshot.
- Tests cover immutable snapshot behavior at the module level.

### Slice 3: Apply, Save, Retry, And Export Model

Move apply/save payload construction into the module and make partial success recoverable.

Acceptance criteria:

- Apply payload comes from the active snapshot.
- History payload comes from the active snapshot.
- If calendar apply fails, history save is not attempted.
- If history save fails after calendar apply succeeds, the UI shows recoverable partial success.
- The snapshot remains available for retry history save and manual export.
- Partial-success UI includes an explicit "export snapshot" fallback action.
- Retry history save does not re-apply calendar assignments.
- Export action consumes the snapshot export model.
- Existing browser download behavior may remain as a temporary adapter until the sitewide export module exists.

### Slice 4: Internal Sequence Mode And DA6 Export Readiness

Add configuration-ready support for sequence modes without overloading the simple default.

Acceptance criteria:

- Default mode remains `single-sequence`.
- Snapshot supports `separate-weekend-holiday`.
- DA6 matrix can maintain separate charge counts by sequence kind.
- Export model marks weekend/holiday periods distinctly.
- Tests prove sequence counts do not bleed when separate mode is used.

### Slice 5: Page Cleanup And Documentation

Remove leftover duty-run business logic from the Svelte page and document remaining seams.

Acceptance criteria:

- `DutyRosterGenerator.svelte` no longer owns selection rules, DA6 numbering rules, apply payload construction, or history payload construction.
- Page code is mostly UI adapter state and callback orchestration.
- Any temporary export formatting adapter is clearly isolated.
- Relevant docs mention the Duty Roster Run Module and the future export/status follow-ups.

## Test Plan

Module tests should cover:

- DA6 roster ordering by pay grade then name.
- Deterministic fallback ordering when rank/pay-grade data is insufficient.
- Longest-break selection.
- Next-longest selection when first candidate is unavailable.
- `A` cells interrupt numbering.
- `D` cells continue numbering.
- Future `U` cells continue numbering but are not selectable.
- Exempt/unqualified Personnel are omitted from the duty roster.
- Advanced duty overlap maps to chargeable `D`.
- Advanced duty cooldown maps to chargeable `D`.
- Unfilled dates record one roster row and explanatory DA6 cells.
- Snapshot display fields do not change when source Personnel data changes.
- Apply payload is derived from assigned roster rows only.
- History payload is derived from snapshot data.
- Export model is derived from snapshot data.
- Separate weekend/holiday mode keeps independent counters.

Component/page tests should cover:

- Generate preview uses the snapshot.
- Changing form state after generation requires a new run.
- Apply failure does not save history.
- History-save failure leaves retry/export available.
- Retry save does not re-apply calendar assignments.
- Existing visible labels and workflow stay recognizable.

Required completion checks:

- `npm run format`
- `npm run lint`
- `npm run governance:check`
- `npm run check`
- `npm run test`

## Follow-Up Issues To File

### Calendar Status DA6 Semantics

Add human-readable Calendar status semantics that map Availability Statuses to DA6 behavior without forcing users to think in `A`, `D`, or `U` codes.

Examples:

- Authorized absence / nonchargeable
- Other duty / chargeable unavailable
- Misconduct unavailable / chargeable unavailable

This should replace the current broad "excluded status means A" approximation once implemented.

### Sitewide Export Module

Create a shared export module that can consume feature-owned export models and produce XLSX/PDF/CSV/print-ready output.

The Duty Roster Run Module should plug into it with:

- roster rows
- DA6 matrix
- notes/explanations
- sequence-kind metadata
- snapshot header fields

### Rank And Pay-Grade Ordering Helper

Harden the shared rank/pay-grade ordering helper beyond the first DA6 needs if additional Personnel, reports, leader book, or export workflows need the same canonical order.

### Manual DA6 Adjustments And Counter Overrides

Add a controlled manual adjustment model for:

- correcting DA6 cells after the fact
- editing starting counters when prior history is incomplete
- importing or manually entering recent manual DA6 history so future generation can continue from an honest baseline
- recording why a manual change was made
- preserving both generated proposal and final applied state

This is important for full DA6 maturity but should be built as an explicit workflow, not hidden inside the first extraction. The preferred future source for continuation is saved roster history / run snapshots. Assignment types describe what the duty is; they should not own mutable DA6 counter state. Future simple duty templates may provide defaults, but historical continuation should come from saved roster history.

## Settled Implementation Decisions

These questions were settled during RFC review.

1. Canonical rank/pay-grade ordering lives in a shared personnel/domain utility. Duty rosters consume that utility but do not own the military rank precedence model.
2. Sequence mode starts as a module-level option used by tests and future UI. The first implementation does not expose a sequence-mode setting to users.
3. Manual counter baselines are deferred. Future continuation should come from saved roster history / run snapshots, with possible support for importing recent manual DA6 history or manually entering prior duties. Assignment types should not own mutable DA6 counter state.
4. The first implementation adds an explicit "export snapshot" recovery action for partial success when calendar apply succeeds but history save fails.

## Recommended First Implementation Thread

Start with Slices 1 through 3 on the same implementation branch/PR, with small commits:

- Add the pure run module.
- Add DA6 behavior tests.
- Wire preview generation through the snapshot.
- Move apply, save, retry, and export-model payloads behind the snapshot before calling the Module extraction done.

Do not stop after preview extraction if the page still owns apply/save/export payload decisions. That would create a half-seam and preserve the exact debt this RFC is trying to remove.
