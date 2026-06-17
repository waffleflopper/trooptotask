# Provisioning And Deprovisioning Runbook

This runbook covers launch-safe access grants and removals for platform administration, support, billing, and Organization-level administration. It documents the process; it does not authorize production database changes or secret disclosure.

## Owner And Cadence

- **Owner:** Robert.
- **Cadence:** per access change, with a monthly stale-access sweep during launch ramp.
- **Evidence:** external evidence held by the security owner, such as approval notes, support tickets, provider audit entries, or a sanitized access-change log.

## Provisioning Platform Admin Access

1. Confirm the business need, requested role, environment, and approval owner.
2. Grant the least privileged role required for the task.
3. Prefer time-bounded access for support, launch, or incident work.
4. Record the approver, date, role, environment, and expected review date in external evidence.
5. Do not copy invite links, recovery links, temporary passwords, API keys, webhook secrets, session cookies, or provider secrets into repo docs or issues.

## Provisioning Support And Billing Access

Support and billing access should be limited to the systems required for the support case:

- TroopToTask admin diagnostics for the affected Organization.
- Stripe Dashboard access only when billing investigation requires it.
- Provider logs or dashboard views only when necessary for incident response or launch verification.

Support notes may include support-safe identifiers such as Organization ID, Stripe customer ID, subscription ID, invoice ID, or webhook event ID when those identifiers are needed to reproduce the support trail. Do not include card details, raw webhook payloads, API keys, webhook signatures, or secret values.

## Deprovisioning Access

Trigger deprovisioning when a person leaves, changes role, no longer needs access, fails access review, or is involved in a suspected compromise.

1. Revoke app, provider, Stripe, and repository access that is no longer needed.
2. Remove or downgrade Organization owner/admin roles where appropriate.
3. Revoke active sessions when compromise, departure, or role transition warrants it.
4. Rotate shared or potentially exposed credentials after staff departure, incident, or accidental disclosure.
5. Record the date, systems touched, reviewer, and sanitized outcome externally.

## Organization Owner/Admin Changes

When an Organization needs owner/admin changes:

- Confirm the request comes from an authorized owner or approved representative.
- Preserve least privilege; assign owner/admin only when the role is necessary.
- Document the approval source and affected role externally.
- Avoid destructive database edits. If a data correction appears necessary, stop and ask Robert for explicit approval before touching any database.

## Departing Or Stale Users

For departing personnel or stale users:

- Disable or remove access according to Organization direction.
- Confirm pending invites and dormant admin accounts are still needed.
- Review whether the user owned billing, exports, integrations, or sensitive workflows.
- Keep evidence support-safe and external; do not paste raw roster exports into repo docs.

## Environment And Secrets Review

Before paid launch and after any provider, staff, incident, or deployment-secret change:

- Confirm required deployment variables exist in the correct environment.
- Confirm each secret has an owner and rotation path.
- Confirm no secret values were copied into docs, issues, pull requests, screenshots, or support notes.
- Record existence, owner, and last-reviewed date only; never record secret values.
