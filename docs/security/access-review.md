# Access Review Runbook

This runbook defines the launch access review for TroopToTask. It is intended to produce support-safe evidence without copying secrets, customer exports, raw provider payloads, or unnecessary personal data into the repo.

## Owner And Cadence

- **Owner:** Robert.
- **Launch cadence:** monthly while paid billing and support processes are being stabilized.
- **Steady-state cadence:** quarterly, plus an out-of-cycle review after material auth, billing, storage, provider, or platform-admin changes.
- **Evidence:** external evidence held by Robert, such as a dated review note, sanitized checklist, provider dashboard export, or issue reference that records reviewer, scope, exceptions, and follow-up actions.

## Review Scope

Review these access groups:

- **Platform admins:** users with TroopToTask platform-level administration or provider dashboard access.
- **Organization owners/admins:** users who can manage Organization membership, billing, settings, or sensitive records.
- **Support/billing admins:** users who can view Stripe Dashboard, run billing diagnostics, refresh billing state, or respond to payment incidents.
- **Stale users:** users with no recent legitimate activity, departed personnel, inactive invited users, and accounts that no longer match the Organization's expected roster.

## Review Procedure

1. Identify the current reviewer, date, environment, and systems reviewed.
2. Export or inspect access lists from the app and relevant providers without copying secret values into notes.
3. Confirm each platform admin and support/billing admin still has a current business need.
4. Confirm Organization owners/admins are still authorized by the Organization owner or approved representative.
5. Flag stale users, departed users, dormant invites, and accounts with unexpected privilege.
6. Record each exception with owner, expected resolution date, and whether temporary compensating controls are in place.
7. Deprovision or downgrade access through the provisioning and deprovisioning runbook.
8. Store the final evidence externally and link only the sanitized artifact type or ticket ID from repo docs if needed.

## Evidence Notes

- Do not paste passwords, API keys, recovery links, webhook secrets, session cookies, raw provider exports, card details, or screenshots that expose sensitive values.
- Acceptable evidence includes a dated access-review checklist, a sanitized screenshot with sensitive fields redacted, a provider export stored outside the repo, or a support ticket that records reviewer, scope, and outcome.
- If an access decision depends on a command, customer approval, or Robert's business judgment, document that dependency instead of inventing approval.

## Exceptions

Unresolved exceptions should include:

- affected system or role,
- why the access remains necessary,
- owner,
- target review date,
- launch impact,
- follow-up ticket or external evidence reference.
