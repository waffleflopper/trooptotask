# ADR 0006: Legacy Terminology Compatibility Policy

Status: Accepted
Date: 2026-04-27

## Context

TroopToTask v1 still has clinic-era schema and runtime names such as `clinic_role` and `clinicRole`. The product direction is broader military unit management, and current user-facing copy has already moved many surfaces to **Duty Role** while still preserving compatibility aliases in imports and persistence.

The conflict is real: schema and code need compatibility, but docs, UX copy, exports, and new abstractions need canonical military language so the product does not keep teaching old clinic assumptions.

## Decision

Use **Duty Role** as the canonical user-facing and documentation term for a person's local functional role, billet, or position title. Keep `clinic_role` and `clinicRole` as compatibility names in schema, persisted data, runtime shapes, and tests until an explicit migration slice authorizes a deeper rename.

New docs, UX copy, import/export headings, filters, form labels, and feature abstractions should say **Duty Role** when they mean this personnel-position concept. Import paths may continue accepting aliases such as `role`, `clinic role`, `duty position`, `position`, or `billet` for compatibility, but canonical output should prefer **Duty Role**.

The bare label **Role** should be avoided where it could mean **Duty Role**, **Membership Role**, or platform/admin role.

## Rejected Or Deferred Alternatives

- Rename schema and runtime fields immediately; deferred because existing data, APIs, tests, and migrations depend on the current field shape.
- Keep user-facing clinic terminology until the schema changes; rejected because it preserves obsolete product language and keeps confusing future design work.
- Use **Role** as the generic label everywhere; rejected because it is overloaded across personnel duties, organization membership, and platform administration.
- Stop accepting legacy import aliases; rejected because compatibility is cheaper and safer than forcing existing CSV/Excel workflows to change immediately.

## Consequences

Future cleanup should move visible language toward **Duty Role** while preserving compatibility at data boundaries. A later migration may rename runtime or schema fields, but that must be an explicit compatibility plan rather than incidental cleanup.

## Links

- Related drift ID: `D-05`
- Related docs:
  - `CONTEXT.md`
  - `UBIQUITOUS_LANGUAGE.md`
  - `docs/architecture/ARCHITECTURE.md`
  - `docs/architecture/DRIFT_LEDGER.md`
  - `docs/architecture/V1_CHANGE_INTENT.md`
