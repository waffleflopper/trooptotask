# V1 Architecture Contract

This document records what TroopToTask v1 is today, what guardrails we want contributors to follow going forward, and which contradictions are tolerated only until explicit remediation work lands.

This is a v1 document. It should describe the current SvelteKit repo honestly instead of forcing v2 assumptions onto it.

## Scope

- Applies to the current single-repo SvelteKit application under `src/`, `docs/`, `supabase/`, and `.github/`.
- Uses **`Organization`** and **`Group`** as canonical v1 product and data-model nouns.
- Treats v2 terms such as `Account`, `Unit`, and `Element` as migration vocabulary only, not present-tense v1 truth.

## Stabilization Decisions

The [stabilization baseline](../stabilization/BASELINE.md#retained-contracts) defines retained contracts R1–R8; [TODO](../stabilization/TODO.md) orders their bounded implementation tasks and [EVIDENCE](../stabilization/EVIDENCE.md) records acceptance. These decisions supersede older guidance that permits indefinite drift, billing-disabled infrastructure, Duty Roster hydration or unfinished migrations. Current-state descriptions below identify remaining work, not completed removals.

- Remove billing end to end: commercial models, providers, tiers, quotas, flags, configuration and active-schema objects. An unlimited-plan fallback, no-op billing module or future-billing scaffold does not satisfy removal.
- Remove Duty Roster runtime and active-schema objects, including generation, exports and Calendar duty hydration. Preserve R6 ordinary Calendar facts: availability, special days, types and persisted daily assignments with their identities, dates, assignees, scopes, edits, audit and export behavior. Preserve Personnel Duty Role and independent sign-in rosters. Data uncertainty blocks only the affected deletion; preserve stored facts and referenced types while resolving it.
- Remove the repository E2E harness, dependencies, configuration, reports, fixtures and application bypasses. Retain meaningful lower-level behavior tests and record computer-use flow evidence; do not create or run a replacement browser suite.
- Finish every declared architecture/UI cutover across implementation and consumers, with meaningful tests and deletion of replaced code, configuration and active docs. Legacy-path wrappers, compatibility facades, duplicate component systems and partial component migrations are not completion. Preserve applied SQL migration provenance while removing obsolete active objects through the owning schema task.
- Preserve R1 Organization tenancy, Group scope, roles, presets, capabilities, server authorization, RLS and independent feature permission lanes. Preserve R2–R4 reviewed acquisition, time-limited Account Setup Links, separate Organization Invitations and membership acceptance, and email-confirmed Organization/owner creation with retained defaults. Removing commercial gates must not open self-service signup or treat account setup as membership.
- Preserve R5 authentication, MFA, suspension, step-up, secure cookies, redirects, abuse limits, service-role/private-file restrictions and shell degradation behavior. Preserve R7 retained records, archive/restore, import/export, readiness, retention, audit and file/batch safety bounds.
- Correct the invitation-origin approval/rescind defect F01 deliberately under task **11-01**; billing removal does not resolve it. Preserve independent approvals, sibling Organization grants and existing accounts while testing issuance failure, renewal and concurrency.
- Keep database safeguards: never touch remote production data or schema; never reset or delete existing local tables without Robert's explicit permission. Schema verification uses only an isolated disposable local stack with synthetic data under the queue's DB contract. Explicit phase activation authorizes only the bounded tracker writes in the [issue workflow](../agents/issue-tracker.md). Git publication/merge, production/remote actions, live data and deployment remain separately protected.

Complete one ready task within the active child at a time, obey the [deliverable checkpoints](../agents/operating-rules.md#stabilization-tasks), and respect phase dependencies. Newly discovered in-scope work must receive a bounded queue entry before program closure. Reduce existing governance exceptions as their consumers are removed; do not add allowlists, weaken guards, skip tests, inflate budgets or hide scan paths.

## Current-State Truth

Password completion uses a server-persisted attempt at the existing auth-provider edge. Admission serializes each actor; a database trigger confirms the password and attempt atomically, and reconciliation fences uncertain writes before another attempt is allowed. Service-only RPCs expose no browser table privileges. The [authentication boundary](AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md#authentication-boundary) owns the provider transaction and migration requirements.

Organization suspension is enforced before dispatch of Organization writes and API requests by the authenticated request hook and a user-scoped provider adapter. Page GET/HEAD requests retain the suspended shell; layouts alone are not an action/endpoint authorization boundary. Membership, Group scope and feature policy checks remain mandatory downstream.

D03 removes commercial plans, read-only guards and overlays from server mutation policy, app-shell data and client affordances. Membership, capability, Group scope, identity ownership and sensitive-action step-up remain mandatory. The shell keeps explicit suspension and optional chrome failure states. Billing pages own their remaining commercial reads until D05; admin/provider removal remains D04/D05.

### Application shape

- TroopToTask v1 is a single SvelteKit app with one deployable product surface.
- `Organization` is both the v1 tenancy boundary and the main operational workspace boundary.
- `Group` is the v1 roster subdivision and the current scoping unit for restricted access.
- The main app lives under `src/routes/org/[orgId]`, with feature modules under `src/features/*` and shared primitives under `src/lib/*`.

### Frontend structure

- The repo already uses a meaningful route-shell pattern in many places:
  - route shells in `src/routes/**`
  - feature views, contexts, stores, and utilities in `src/features/*`
  - shared UI primitives in `src/lib/components/**` and `src/lib/components/ui/**`
- This pattern is real, but not uniformly deep. Several feature surfaces still have large orchestration-heavy files and mixed responsibilities.
- Notable orchestration hotspots today include calendar, personnel, dashboard, duty roster, training reports, and parts of onboarding and critical tasks.

### Server structure

- The repo already has an emerging app-owned backend shape:
  - use cases in `src/lib/server/core/useCases/*`
  - ports in `src/lib/server/core/ports.ts`
  - provider and transport adapters in `src/lib/server/adapters/*`
  - schema-first entities in `src/lib/server/entities/*`
  - route wrappers such as `handle()`, `entityHandlers()`, and `loadWithContext()`
- This architecture is not hypothetical. It is already the strongest part of the codebase and should be treated as the default direction for new server work.
- Route-local `locals.supabase` logic still exists in a number of places and remains tolerated only as legacy or transitional drift.

### Auth and authorization

- Authentication is Supabase Auth plus app-owned session, redirect, and MFA flow logic in route and server helpers.
- The current authorization model is:
  - persisted membership role: `owner`, `admin`, or `member`
  - stored member preset plus per-feature capability overrides
  - shared scope set storage
  - app-layer checks via `PermissionContext` / `AuthContext`
  - SQL helper functions and RLS policies in Supabase migrations
- Settings UI presets like `Viewer`, `Operator`, and `Editor` are shortcuts over the stored member-access model. They are not persisted domain roles.
- Current permission lanes still carry some historical complexity:
  - Critical Tasks now owns a dedicated permission lane
  - Rating Scheme now owns a dedicated permission lane across route guards, membership and invitation flags, RLS, and the first-class Evals route
  - Personnel now owns the surviving per-Soldier counseling, notes, follow-up, and document workflows

### Provider ownership

- The intended provider boundary is only partially achieved today.
- Many server flows already go through ports and adapters.
- Direct provider coupling still exists in route and utility code, especially around:
  - auth flows and MFA endpoints
  - admin/platform utilities
  - some org layout settings fetches
  - auth, billing, export, and organization-settings edges that have not yet been fully retired or are intentionally provider-adjacent
- Service-role Supabase usage also exists for platform admin, audit writes, notifications, cleanup jobs, and webhook processing.

### Product surface reality

- `Critical Tasks` is a real feature surface with its own UI and workflow identity.
- `Rating Scheme` is active and user-visible through the Evals primary nav route and owns a dedicated permission lane.

## Intended Guardrails Going Forward

### Architectural defaults

- Keep SvelteKit routes thin where practical.
- Put reusable business logic in feature modules or server use cases, not route files.
- Put provider-specific behavior behind ports and adapters unless the code is unavoidably auth-provider-specific.
- Treat entity definitions, route wrappers, and use-case ports as architecture to extend, not as optional experiments.

### Provider boundaries

- Outside auth-provider edges and adapter code, business logic should not need to know about Supabase-specific query APIs.
- New business logic and route orchestration must use app-owned use cases and adapters. Auth-provider-specific edges remain distinct; remediation must reduce existing provider leaks rather than add exceptions.
- The long-term v1 goal is that a database-provider swap would primarily change adapter code and connection wiring, not business logic or feature modules.

### Authorization direction

- Keep `Organization` and `Group` as v1 nouns.
- Move the authorization model toward app-owned concepts such as:
  - role
  - preset
  - capability or grant
  - scope
  - policy decision
- Give each feature its own permission lane. Do not create new cross-feature permission piggybacking just because a legacy coupling already exists.
- Treat better auditability and explainability of authorization as first-class goals, not incidental improvements.

### Module deepening

- Prefer deeper modules with thinner interfaces over convenience scattering.
- If a concept requires bouncing across many shallow files, that is an architectural smell, not a sign that the architecture is done.
- Use explicit architecture-review work to deepen high-friction seams rather than hiding the problem inside one-off cleanup.

### Language and naming

- Preserve retained schema fields and data contracts; finish any declared rename across its consumers instead of retaining legacy-path wrappers.
- Prefer the Army/military-oriented canonical term in docs, product copy, and new abstractions.
- Example: the current `clinicRole` field remains real current-state, but the preferred canonical term is **Duty Role**.

### Deprecated or unstable areas

- Do not treat hidden or transitional surfaces as stable precedent just because code still exists for them.
- Record contradictory or transitional behavior and its bounded remediation task. Finish the active task's declared cutover; a drift entry cannot substitute for its acceptance evidence.

## Known Drift And Exceptions

- Route-level `locals.supabase` islands still exist in multiple business-critical surfaces.
- Member authorization uses stored presets, per-lane capabilities, shared scope sets, suspension admission and sensitive-action checks; keep new work on those app-owned concepts.
- Critical Tasks now owns its dedicated lane; remaining Critical Tasks drift is module/provider-specific, not lane ownership.
- Rating Scheme now owns its dedicated lane and a first-class Evals route; remaining drift is module/provider-specific, not lane ownership.
- `clinicRole` and other clinic-era names still appear in schema and code.

## Not Precedent

The following patterns are tolerated current-state, not patterns to copy:

- route-level business logic built directly on `locals.supabase`
- service-role access for ordinary feature logic
- new feature permissions borrowing another feature's lane
- clinic-specific naming in new domain language
- treating UI permission presets as if they were persisted auth roles
- cookie-driven auth or org-shell bypasses

## When To Update This Document

Update this document when any of the following change:

- the default architectural path for server or frontend work
- the current auth/authz boundary description
- the provider-boundary contract
- the canonical v1 domain nouns
- the list of tolerated legacy exceptions
