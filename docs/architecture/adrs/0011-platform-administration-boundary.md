# ADR 0011: Platform Administration boundary

## Decision

- **Platform Administration** operates TroopToTask across all Organizations: **User Accounts**, Organizations, Access Requests, announcements, Feedback, Audit and suspension. Platform roles gate it.
- **Organization Governance Actions** govern one Organization through its membership roles. Organization settings, member management and owner-only danger operations stay there unless the work is platform-wide support.
- Platform Administration may use service-role access because its workflows span Organizations. Organization code uses the request user's RLS client.
- An Organization-scoped surface may read platform-owned state only through a narrow, purpose-built service-role port. The port runs after the surface's own authorization and returns the minimum shape the surface needs, never raw platform rows. Platform vocabulary is translated to Organization-facing language before it crosses the network. [ADR 0012](0012-organization-invited-platform-access-auto-approval.md) records the first such port.
- A privileged platform command emits its audit event only after the underlying operation reports success.

## Why

Platform support spans Organizations, so no Organization's membership model can authorize it. Service-role access bypasses RLS, so it must stay limited to work that is genuinely app-wide.

## Constraints

- Do not call Platform Administration "Organization admin" or model it as member management.
- Do not grant RLS access on platform tables to Organization roles.
- Do not mirror platform state onto Organization tables. A read-time port cannot drift.
- Each new Organization-scoped service-role port is its own reviewed exception, not a general license.
- A required source read that fails is an error. Do not render it as an empty or zero result.
- Activation health reports Organization-level aggregates from existing records. It captures no personal behavior streams, raw IP addresses, analytics identifiers or secrets.
- New usage or analytics records, such as AI usage metering, and logs sent to an outside tool need a privacy, schema and retention plan that Robert approves first. The plan names what is recorded and at what level (Organization or person), who can read it, how long it is kept, and how it is deleted. Secrets, tokens and sensitive Personnel content never leave the app.
