# Domain docs

[CONTEXT.md](../../CONTEXT.md#language) is the glossary of canonical terms and their distinctions. Keep entries to short definitions; behavior lives in code and tests.

| Task                                                        | Read                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account setup, reviewed access, invitations or membership   | [Authorization and provider boundaries](../architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md) and ADRs 0009 and 0012 in the [ADR index](../architecture/ADR_INDEX.md) |
| Roles, presets, capabilities, scope or authorization        | [Authorization and provider boundaries](../architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md) and ADR 0001                                                            |
| Feature behavior, imports, exports or readiness             | The owning feature in `src/features/<owner>/` and its behavioral tests                                                                                                    |
| Canonical wording versus compatibility names (`clinicRole`) | ADR 0006                                                                                                                                                                  |
| Removed Billing or retired Duty Roster terms                | [Stabilization decisions](../architecture/ARCHITECTURE.md#stabilization-decisions); history does not authorize rebuilding them                                            |

When a definition is missing or conflicts with behavior, inspect the implementation and tests before changing it. Ask only when an unresolved domain decision materially affects the task.
