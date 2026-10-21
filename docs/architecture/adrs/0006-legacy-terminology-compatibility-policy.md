# ADR 0006: Duty Role terminology and `clinicRole` compatibility

## Decision

**Duty Role** is the user-facing and documentation term for a person's local position, billet or duty title. `clinic_role` and `clinicRole` stay as the schema, persisted-data, runtime and test names until an explicit migration renames them.

New UX copy, export headings, filters, form labels and abstractions say **Duty Role**. Imports keep accepting the aliases `role`, `clinic role`, `duty position`, `position` and `billet`. Exports write **Duty Role**.

Do not use the bare label **Role** where it could mean **Duty Role**, **Membership Role** or a platform role.

## Why

Existing data, APIs, migrations and CSV or Excel import workflows depend on the clinic-era field shape. The product serves military units generally, so visible copy must not teach clinic assumptions.

## Constraints

- A schema or runtime rename is a planned compatibility migration, never incidental cleanup.
- Do not drop the legacy import aliases.
