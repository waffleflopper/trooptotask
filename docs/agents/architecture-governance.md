# Architecture and governance

Use this map for architecture, authorization, provider-boundary, terminology or governance work.

| Task                                                            | Read                                                                                                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding or moving feature code, module seams                     | [Architecture](../architecture/ARCHITECTURE.md#modules-and-delivery) and `scripts/module-boundaries.json`                                                                                     |
| Authentication, authorization, membership or provider ownership | [Authorization and provider boundaries](../architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md) and the relevant [ADRs](../architecture/ADR_INDEX.md)                                       |
| Governance rule change                                          | `scripts/check-governance.mjs`, `scripts/module-boundaries.ts` and their tests                                                                                                                |
| Current SQL functions, policies, grants and database types      | [Current schema](../../supabase/current-schema.sql) and [generated types](../../src/lib/server/database.types.ts). Never hand-edit; regenerate with `mise exec node@24 -- npm run db:schema`. |
| Domain naming                                                   | [CONTEXT.md](../../CONTEXT.md#language)                                                                                                                                                       |
| Completion criteria                                             | [Definition of Done](../architecture/DEFINITION_OF_DONE.md)                                                                                                                                   |

## Guardrails

- Keep Organization and Group vocabulary, independent feature lanes and member access scope. Preserve Personnel Duty Role data (`clinicRole` / `clinic_role`) and use the canonical term in new code and copy.
- Keep business logic behind owner operations and ports, and provider-specific calls at auth edges and adapters.
- Governance has no exception file. Do not add exceptions, allowlists or permission couplings to make new drift pass.
- Necessary adjacent changes are part of the requested change. Record unrelated discoveries and continue. If the outcome depends on an unresolved change to authorization semantics, tenancy, provider privileges or a product contract, ask about that decision and continue the independent work.
