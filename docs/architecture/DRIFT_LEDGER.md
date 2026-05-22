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
  - migrated Policy Decision workflows now use stored member presets, capability overrides, and shared scope sets as their active runtime inputs
  - per-feature booleans plus optional `scoped_group_id` remain only as compatibility inputs for explicitly unmigrated flows and older membership rows
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
  - do not reintroduce legacy permission flags or `scoped_group_id` as active authorization checks for migrated Policy Decision workflows
- Recommended next slice:
  - after the Organization Settings member-access command slice lands, re-run `improve-codebase-architecture` on the member-access storage deletion seam: verify stored preset backfill completion, isolate or delete the remaining compatibility adapter, remove legacy permission booleans and `scoped_group_id` from active code paths, and plan database-column removal through the normal migration/release process

## D-02 Provider-Boundary Leaks

- Current-state truth:
  - many server paths already use ports, adapters, entities, and use cases
  - billing organization-state reads and writes plus the shared export-record lifecycle now run through app-owned store-backed helpers in `#619`
  - billing cancellation now acknowledges successful Stripe cancellation even if the immediate local organization reset fails, relying on the existing Stripe deleted-subscription webhook as the documented reconciliation path in `#637`
  - multiple non-adapter routes still depend directly on `locals.supabase`, especially admin/platform operations and some layout helpers
- Intended direction:
  - outside auth and adapter edges, business logic should be provider-agnostic
- Why this matters:
  - database-provider changes should not require feature and route rewrites
- Guardrail until fixed:
  - do not add new direct provider business logic outside approved remediation
- Recommended next slice:
  - isolate the remaining admin/platform `locals.supabase` clusters behind app-owned use cases and adapters

## D-03 Critical Tasks Permission Coupling (Resolved In #621)

- Current-state truth:
  - Critical Tasks now owns its own first-class v1 permission lane across route guards, membership booleans, invitation flows, and RLS
- Why this mattered:
  - the earlier Training piggyback made feature ownership and authz audits harder to explain
- Guardrail going forward:
  - do not re-borrow the Training lane for Critical Tasks behavior, exports, or route access

## D-04 Rating Scheme And Leaders Book Coupling (Resolved In #627)

- Current-state truth:
  - Rating Scheme is active
  - its record model already represents evaluation-tracking records rather than counseling or development-goal records
  - it now uses its own dedicated lane across route guards, CRUD, membership and invitation booleans, and scoped RLS checks
  - it now renders through the first-class Evals primary nav route, without requiring Personnel access
  - `Leader's Book` still exists in permissions, help, dashboard links, exports, settings, and plans
  - the main navigation currently hides `Leader's Book` during redesign and the route redirects away
  - `#765` policy-converted remaining supported `Leader's Book` compatibility authorization with explicit Policy Decision actions and a separate compatibility lane map
- Intended direction:
  - Rating Scheme owns evaluation-tracking records and workflows and remains its own first-class lane
  - Rating Scheme should be independently grantable from both `Personnel` and `Leader's Book`
  - `Personnel` owns roster administration, but Rating Scheme may use app-owned roster reference queries without inheriting Personnel lane ownership
  - temporary screen placement and current nav visibility do not define lane ownership during the current transition
  - `Leader's Book` remains a real documented transitional compatibility lane for counseling records, development goals, and the future per-Soldier leader-reference or administrative surface while its remake is pending
  - `Leader's Book` is not part of the current durable first-class lane map; a later ADR may revisit that once the rebuilt feature is real enough to evaluate
  - `Leader's Book` compatibility Policy Decisions must stay outside the durable preset taxonomy until that future decision is made
- Why this matters:
  - boundary confusion leaks into permissions, exports, copy, and remediation planning
- Guardrail going forward:
  - do not re-borrow the Personnel or `Leader's Book` lanes for Rating Scheme access; route placement and nav treatment still do not define lane ownership
  - do not add hidden `Leader's Book` runtime authorization checks through `isFullEditor`, `requireFullEditor`, or feature edit flags; use the explicit compatibility Policy Decision actions
- Recommended next slice:
  - revisit whether the remade `Leader's Book` re-enters the durable lane taxonomy once that rebuilt feature is concrete enough to evaluate

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
  - Runtime demo and sandbox entrypoints have been removed: `/demo`, `/api/create-demo-sandbox`, and `/api/cleanup-demo-sandboxes` no longer exist as SvelteKit routes.
  - Legacy demo cookies no longer influence unauthenticated `/org/*` routing, org-shell loading, API context creation, Supabase client selection, or auth-context creation.
  - The no-op sandbox auth context and in-memory demo org-shell request path have been removed.
  - Migration `20260514000100_remove_demo_sandbox_schema.sql` removes `demo_type`, `demo_expires_at`, `create_demo_sandbox`, and `cleanup_expired_demo_sandboxes` from the current schema.
  - Historical migration snapshots still contain the old demo/sandbox objects for audit history only.
- Intended direction:
  - keep runtime behavior fully membership-backed
  - remove remaining schema/RPC support through a dedicated database-coordination slice when production migration timing is explicit
- Why this matters:
  - demo/sandbox bypasses should no longer look like an architecture option for ordinary auth, org-shell, provider-boundary, or feature work
  - applying the schema-level cleanup still needs normal production migration coordination
- Guardrail until fixed:
  - do not expand or deepen demo/sandbox behavior
  - do not add new demo/sandbox cookies, no-op auth contexts, public service-role bootstrap paths, or replacement compatibility shims
  - do not use historical demo/sandbox schema residue as precedent for runtime access
- Recommended next slice:
  - coordinate applying `20260514000100_remove_demo_sandbox_schema.sql` to production through the normal release process

## D-07 Large Orchestration Modules

- Current-state truth:
  - several page contexts, views, and flows are large coordination-heavy modules
  - the dashboard client surface now has a feature-owned read-model boundary that centralizes hydrated-store joins, grouping preferences, and tab-facing display rows while leaving existing route/provider/authz boundaries unchanged
  - the calendar page now has a feature-owned range coordinator for client-side range expansion, store merging, retry state, and advanced duty event hydration
  - the duty-roster page now keeps advanced-duty template normalization and applied-duty timeline collection rules behind a feature-owned module
- Intended direction:
  - deeper modules with thinner public interfaces
- Why this matters:
  - large orchestration surfaces are harder to test, reason about, and safely change
- Guardrail until fixed:
  - use explicit architecture-review slices for deepening instead of incidental churn
- Recommended next slice:
  - continue prioritized deep-module reviews using `improve-codebase-architecture`, especially for remaining calendar, duty-roster, personnel, and training orchestration seams; the current calendar and duty-roster helpers reduce D-07 but do not resolve it

## D-08 Route-Level Membership And Settings Logic (Resolved For Org Settings Governance)

- Current-state truth:
  - organization creation bootstrap now runs through an app-owned provisioning use case and Supabase adapter in `#618` while preserving the current default seeds and owner bootstrap behavior
  - dashboard invitation acceptance and membership creation moved behind an app-owned use case and adapter in `#616`
  - org settings invitation create/delete, member removal, and permission updates moved behind an app-owned use case and adapter in `#617`
  - org settings ownership transfer and delete flows moved behind an app-owned use case and Supabase adapter in `#626`
  - organization settings rename moved behind an app-owned use case and Supabase adapter in this architecture deepening slice
  - organization governance pages now live under `/org/[orgId]/settings/*`; legacy `/org/[orgId]/admin/*` organization URLs redirect to those settings subroutes
- Intended direction:
  - app-owned use cases and cleaner boundaries for membership, invitation, and organization-administration flows
- Why this matters:
  - these are high-risk seams where authz, provider ownership, and product rules overlap
- Guardrail until fixed:
  - do not copy those shapes into new surfaces
- Recommended next slice:
  - keep any future organization-governance additions under `/org/[orgId]/settings/*` and behind app-owned use cases/adapters when they perform business work

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
