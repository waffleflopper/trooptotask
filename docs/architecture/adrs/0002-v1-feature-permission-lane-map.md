# ADR 0002: V1 Feature Permission Lane Map

Status: Accepted
Date: 2026-04-21

## Context

### Current-state truth

- The current runtime route and auth contract still exposes only these coarse feature lanes:
  - `calendar`
  - `personnel`
  - `training`
  - `onboarding`
  - `leaders-book`
- Membership booleans, current presets, and permission-aware UI still reflect that coarse lane set.
- Critical Tasks is already a real feature surface, but its permission enforcement still borrows the Training lane across routes, entities, use cases, and RLS.
- Rating Scheme is already active and user-visible, but its current permission wiring is split:
  - the page view currently lives inside Personnel
  - the API route shell still enters through the Leaders Book lane
  - the core CRUD use case still enforces Personnel edit access
- Leader's Book is hidden from primary navigation during redesign, but it still exists in permissions, help copy, exports, plans, and compatibility paths.
- Governance concerns are already partially modeled outside feature lanes in current code through fixed membership roles plus route-level concepts such as `manageMembers`, `privileged`, and `owner`.

### Decision pressure

- Issue [#615](https://github.com/waffleflopper/trooptotask/issues/615) requires a durable lane map so later implementation slices stop inventing feature ownership on the fly.
- ADR 0001 already approved the replacement authorization model and named intended first-class lanes, but this repo still needed a dedicated artifact that clarifies lane ownership, transitional compatibility, and remediation order.
- Drift entries `D-03` and `D-04` need a stable target before runtime remediation slices can proceed safely.

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
- `Leader's Book` remains a documented transitional compatibility lane while its remake is pending.
- `Leader's Book` is not part of the durable first-class lane map and must not shape long-term preset taxonomy more than necessary.
- Temporary route, page, or screen placement does not define durable lane ownership.
- `Critical Tasks` owns its own durable lane and must stop borrowing `training`.
- `Rating Scheme` owns its own durable lane even if UI placement changes during migration.
- `Rating Scheme` should be independently grantable from `Personnel` in the approved member-access model.
- Current borrowed-lane behavior is migration drift only and must not be copied into new work.
- Approved remediation order is:
  - implement the Critical Tasks lane split first, because its target ownership is already settled
  - settle the Leader's Book versus Rating Scheme record boundary next
  - move Rating Scheme runtime enforcement onto its own lane after that boundary decision lands

## Rejected Or Deferred Alternatives

- Keep `Leader's Book` in the durable first-class lane map because current flags and route shells still reference it.
  - Rejected because that would let transitional compatibility wiring dictate the long-term authorization taxonomy.
- Treat temporary page placement as the source of lane ownership.
  - Rejected because route and screen nesting are implementation details and would freeze current drift into architecture.
- Keep Rating Scheme under the Personnel lane because it currently renders inside the Personnel page.
  - Rejected because that would preserve the same piggybacking this ADR is meant to eliminate.
- Model governance, billing, or member-management concerns as additional feature lanes.
  - Rejected because those concerns belong to fixed governance roles and policy overlays, not the feature capability map.
- Move Rating Scheme runtime lane remediation before the Leader's Book boundary slice.
  - Deferred because the durable permission owner is settled here, but the exact records and ownership boundary still need issue `#620`.

## Guardrails And Exceptions

- Do not implement runtime lane changes in this decision slice.
- Do not infer durable lane ownership from current page placement, help copy, or compatibility routes.
- Do not add new feature-permission piggybacking.
- Do not treat `Leader's Book` as a future preset dimension or durable first-class lane.
- Current `leaders-book` compatibility wiring remains temporarily tolerated until the dedicated boundary and remediation slices land.
- Current Training-lane coupling for Critical Tasks remains temporarily tolerated only until issue `#621` removes it.

## Consequences

- Expected benefits:
  - future remediation slices now have a stable source of truth for feature ownership
  - Critical Tasks can move immediately without waiting on the Rating Scheme boundary slice
  - Rating Scheme no longer inherits long-term ownership from accidental Personnel or Leader's Book placement
  - governance concerns stay separated from feature capabilities
- Tradeoffs:
  - the repo will temporarily carry a documented mismatch between the approved lane map and current runtime permission checks
  - Leader's Book remains visible in compatibility surfaces even though it is no longer part of the durable lane taxonomy
  - Rating Scheme still needs a separate boundary decision before runtime remediation can be implemented safely
- New risks or migration costs:
  - follow-up slices must keep docs and runtime aligned as each coupling is removed
  - permission UI, preset migration, and storage changes still need careful staging against the approved lane map

## Rollout And Follow-Up

- Do not implement runtime changes in this ADR slice.
- Follow-up sequence:
  - issue `#621` to move Critical Tasks onto its approved lane
  - issue `#620` to settle the Leader's Book versus Rating Scheme record boundary
  - issue `#627` to move Rating Scheme onto its approved runtime lane boundary
- Later authz and preset work should treat this lane map as the durable taxonomy for member capability design.
- Leader's Book compatibility paths can only be retired after the remake or replacement decision makes their remaining ownership explicit.

## Links

- Related issue: [#615](https://github.com/waffleflopper/trooptotask/issues/615)
- Related drift IDs: `D-01`, `D-03`, `D-04`
- Related ADRs:
  - [ADR 0001](0001-v1-authorization-replacement-model.md)
- Related docs:
  - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
  - `docs/architecture/DRIFT_LEDGER.md`
  - `docs/architecture/V1_CHANGE_INTENT.md`
  - `docs/architecture/ADR_BACKLOG.md`
  - `UBIQUITOUS_LANGUAGE.md`
