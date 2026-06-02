# ADR Backlog

This file tracks remaining or emerging architecture decisions that may need a future ADR.

Accepted and superseded ADRs live in [ADR Index](ADR_INDEX.md). Do not use this file as the status source for decisions that already have ADRs.

## Open Candidates

### Platform Admin Provider Boundary

- Status: Open candidate
- Why:
  - route-level provider coupling remains concentrated around admin/platform operations.
- Likely covers:
  - which platform-admin operations stay provider-adjacent
  - which operations move behind use cases and adapters
  - service-role boundaries
  - audit behavior for privileged platform actions

### Legacy Clinic Terminology Runtime Rename

- Status: Open candidate
- Why:
  - ADR 0006 sets the compatibility policy, but a runtime/schema rename from clinic-era names to current domain language would be a separate decision.
- Likely covers:
  - compatibility aliases
  - migration sequencing
  - import/export labels
  - API and schema naming
  - user-facing copy

### Future Feature-Lane Expansion

- Status: Open candidate
- Why:
  - current first-class feature lanes are documented. New durable product surfaces may need explicit lane ownership rather than borrowing existing permissions.
- Likely covers:
  - new feature lane criteria
  - governance versus product-feature boundaries
  - invitation and membership capability mapping
  - RLS implications

## Removed From Backlog

These are no longer backlog items because ADRs already exist:

- V1 authorization replacement model: [ADR 0001](adrs/0001-v1-authorization-replacement-model.md)
- Feature permission lane map: [ADR 0002](adrs/0002-v1-feature-permission-lane-map.md)
- Provider boundary contract: [ADR 0004](adrs/0004-v1-provider-boundary-contract.md)
- Legacy terminology compatibility policy: [ADR 0006](adrs/0006-legacy-terminology-compatibility-policy.md)
