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

- Why:
  - make provider ownership explicit so business logic no longer leaks direct Supabase usage outside approved edges
- Should cover:
  - what counts as an adapter
  - what auth is allowed to remain provider-specific
  - what code must be provider-agnostic

### ADR-03 Feature Permission Lane Map

- Why:
  - stop feature-permission piggybacking and define intended independent lanes
- Should cover:
  - calendar
  - personnel
  - training
  - critical tasks
  - onboarding
  - leaders-book
  - rating scheme
  - admin/platform concerns

### ADR-04 Leaders Book And Rating Scheme Boundary

- Why:
  - this area is active but architecturally blurry
- Should cover:
  - what belongs to leaders-book
  - what belongs to rating scheme
  - nav visibility versus feature existence
  - permission ownership

### ADR-05 Demo And Sandbox Decommissioning

- Why:
  - demo/sandbox code should stop shaping the main architecture
- Should cover:
  - removal strategy
  - temporary containment rules
  - service-role implications

### ADR-06 Legacy Terminology Compatibility Policy

- Why:
  - clinic-era names still exist and need a consistent migration policy
- Should cover:
  - current compatibility names
  - preferred canonical language
  - how and where aliases are tolerated
