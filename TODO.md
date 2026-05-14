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
