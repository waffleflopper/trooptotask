# ADR Index

This index is the current map of architecture decisions. Use it before reading individual ADRs so accepted, superseded, and historical decisions are not treated as one flat backlog.

## Status Model

- `Accepted`: current decision. Follow it unless a newer ADR or the [stabilization decisions](ARCHITECTURE.md#stabilization-decisions) supersede its guidance.
- `Proposed`: draft decision. Do not treat it as binding.
- `Superseded`: historical decision. Read for context only, then follow the superseding current-state docs or ADR.
- `Rejected`: explicitly not the project direction.

## Current ADRs

| ADR                                                                                                                         | Status     | Decision Area                                   | Current Use                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001: V1 Authorization Replacement Model](adrs/0001-v1-authorization-replacement-model.md)                                 | Accepted   | Authorization model direction                   | Read for authz model, presets, capability levels, scope, and migration constraints.                                                                                                     |
| [0002: V1 Feature Permission Lane Map](adrs/0002-v1-feature-permission-lane-map.md)                                         | Accepted   | Feature permission ownership                    | Read before changing feature lanes, route guards, membership flags, invitations, or RLS.                                                                                                |
| [0004: V1 Provider Boundary Contract](adrs/0004-v1-provider-boundary-contract.md)                                           | Accepted   | Provider ownership                              | Read before adding or moving Supabase/provider access.                                                                                                                                  |
| [0006: Legacy Terminology Compatibility Policy](adrs/0006-legacy-terminology-compatibility-policy.md)                       | Accepted   | Canonical language and compatibility names      | Read before renaming domain fields, UX copy, imports/exports, or docs terminology.                                                                                                      |
| [0007: Advanced Duty Snapshot Custody](adrs/0007-advanced-duty-snapshot-custody.md)                                         | Superseded | Old Advanced Duty Run snapshot custody          | Historical only after removal of the old Advanced Duty Run server flow and `/api/duty-events/**` write/revision endpoints.                                                              |
| [0009: Beta Access Request Account Setup Links](adrs/0009-beta-access-request-account-setup-links.md)                       | Accepted   | Beta access and account setup                   | Read before changing access requests, account setup links, Supabase invite replacement, invite-code registration, or setup-link cleanup.                                                |
| [0010: Native Workbook Export Boundary](adrs/0010-native-workbook-export-boundary.md)                                       | Accepted   | Excel export module boundary                    | Read before adding or changing Excel-labeled exports, workbook generation helpers, or export download/response behavior.                                                                |
| [0011: Platform Administration Boundary](adrs/0011-platform-administration-boundary.md)                                     | Accepted   | Platform admin product boundary                 | Read before changing `/admin`, platform-wide support operations, service-role platform reads, or Platform Administration terminology.                                                   |
| [0012: Organization-Invited Platform Access Auto-Approval](adrs/0012-organization-invited-platform-access-auto-approval.md) | Accepted   | Beta platform entry via organization invitation | Read before changing organization invitations for people without accounts, access-request approval actors, account setup link issuance, or organization-scoped reads of platform state. |

## Reading Rules

- For architecture work, use the [task reading map](../agents/architecture-governance.md) and select the ADRs covering the affected seam.
- For authz work, ADR 0001, 0002, and 0004 are usually relevant.
- For beta access, account setup, invite replacement, or `/auth/register` deprecation, read ADR 0009.
- For terminology work, read ADR 0006 and [CONTEXT.md language](../../CONTEXT.md#language). Older ADR references to `UBIQUITOUS_LANGUAGE.md` refer to this maintained language source; there is no separate glossary file.
- For Excel-labeled exports, read ADR 0010.
- For Platform Administration work, read ADR 0011.
- For organization invitations to people without **User Accounts**, setup-link issuance from a non-platform-admin path, or organization-scoped service-role reads, read ADR 0012 alongside 0009 and 0011.
