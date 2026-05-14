# ADR Backlog

The repo now has ADR guidance and a template under `docs/architecture/adrs/`, but the decisions below are still the highest-value ADRs to write as v1 remediation work begins.

## ADR Candidates

### ADR-01 V1 Authorization Replacement Model

- Status:
  - Accepted in [ADR 0001](adrs/0001-v1-authorization-replacement-model.md)
- Why:
  - replace the current role-plus-booleans-plus-scope model with clearer app-owned authz concepts
- Covers:
  - roles, member presets, capability levels, shared scope sets, policy decisions, migration constraints, and auditability goals

### ADR-02 Provider Boundary Contract

- Status:
  - Accepted in [ADR 0004](adrs/0004-v1-provider-boundary-contract.md)
- Why:
  - make provider ownership explicit so business logic no longer leaks direct Supabase usage outside approved edges
- Should cover:
  - what counts as an adapter
  - what auth is allowed to remain provider-specific
  - what code must be provider-agnostic

### ADR-03 Feature Permission Lane Map

- Status:
  - Accepted in [ADR 0002](adrs/0002-v1-feature-permission-lane-map.md)
- Why:
  - stop feature-permission piggybacking and define intended independent lanes
- Covers:
  - calendar
  - personnel
  - training
  - critical tasks
  - onboarding
  - rating scheme
  - Leader's Book as a transitional compatibility lane, not a durable first-class lane
  - governance and platform concerns outside the feature-lane taxonomy

### ADR-04 Leaders Book And Rating Scheme Boundary

- Status:
  - Accepted in [ADR 0003](adrs/0003-leaders-book-and-rating-scheme-boundary.md)
- Why:
  - this area is active but architecturally blurry
- Covers:
  - what belongs to leaders-book
  - what belongs to rating scheme
  - nav visibility versus feature existence
  - permission ownership
  - future reminder: revisit whether the remade `Leader's Book` re-enters the durable lane taxonomy once its rebuilt shape is real

### ADR-05 Demo And Sandbox Decommissioning

- Status:
  - Accepted in [ADR 0005](adrs/0005-demo-and-sandbox-decommissioning.md)
- Why:
  - demo/sandbox code should stop shaping the main architecture
- Should cover:
  - staged removal strategy
  - temporary containment rules
  - service-role implications
  - completed runtime-route removal
  - when schema, RPC, grant, and seed cleanup can happen after production migration coordination is explicit

### ADR-06 Legacy Terminology Compatibility Policy

- Status:
  - Accepted in [ADR 0006](adrs/0006-legacy-terminology-compatibility-policy.md)
- Why:
  - clinic-era names still exist and need a consistent migration policy
  - issue `#624` applies the first doc-and-copy cleanup wave without renaming runtime or schema fields
- Should cover:
  - current compatibility names
  - preferred canonical language
  - how and where aliases are tolerated
  - when the generic label `Role` is too ambiguous and must become `Duty Role`
