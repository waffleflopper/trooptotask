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
  - Consider importing or manually entering the last 1-2 months of duties so future generation can build from real saved history.
  - Prefer saved roster history / run snapshots as the long-term continuation source.
  - Do not put mutable counter state on assignment types.
- Add Calendar status semantics for DA6 behavior.
  - Use human-readable labels that map to authorized/nonchargeable absence, other-duty/chargeable unavailable, and misconduct/chargeable unavailable.
  - Avoid exposing raw A/D/U codes as the primary user language.
- Harden shared rank/pay-grade ordering beyond the first DA6 implementation if other Personnel, leader book, report, or export workflows need canonical military ordering.
- Build the sitewide export module so feature-owned export models can produce XLSX/PDF/CSV/print-ready output.
  - Current marker: `src/features/duty-roster/export/dutyRosterBrowserExport.ts` is a temporary browser adapter that should be retired once the shared export module owns final formatting and download behavior.
