# ADR 0003: Leaders Book And Rating Scheme Boundary

Status: Accepted
Date: 2026-04-22

## Context

### Current-state truth

- Rating Scheme is active and user-visible today through the Evals route. At decision time, it was still presented through the Personnel page.
- The `rating_scheme_entries` model already stores evaluation-tracking records for rated individuals, including eval type, rating chain participants, rating period dates, report type, workflow status, and notes.
- At decision time, the runtime permission path was contradictory:
  - `src/routes/org/[orgId]/api/rating-scheme/+server.ts` still uses `permission: 'leaders-book'`
  - `src/lib/server/core/useCases/ratingSchemeEntryCrud.ts` still requires `requireEdit('personnel')`
- `Leader's Book` still exists in permissions, settings, help copy, dashboard links, exports, and plans, but the current `/leaders-book` route is hidden from primary navigation and redirects away while the remake is pending.
- Current `Leader's Book`-adjacent data models are counseling records and development goals.
- [ADR 0001](0001-v1-authorization-replacement-model.md) and [ADR 0002](0002-v1-feature-permission-lane-map.md) already settled that:
  - Rating Scheme is a durable first-class lane
  - `Leader's Book` remains a real transitional compatibility lane
  - temporary page placement does not define lane ownership

### Decision pressure

- Issue [#620](https://github.com/waffleflopper/trooptotask/issues/620) required a HITL decision slice that documents the current transitional reality honestly and settles the intended boundary before runtime remediation.
- Drift entry `D-04` could not be remediated safely while contributors still had to infer whether Rating Scheme belonged to `Personnel`, `Leader's Book`, or a blend of both.
- The repo also needed an explicit answer on how nav visibility, feature existence, and permission ownership relate during the current transition.

## Decision

- Rating Scheme owns evaluation-tracking records and workflows for rated individuals.
- Rating Scheme includes:
  - rating chain composition
  - rating period dates
  - eval and report type tracking
  - evaluation workflow status and follow-up notes
- `Leader's Book` owns counseling records, development goals, and the remade per-Soldier leader-reference or administrative surface.
- `Personnel` owns roster administration.
- Rating Scheme may use app-owned roster reference queries to resolve rated people and internal raters without borrowing Personnel lane ownership or requiring Personnel permission as a prerequisite.
- Rating Scheme and `Leader's Book` are independently grantable feature lanes. A member may have one without the other.
- During the current v1 transition, primary-nav visibility does not define feature existence or lane ownership:
  - `Leader's Book` remains real current-state compatibility surface area even while hidden from nav
  - Rating Scheme remains real and independently grantable even if temporarily nested inside another surface
- `Leader's Book` remains outside the current durable first-class lane map while the remake is still being defined.
- A later ADR or equivalent design review may revisit whether the remade `Leader's Book` re-enters the durable lane taxonomy once its rebuilt shape is real enough to evaluate.
- At acceptance time, this decision slice did not change runtime permission enforcement. Those `leaders-book` and `personnel` couplings were later removed by issue [#627](https://github.com/waffleflopper/trooptotask/issues/627) without changing the approved record boundary.

## Rejected Or Deferred Alternatives

- Treat the current Personnel page placement as proof that Personnel owns Rating Scheme.
  - Rejected because temporary screen nesting does not define lane ownership.
- Treat current `leaders-book` route guards and permission booleans as proof that `Leader's Book` owns Rating Scheme.
  - Rejected because current compatibility wiring is transitional drift, not intended permission precedent.
- Require Personnel permission as a prerequisite for Rating Scheme because Rating Scheme references roster data.
  - Rejected because roster administration and roster reference access are different boundaries.
- Treat hidden primary navigation as proof that `Leader's Book` no longer exists.
  - Rejected because the route is hidden during redesign, but the feature remains real compatibility surface area in permissions, help, settings, exports, and plans.
- Put `Leader's Book` back into the current durable first-class lane map now.
  - Deferred because the remade `Leader's Book` shape is not settled enough yet; that promotion should happen in a later ADR if the rebuilt feature warrants it.

## Guardrails And Exceptions

- Do not treat current Personnel-page placement or `Leader's Book` compatibility wiring as permission precedent for Rating Scheme.
- Do not deepen cross-feature permission borrowing between Rating Scheme, Personnel, and `Leader's Book`.
- Do not describe `Leader's Book` as already removed.
- Do not silently promote the remade `Leader's Book` into the durable lane taxonomy without a later explicit decision.
- At acceptance time, temporary runtime tolerances remained allowed:
  - `src/routes/org/[orgId]/api/rating-scheme/+server.ts` still enters through `leaders-book`
  - `src/lib/server/core/useCases/ratingSchemeEntryCrud.ts` still enforces `personnel`
- Follow-up implementation had to move Rating Scheme onto its own lane without changing the approved record boundary.

## Consequences

- Expected benefits:
  - contributors no longer need to infer the Rating Scheme boundary from contradictory code
  - future authz and UI work can treat Rating Scheme as independently grantable from both Personnel and `Leader's Book`
  - `Leader's Book` can remain honestly documented as a real but transitional surface during the remake
- Tradeoffs:
  - the repo temporarily carried contradictory runtime checks until the implementation slice landed in `#627`
  - primary-nav visibility remains a transitional exception rather than a stable proxy for lane existence today
- New risks or migration costs:
  - follow-up work must introduce app-owned roster reference queries cleanly instead of re-borrowing Personnel access
  - a later review is still needed once the remade `Leader's Book` is concrete enough to reconsider durable lane taxonomy and nav parity

## Rollout And Follow-Up

- This decision slice did not implement runtime boundary changes directly.
- Implementation slice issue [#627](https://github.com/waffleflopper/trooptotask/issues/627) landed on 2026-04-23 and moved Rating Scheme onto its approved runtime lane while preserving the boundary documented here.
  - route/auth entry, CRUD enforcement, membership and invitation booleans, and RLS-backed scoped record checks now use the dedicated `rating-scheme` lane
  - rating-scheme-only members can use the first-class Evals route so Personnel access is not a prerequisite
- Follow-up design work after the remake is real:
  - decide whether the remade `Leader's Book` re-enters the durable first-class lane map
- Docs updated with this ADR:
  - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
  - `docs/architecture/DRIFT_LEDGER.md`
  - `docs/architecture/V1_CHANGE_INTENT.md`
  - `docs/architecture/ADR_BACKLOG.md`
  - `UBIQUITOUS_LANGUAGE.md`

## Links

- Related issue:
  - [#620](https://github.com/waffleflopper/trooptotask/issues/620)
- Related drift IDs:
  - `D-01`
  - `D-04`
- Related ADRs:
  - [ADR 0001](0001-v1-authorization-replacement-model.md)
  - [ADR 0002](0002-v1-feature-permission-lane-map.md)
- Related docs:
  - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
  - `docs/architecture/DRIFT_LEDGER.md`
  - `docs/architecture/V1_CHANGE_INTENT.md`
  - `docs/architecture/ADR_BACKLOG.md`
  - `UBIQUITOUS_LANGUAGE.md`
