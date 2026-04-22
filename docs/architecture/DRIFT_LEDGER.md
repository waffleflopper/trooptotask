# V1 Drift Ledger

This ledger records places where current v1 reality and intended v1 direction diverge.

Each entry separates:

- what exists today
- what we want instead
- why the gap matters
- how contributors should behave until remediation lands

## D-01 Authorization Model

- Current-state truth:
  - membership role is `owner`, `admin`, or `member`
  - access is primarily expressed as per-feature booleans plus optional `scoped_group_id`
  - UI presets and derived labels are convenience shapes over that model
  - platform admin uses a separate role system outside organization-membership authz
- Intended direction:
  - keep `owner`, `admin`, and `member` as the fixed organization-governance roles
  - model member access as an assigned preset plus per-feature capability map, shared scope set, and explicit policy overlays
  - use `Viewer`, `Operator`, and `Editor` as the starter member presets
  - use per-lane capability levels of `none`, `view`, `operate`, and `configure`
  - preserve preset lineage and explicit overrides for auditability
- Why this matters:
  - the current model is harder to audit, explain, evolve, and decouple from coarse early assumptions
  - hidden partial-admin behavior and reverse-engineered labels would make the replacement model harder to trust
- Guardrail until fixed:
  - document the current model honestly, but do not deepen it by accident
  - do not invent partial-admin member shapes or per-feature scope matrices
- Recommended next slice:
  - staged implementation of the approved member-access model while preserving initial single-group compatibility

## D-02 Provider-Boundary Leaks

- Current-state truth:
  - many server paths already use ports, adapters, entities, and use cases
  - multiple non-adapter routes still depend directly on `locals.supabase`
- Intended direction:
  - outside auth and adapter edges, business logic should be provider-agnostic
- Why this matters:
  - database-provider changes should not require feature and route rewrites
- Guardrail until fixed:
  - do not add new direct provider business logic outside approved remediation
- Recommended next slice:
  - isolate the biggest `locals.supabase` clusters behind app-owned use cases and adapters

## D-03 Critical Tasks Permission Coupling

- Current-state truth:
  - Critical Tasks is a real feature surface
  - its current permission lane still rides Training
- Intended direction:
  - Critical Tasks becomes its own first-class feature lane in the approved member capability map
- Why this matters:
  - feature ownership and authz auditability stay muddy while one feature borrows another feature's lane
- Guardrail until fixed:
  - treat the coupling as drift, not precedent
- Recommended next slice:
  - implement the approved Critical Tasks lane first, without re-borrowing Training or waiting on the Rating Scheme boundary review

## D-04 Rating Scheme And Leaders Book Coupling

- Current-state truth:
  - Rating Scheme is active
  - it currently renders inside the Personnel page
  - its route shell still uses the Leaders Book lane while core CRUD currently enforces Personnel edit access
  - Leaders Book still exists in permissions, help, exports, and plans
  - the main navigation currently hides Leaders Book during redesign
- Intended direction:
  - Rating Scheme becomes its own first-class lane in the approved member capability map and should be independently grantable from Personnel
  - temporary screen placement does not define lane ownership
  - Leaders Book remains a documented transitional compatibility lane while its remake is pending, and it is not part of the durable first-class lane map
  - a dedicated follow-up slice should still settle the exact records and ownership boundary between Rating Scheme and Leader's Book
- Why this matters:
  - boundary confusion leaks into permissions, exports, copy, and remediation planning
- Guardrail until fixed:
  - document the overlap explicitly; do not treat it as a clean feature boundary
- Recommended next slice:
  - after the Critical Tasks lane split, complete the Leaders Book remake boundary review, then implement Rating Scheme lane remediation against that decision

## D-05 Legacy Clinic Vocabulary

- Current-state truth:
  - legacy clinic-specific names such as `clinicRole` still exist in schema and code
- Intended direction:
  - Army/military-oriented canonical terminology in docs, UX copy, and new abstractions
- Why this matters:
  - old names distort domain understanding and make new design decisions noisier
- Guardrail until fixed:
  - preserve compatibility, but prefer canonical military language in forward-looking material
- Recommended next slice:
  - terminology migration plan with compatibility strategy

## D-06 Demo And Sandbox Paths

- Current-state truth:
  - demo and sandbox behavior still exists in routes, bootstrap logic, schema, and cleanup paths
- Intended direction:
  - clear deprecation path and eventual removal
- Why this matters:
  - demo-specific logic creates exceptional paths and service-role shortcuts that should not shape the main architecture
- Guardrail until fixed:
  - do not expand or deepen demo/sandbox behavior
- Recommended next slice:
  - demo/sandbox removal or isolation plan

## D-07 Large Orchestration Modules

- Current-state truth:
  - several page contexts, views, and flows are large coordination-heavy modules
- Intended direction:
  - deeper modules with thinner public interfaces
- Why this matters:
  - large orchestration surfaces are harder to test, reason about, and safely change
- Guardrail until fixed:
  - use explicit architecture-review slices for deepening instead of incidental churn
- Recommended next slice:
  - prioritized deep-module reviews using `improve-codebase-architecture`

## D-08 Route-Level Membership And Settings Logic

- Current-state truth:
  - dashboard, organization creation, and organization settings still contain direct route-level membership and invitation logic
- Intended direction:
  - app-owned use cases and cleaner boundaries for membership, invitation, and organization-administration flows
- Why this matters:
  - these are high-risk seams where authz, provider ownership, and product rules overlap
- Guardrail until fixed:
  - do not copy those shapes into new surfaces
- Recommended next slice:
  - membership and org-administration boundary review

## D-09 Missing Repo Governance Automation

- Current-state truth:
  - CI enforces format, lint, governance baseline checks, check, and test
  - a lightweight governance baseline check now exists for route-level provider leaks and known permission-lane couplings
  - issue templates and ADR guidance now exist for retrofit slicing and drift capture
  - there is still no comprehensive architecture-fitness suite
- Intended direction:
  - CI and template support that reinforces the repo's architecture and governance rules
- Why this matters:
  - architecture becomes guidance by prose alone unless it is reinforced operationally
- Guardrail until fixed:
  - use the baseline check to prevent new undocumented exceptions, but do not pretend it proves architectural correctness
- Recommended next slice:
  - deepen the checks once the first authz and provider-boundary remediation slices settle the target shape
