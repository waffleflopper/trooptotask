# ADR Index

This index is the current map of architecture decisions. Use it before reading individual ADRs so accepted, superseded, and historical decisions are not treated as one flat backlog.

## Status Model

- `Accepted`: current decision. Follow it unless a newer ADR supersedes it.
- `Proposed`: draft decision. Do not treat it as binding.
- `Superseded`: historical decision. Read for context only, then follow the superseding current-state docs or ADR.
- `Rejected`: explicitly not the project direction.

## Current ADRs

| ADR | Status | Decision Area | Current Use |
| --- | --- | --- | --- |
| [0001: V1 Authorization Replacement Model](adrs/0001-v1-authorization-replacement-model.md) | Accepted | Authorization model direction | Read for authz model, presets, capability levels, scope, and migration constraints. |
| [0002: V1 Feature Permission Lane Map](adrs/0002-v1-feature-permission-lane-map.md) | Accepted | Feature permission ownership | Read before changing feature lanes, route guards, membership flags, invitations, or RLS. |
| [0003: Leaders Book And Rating Scheme Boundary](adrs/0003-leaders-book-and-rating-scheme-boundary.md) | Accepted | Historical Leaders Book / Rating Scheme split | Historical boundary context. Current Personnel absorption is governed by ADR 0008. |
| [0004: V1 Provider Boundary Contract](adrs/0004-v1-provider-boundary-contract.md) | Accepted | Provider ownership | Read before adding or moving Supabase/provider access. |
| [0005: Demo And Sandbox Decommissioning](adrs/0005-demo-and-sandbox-decommissioning.md) | Accepted | Demo/sandbox removal | Read before touching historical demo/sandbox code, schema, migrations, or access behavior. |
| [0006: Legacy Terminology Compatibility Policy](adrs/0006-legacy-terminology-compatibility-policy.md) | Accepted | Canonical language and compatibility names | Read before renaming domain fields, UX copy, imports/exports, or docs terminology. |
| [0007: Advanced Duty Snapshot Custody](adrs/0007-advanced-duty-snapshot-custody.md) | Superseded | Old Advanced Duty Run snapshot custody | Historical only after removal of the old Advanced Duty Run server flow and `/api/duty-events/**` write/revision endpoints. |
| [0008: Leaders Book Retirement And Personnel Absorption](adrs/0008-leaders-book-retirement-and-personnel-absorption.md) | Accepted | Personnel-owned per-Soldier workflows | Current decision for counseling, notes, follow-ups, documents, and retired Leaders Book surface. |

## Reading Rules

- For broad architecture scans, read `ARCHITECTURE.md`, `MODULE_CONVENTIONS.md`, `DRIFT_LEDGER.md`, `GOVERNANCE_CHECKS.md`, this index, and only the ADRs relevant to the touched seam.
- For authz work, ADR 0001, 0002, and 0004 are usually relevant.
- For Personnel, Leaders Book, or Rating Scheme work, ADR 0002, 0003, and 0008 may be relevant, but ADR 0008 is the current product decision for Leaders Book retirement.
- For old demo/sandbox residue, read ADR 0005 and `DRIFT_LEDGER.md` D-06.
- For terminology work, read ADR 0006 and `UBIQUITOUS_LANGUAGE.md`.

