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

## D-03 Critical Tasks Permission Coupling (Resolved In #621)

- Current-state truth:
  - Critical Tasks now owns its own first-class v1 permission lane across route guards, membership booleans, invitation flows, and RLS
- Why this mattered:
  - the earlier Training piggyback made feature ownership and authz audits harder to explain
- Guardrail going forward:
  - do not re-borrow the Training lane for Critical Tasks behavior, exports, or route access

## D-04 Rating Scheme And Leaders Book Coupling

- Current-state truth:
  - Rating Scheme is active
  - its record model already represents evaluation-tracking records rather than counseling or development-goal records
  - it currently renders inside the Personnel page
  - its route shell still uses the Leaders Book lane while core CRUD currently enforces Personnel edit access
  - `Leader's Book` still exists in permissions, help, dashboard links, exports, settings, and plans
  - the main navigation currently hides `Leader's Book` during redesign and the route redirects away
- Intended direction:
  - Rating Scheme owns evaluation-tracking records and workflows and remains its own first-class lane
  - Rating Scheme should be independently grantable from both `Personnel` and `Leader's Book`
  - `Personnel` owns roster administration, but Rating Scheme may use app-owned roster reference queries without inheriting Personnel lane ownership
  - temporary screen placement and current nav visibility do not define lane ownership during the current transition
  - `Leader's Book` remains a real documented transitional compatibility lane for counseling records, development goals, and the future per-Soldier leader-reference or administrative surface while its remake is pending
  - `Leader's Book` is not part of the current durable first-class lane map; a later ADR may revisit that once the rebuilt feature is real enough to evaluate
- Why this matters:
  - boundary confusion leaks into permissions, exports, copy, and remediation planning
- Guardrail until fixed:
  - document the overlap and the approved record boundary explicitly; do not treat current Personnel-page placement or `Leader's Book` compatibility wiring as permission precedent
- Recommended next slice:
  - implement Rating Scheme runtime lane remediation against the approved `#620` boundary in `#627`, then revisit nav parity and remade `Leader's Book` lane taxonomy in a later decision slice

## D-05 Legacy Clinic Vocabulary

- Current-state truth:
  - legacy clinic-specific names such as `clinicRole` still exist in schema and code
  - some UX surfaces still expose that field as `clinic role` or the ambiguous generic label `Role`
- Intended direction:
  - Army/military-oriented canonical terminology in docs, UX copy, exports, import templates, and new abstractions
  - `Duty Role` is the user-facing canonical term for the legacy `clinicRole` / `clinic_role` field until a deliberate migration changes the runtime shape
- Why this matters:
  - old names distort domain understanding and make new design decisions noisier
  - the bare label `Role` is easy to confuse with membership roles and admin roles
- Guardrail until fixed:
  - preserve compatibility field names until an explicit migration slice authorizes more
  - do not introduce new user-facing `clinic role` copy or bare `Role` labels when the field really means `Duty Role`
- Recommended next slice:
  - runtime abstraction and migration plan once a repo-wide rename is explicitly approved

## D-06 Demo And Sandbox Paths

- Current-state truth:
  - `/demo` already fails closed, but demo cookies and sandbox cookies still influence normal `/org/*` request handling
  - `src/hooks.server.ts` still bypasses the unauthenticated org-route redirect when legacy demo cookies are present
  - `src/routes/api/create-demo-sandbox/+server.ts` now fails closed, so runtime sandbox creation no longer has a live public caller even though the schema and RPC still exist
  - `src/lib/server/adapters/supabaseOrgShell.ts`, `src/lib/server/supabase.ts`, `src/lib/server/adapters/httpAdapter.ts`, and `src/lib/server/adapters/supabaseAuthContext.ts` still manufacture demo/sandbox access without a real membership row
  - `src/routes/api/cleanup-demo-sandboxes/+server.ts` still keeps sandbox cleanup on a separate exceptional path
- Intended direction:
  - contain the remaining demo/sandbox exceptions so they no longer shape ordinary auth, org-shell, or provider-boundary decisions
  - stage removal rather than reworking demo access into a deeper supported architecture
- Why this matters:
  - cookie-driven gateway bypasses and no-op auth contexts can look like architecture options when they are actually deprecated exceptions
  - remaining service-role cleanup and schema-level sandbox paths still widen the blast radius of demo-only logic until removal lands
- Guardrail until fixed:
  - do not expand or deepen demo/sandbox behavior
  - do not add new demo/sandbox cookies, no-op auth contexts, or public service-role bootstrap paths
  - keep the remaining high-risk exceptions explicitly documented in `docs/architecture/GOVERNANCE_BASELINE.json`
  - keep standalone sandbox bootstrap disabled rather than rebuilding it into a supported trial or provisioning flow
- Recommended next slice:
  - issue `#625` applies stage 1 containment: disable standalone sandbox bootstrap, baseline-govern the remaining exceptions, and document the staged removal order
  - follow with a dedicated removal slice to delete cookie-driven org-shell/auth bypasses and retire `/demo`
  - then remove demo/sandbox schema fields, RPCs, and cleanup jobs after no runtime path depends on them

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
  - organization creation bootstrap now runs through an app-owned provisioning use case and Supabase adapter in `#618` while preserving the current default seeds and owner bootstrap behavior
  - dashboard invitation acceptance and membership creation moved behind an app-owned use case and adapter in `#616`
  - org settings invitation create/delete, member removal, and permission updates moved behind an app-owned use case and adapter in `#617`
  - org settings ownership transfer and delete flows moved behind an app-owned use case and Supabase adapter in `#626`
  - organization settings still keeps organization rename in route-local provider orchestration
- Intended direction:
  - app-owned use cases and cleaner boundaries for membership, invitation, and organization-administration flows
- Why this matters:
  - these are high-risk seams where authz, provider ownership, and product rules overlap
- Guardrail until fixed:
  - do not copy those shapes into new surfaces
- Recommended next slice:
  - move organization rename behind an app-owned boundary in organization settings

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
