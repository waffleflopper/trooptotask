# ADR 0002: V1 Feature Permission Lane Map

Status: Accepted
Date: 2026-04-21

## Context

### Current-state truth

- The current runtime route and auth contract still exposes coarse feature lanes.
- Membership booleans, current presets, and permission-aware UI still reflect that coarse lane set.
- Critical Tasks is already a real feature surface, but its permission enforcement still borrows the Training lane across routes, entities, use cases, and RLS.
- Rating Scheme is already active and user-visible, but did not yet have a dedicated permission lane.
- Governance concerns are already partially modeled outside feature lanes in current code through fixed membership roles plus route-level concepts such as `manageMembers`, `privileged`, and `owner`.

### Decision pressure

- Issue [#615](https://github.com/waffleflopper/trooptotask/issues/615) requires a durable lane map so later implementation slices stop inventing feature ownership on the fly.
- ADR 0001 already approved the replacement authorization model and named intended first-class lanes, but this repo still needed a dedicated artifact that clarifies lane ownership and remediation order.
- Drift entry `D-03` needs a stable target before runtime remediation slices can proceed safely.

## Decision

- The durable first-class v1 feature lanes are:
  - `calendar`
  - `personnel`
  - `training`
  - `critical-tasks`
  - `onboarding`
  - `rating-scheme`
- This lane map covers product feature surfaces only.
- Governance and policy concerns remain outside the feature-lane map, including:
  - member management
  - organization settings governance
  - billing control
  - destructive organization-danger operations
  - platform-admin concerns
- Temporary route, page, or screen placement does not define durable lane ownership.
- `Critical Tasks` owns its own durable lane and must stop borrowing `training`.
- `Rating Scheme` owns its own durable lane even if UI placement changes during migration.
- `Rating Scheme` should be independently grantable from `Personnel` in the approved member-access model.
- Approved remediation order is:
  - implement the Critical Tasks lane split first, because its target ownership is already settled
  - move Rating Scheme runtime enforcement onto its own lane

## Rejected Or Deferred Alternatives

- Treat temporary page placement as the source of lane ownership.
  - Rejected because route and screen nesting are implementation details and would freeze current drift into architecture.
- Keep Rating Scheme under the Personnel lane because it currently renders inside the Personnel page.
  - Rejected because that would preserve the same piggybacking this ADR is meant to eliminate.
- Model governance, billing, or member-management concerns as additional feature lanes.
  - Rejected because those concerns belong to fixed governance roles and policy overlays, not the feature capability map.

## Guardrails And Exceptions

- Do not implement runtime lane changes in this decision slice.
- Do not infer durable lane ownership from current page placement, help copy, or compatibility routes.
- Do not add new feature-permission piggybacking.
- Current Training-lane coupling for Critical Tasks remains temporarily tolerated only until issue `#621` removes it.

## Consequences

- Expected benefits:
  - future remediation slices now have a stable source of truth for feature ownership
  - Critical Tasks can move immediately
  - Rating Scheme no longer inherits long-term ownership from accidental Personnel placement
  - governance concerns stay separated from feature capabilities
- New risks or migration costs:
  - follow-up slices must keep docs and runtime aligned as each coupling is removed
  - permission UI, preset migration, and storage changes still need careful staging against the approved lane map

## Rollout And Follow-Up

- Do not implement runtime changes in this ADR slice.
- Follow-up sequence:
  - issue `#621` to move Critical Tasks onto its approved lane
  - issue `#627` to move Rating Scheme onto its approved runtime lane boundary
- Later authz and preset work should treat this lane map as the durable taxonomy for member capability design.

## Links

- Related issue: [#615](https://github.com/waffleflopper/trooptotask/issues/615)
- Related drift IDs: `D-01`, `D-03`
- Related ADRs:
  - [ADR 0001](0001-v1-authorization-replacement-model.md)
- Related docs:
  - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
  - `docs/architecture/DRIFT_LEDGER.md`
  - `docs/architecture/V1_CHANGE_INTENT.md`
  - `docs/architecture/ADR_BACKLOG.md`
  - `UBIQUITOUS_LANGUAGE.md`
