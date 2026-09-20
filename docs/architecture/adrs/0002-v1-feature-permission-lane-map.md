# ADR 0002: V1 Feature Permission Lane Map

Status: Accepted
Date: 2026-04-21

## Context

### Current-state truth

- Runtime authorization uses fixed membership roles plus per-lane member capabilities.
- Critical Tasks and Rating Scheme are real feature surfaces with dedicated permission lanes.
- Governance concerns are modeled outside feature lanes through fixed membership roles and policy overlays.

### Decision pressure

- Issue [#615](https://github.com/waffleflopper/trooptotask/issues/615) requires a durable lane map so later implementation slices stop inventing feature ownership on the fly.
- ADR 0001 approved the authorization model and named first-class lanes; this ADR keeps lane ownership explicit.
- Drift entry `D-03` needed a stable target before runtime remediation slices could proceed safely.

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
  - destructive organization-danger operations
  - platform-admin concerns
- Temporary route, page, or screen placement does not define durable lane ownership.
- `Critical Tasks` owns its own durable lane.
- `Rating Scheme` owns its own durable lane even if UI placement changes.
- `Rating Scheme` should be independently grantable from `Personnel` in the approved member-access model.
- Approved remediation order is:
  - implement the Critical Tasks lane split first, because its target ownership is already settled
  - move Rating Scheme runtime enforcement onto its own lane

## Rejected Or Deferred Alternatives

- Treat temporary page placement as the source of lane ownership.
  - Rejected because route and screen nesting are implementation details and would freeze current drift into architecture.
- Keep Rating Scheme under the Personnel lane because it currently renders inside the Personnel page.
  - Rejected because that would preserve the same piggybacking this ADR is meant to eliminate.
- Model governance or member-management concerns as additional feature lanes.
  - Rejected because those concerns belong to fixed governance roles and policy overlays, not the feature capability map.

## Guardrails And Exceptions

- Do not implement runtime lane changes in this decision slice.
- Do not infer durable lane ownership from current page placement or help copy.
- Do not add new feature-permission piggybacking.

## Consequences

- Expected benefits:
  - future remediation slices now have a stable source of truth for feature ownership
  - Critical Tasks can move immediately
  - Rating Scheme no longer inherits long-term ownership from accidental Personnel placement
  - governance concerns stay separated from feature capabilities
- New risks or migration costs:
  - follow-up slices must keep docs and runtime aligned as feature surfaces evolve
  - permission UI and preset behavior still need stewardship against the approved lane map

## Rollout And Follow-Up

- Later authz and preset work should treat this lane map as the durable taxonomy for member capability design.

## Links

- Related issue: [#615](https://github.com/waffleflopper/trooptotask/issues/615)
- Related drift IDs: `D-03`
- Related ADRs:
  - [ADR 0001](0001-v1-authorization-replacement-model.md)
- Related docs:
  - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
  - `docs/architecture/DRIFT_LEDGER.md`
  - `docs/architecture/V1_CHANGE_INTENT.md`
  - `docs/architecture/ADR_BACKLOG.md`
  - `UBIQUITOUS_LANGUAGE.md`
