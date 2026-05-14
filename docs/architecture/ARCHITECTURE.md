# V1 Architecture Contract

This document records what TroopToTask v1 is today, what guardrails we want contributors to follow going forward, and which contradictions are tolerated only until explicit remediation work lands.

This is a v1 document. It should describe the current SvelteKit repo honestly instead of forcing v2 assumptions onto it.

## Scope

- Applies to the current single-repo SvelteKit application under `src/`, `docs/`, `supabase/`, and `.github/`.
- Uses **`Organization`** and **`Group`** as canonical v1 product and data-model nouns.
- Treats v2 terms such as `Account`, `Unit`, and `Element` as migration vocabulary only, not present-tense v1 truth.

## Current-State Truth

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
  - per-feature boolean permission flags on membership and invitation rows
  - optional `scoped_group_id` to limit effective reach
  - app-layer checks via `PermissionContext` / `AuthContext`
  - SQL helper functions and RLS policies in Supabase migrations
- Admin UI presets like `Full Editor`, `Team Leader`, and `Viewer` exist today as convenience labels over the boolean-and-scope model. They are not persisted domain roles.
- Current permission lanes still carry some transitional complexity:
  - Critical Tasks now owns a dedicated permission lane
  - Rating Scheme now owns a dedicated permission lane across route guards, membership and invitation flags, RLS, and the first-class Evals route
  - `Leader's Book` remains a documented transitional compatibility lane outside the durable first-class lane map
  - remaining supported `Leader's Book` compatibility workflows are policy-converted through explicit Policy Decisions without adding `Leader's Book` to the durable lane taxonomy

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
- `Leaders Book` still exists conceptually and in permissions, help content, exports, and plans, but is hidden from primary nav while redesign work is pending.
- `Rating Scheme` is active and user-visible through the Evals primary nav route and owns a dedicated permission lane.
- Deprecated demo and sandbox runtime flows have been removed from routes, org-shell loading, API context construction, and auth-context creation.
- Historical schema snapshots and seed data still contain demo/sandbox fields and RPCs; removing that schema residue requires a separate production-coordinated migration.

## Intended Guardrails Going Forward

### Architectural defaults

- Keep SvelteKit routes thin where practical.
- Put reusable business logic in feature modules or server use cases, not route files.
- Put provider-specific behavior behind ports and adapters unless the code is unavoidably auth-provider-specific.
- Treat entity definitions, route wrappers, and use-case ports as architecture to extend, not as optional experiments.

### Provider boundaries

- Outside auth-provider edges and adapter code, business logic should not need to know about Supabase-specific query APIs.
- New direct `locals.supabase` usage in business logic or route orchestration should be considered drift unless the slice is explicitly about auth or an approved provider-boundary remediation.
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

- Preserve backwards compatibility with legacy names when required by schema or data shape.
- Prefer the Army/military-oriented canonical term in docs, product copy, and new abstractions.
- Example: the current `clinicRole` field remains real current-state, but the preferred canonical term is **Duty Role**.

### Deprecated or unstable areas

- Do not reintroduce demo/sandbox behavior.
- Treat cookie-driven access, public service-role bootstrap, no-op auth contexts, and in-memory owner shells as rejected architecture options.
- Do not treat hidden or transitional surfaces as stable precedent just because code still exists for them.
- When you touch contradictory or transitional areas, document the contradiction instead of smoothing it over.

## Known Drift And Exceptions

- Route-level `locals.supabase` islands still exist in multiple business-critical surfaces.
- The current authz model is boolean-heavy, hard to audit cleanly, and not the intended steady state.
- Critical Tasks now owns its dedicated lane; remaining Critical Tasks drift is module/provider-specific, not lane ownership.
- Rating Scheme now owns its dedicated lane and a first-class Evals route; remaining drift is around the future `Leader's Book` remake, not Rating Scheme placement or permission ownership.
- `clinicRole` and other clinic-era names still appear in schema and code.
- Leaders Book remains hidden from primary nav while related data and permissions remain live.
- Demo/sandbox runtime bypass logic has been removed; remaining demo/sandbox residue is schema-history cleanup work.

## Not Precedent

The following patterns are tolerated current-state, not patterns to copy:

- route-level business logic built directly on `locals.supabase`
- service-role access for ordinary feature logic
- new feature permissions borrowing another feature's lane
- clinic-specific naming in new domain language
- treating UI permission presets as if they were persisted auth roles
- using historical demo/sandbox behavior as a model for new product work
- cookie-driven auth or org-shell bypasses
- no-op auth contexts or in-memory owner shells that stand in for a real membership row

## When To Update This Document

Update this document when any of the following change:

- the default architectural path for server or frontend work
- the current auth/authz boundary description
- the provider-boundary contract
- the canonical v1 domain nouns
- the list of tolerated legacy exceptions
