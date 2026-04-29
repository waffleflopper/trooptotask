# TODO

This file tracks intentional follow-ups that should not be lost when a plan defers them out of the first implementation slice.

## Auth

- Remove the legacy PKCE code exchange fallback after production email templates are fully rolled over to the app-owned `/auth/confirm` flow.
  - Current markers: `src/routes/auth/accept-invite/+page.server.ts`, `src/routes/auth/reset-password/+page.server.ts`.
  - Confirm invite and reset-password email templates no longer send direct `code` callbacks to these routes before removing the fallback.

## Personnel

- Move bulk personnel management to its own route, mirroring Calendar bulk status operations.
  - Current marker: `src/features/personnel/components/BulkPersonnelManager.svelte`.
  - Preserve the existing import, merge, and bulk delete workflows while moving the management surface out of the modal-oriented component.

## Duty Roster Run Module

- Expose DA6 sequence mode in the UI after the module-level option is implemented and tested.
  - Start with `single-sequence` as the default.
  - Add a user-facing workflow for `separate-weekend-holiday` only when the labels, saved settings, and export behavior are clear.
- Add manual DA6 counter baseline support.
  - Support units that need to continue from a current manual DA6 counter.
  - Prefer importing or manually entering the last 1-2 months of charged duty outcomes as manual history imports so future generation can build from real saved history.
  - Use direct baseline entry only as a fallback when recent history is incomplete or unavailable, and require a reason.
  - Prefer saved roster history, manual history imports, corrected final assignments, and run snapshots as the long-term continuation source.
  - Do not put mutable counter state on assignment types.
- Add manual adjustment and post-apply correction support.
  - Flag every human change to generated duty output as manually adjusted.
  - Preserve generated proposal, original applied state, corrected final state, actor, timestamp, and reason.
  - Start by allowing correction of the final assigned Soldier for a duty date without silently changing DA6 chargeability.
- Add an explicit misconduct / AWOL workflow before enabling misconduct-unavailable calendar status treatment.
  - The status treatment option exists for domain completeness but remains disabled until commanders have a deliberate workflow for applying it.
  - Preserve human-readable labels in the UI; do not make users choose raw DA6 A/D/U codes.
- Harden shared rank/pay-grade ordering beyond the first DA6 implementation if other Personnel, leader book, report, or export workflows need canonical military ordering.
- Build the sitewide export module so feature-owned export models can produce XLSX/PDF/CSV/print-ready output.
  - Current marker: `src/features/duty-roster/export/dutyRosterBrowserExport.ts` is a temporary browser adapter that should be retired once the shared export module owns final formatting and download behavior.

## Advanced Duty Run Module

- Add event-level regeneration for applied advanced duty events.
  - Regeneration should preserve the original Advanced Run Snapshot, show what changed, and require explicit operator approval before replacing a team.
  - Do not silently recompute from current template, personnel, status, or collision data during edit flows.
- Add advanced duty correction history.
  - Preserve the generated proposal, the original applied state, corrected final state, actor, timestamp, and reason.
  - Keep the correction model separate from normal snapshot apply so successful draft snapshots remain finalized and non-replayable.
- Move team duty packet output into the sitewide export module.
  - Current marker: `src/features/duty-roster/components/dutyRosterWizard.helpers.ts` contains `buildDutyPacketMarkup` as a temporary browser adapter over the Team Duty Packet Export Model.
  - Preserve preview/not-applied labeling for draft Advanced Run Snapshots and distinguish applied packet output from preview-only packet output.
- Review advanced duty status-treatment follow-ups after the shared availability/blocking vocabulary settles.
  - Keep advanced status exemptions plain-language and team-duty oriented.
  - Do not expose simple-lane DA Form 6 `A`/`D`/`U` labels in advanced duty UX unless a later product decision explicitly asks for it.
