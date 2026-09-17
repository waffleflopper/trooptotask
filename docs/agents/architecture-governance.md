# Architecture And Governance

Use this map for architecture, authorization, provider-boundary, terminology or governance work. Read the sections needed for the affected boundary.

| Task                                                            | References                                                                                                                                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module ownership or moving code                                 | [Architecture](../architecture/ARCHITECTURE.md), [Module conventions](../architecture/MODULE_CONVENTIONS.md)                                                                            |
| Authentication, authorization, membership or provider ownership | [Authorization & provider boundaries](../architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md); relevant decisions from the [ADR index](../architecture/ADR_INDEX.md)                  |
| Known drift or a proposed replacement                           | The matching entry in [Drift ledger](../architecture/DRIFT_LEDGER.md) and [Change intent](../architecture/V1_CHANGE_INTENT.md)                                                          |
| Governance rule or baseline change                              | [Governance checks](../architecture/GOVERNANCE_CHECKS.md) and the affected rule in `scripts/check-governance.mjs`                                                                       |
| New or revised architecture decision                            | [ADR guidance](../architecture/ADR_GUIDANCE.md), [index](../architecture/ADR_INDEX.md), [backlog](../architecture/ADR_BACKLOG.md) and [template](../architecture/adrs/0000-template.md) |
| Domain naming                                                   | [Language](../../CONTEXT.md#language)                                                                                                                                                   |
| Scope crosses an architectural boundary                         | [AI agent operating model](../architecture/AI_AGENT_OPERATING_MODEL.md)                                                                                                                 |
| Completion criteria                                             | [Definition of Done](../architecture/DEFINITION_OF_DONE.md)                                                                                                                             |

## Guardrails

- For stabilization, the [program decisions](../architecture/ARCHITECTURE.md#stabilization-decisions) govern complete cutovers. Existing drift is removal work, not permission for permanent compatibility paths.
- Keep Organization/Group vocabulary, independent feature lanes and member access scope. Preserve Personnel Duty Role data (`clinicRole` / `clinic_role`); use the canonical term in new code and copy.
- Keep business logic behind app-owned ports/adapters and auth-provider-specific calls at auth edges. Retire direct provider leaks through their owning tasks.
- `GOVERNANCE_BASELINE.json` records existing exceptions. Remove resolved entries with their consumers; preserve scan coverage and do not add exceptions or permission couplings to accommodate new drift.
- Necessary adjacent changes are part of the authorized cutover. For unrelated discoveries, record the issue and continue the requested work. If completion requires an unresolved change to authorization semantics, tenancy, provider privileges or a product contract, isolate that decision under the [operating model](../architecture/AI_AGENT_OPERATING_MODEL.md#decision-boundaries).
