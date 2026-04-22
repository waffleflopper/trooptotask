# Authorization And Provider Boundaries

This document separates what v1 authorization and provider ownership look like today from the system we actually want to move toward.

## Current-State Truth

### Authentication boundary

- Supabase Auth is the current authentication provider.
- Auth-specific route and server code is expected to remain provider-aware for now.
- Current auth-provider-specific areas include:
  - login, logout, invite acceptance, password reset, confirm-link flows
  - MFA enrollment, verification, disable, and session-establishment endpoints
  - request-session and pending-auth-flow handling in `src/hooks.server.ts`

### Current authorization model

- Organization membership is the current authorization anchor.
- The persisted membership role is one of:
  - `owner`
  - `admin`
  - `member`
- Effective access is currently derived from:
  - the membership role
  - per-feature boolean permission flags
  - optional `scoped_group_id`
- Authorization is enforced in more than one layer:
  - app-layer permission context and auth context
  - route wrappers and use cases
  - SQL helper functions and RLS policies
- Admin UI presets like `Full Editor`, `Team Leader`, `Viewer`, and `Custom` are convenience shapes over the current model. They are not persisted first-class auth roles.

### Current feature-lane drift

- Critical Tasks currently uses the Training permission lane.
- Rating Scheme currently uses Leaders Book permissions even though it is operationally closer to its own feature lane.
- Some settings and admin actions still bypass use-case boundaries and operate directly on membership rows through route code.

### Current provider-boundary drift

- The repo already has a working provider-abstraction direction in ports and adapters.
- Even so, direct `locals.supabase` usage still leaks into multiple non-adapter surfaces.
- The largest route-level drift clusters today are:
  - dashboard membership and invitation flows
  - organization creation and default seeding
  - organization settings and member-management actions
  - billing routes
  - admin/platform operations
  - export routes
  - some critical-tasks and settings layout helpers
- Service-role usage also exists in app-level utilities such as notifications, audit logging, cleanup, webhooks, and demo/sandbox flows.

## Intended Direction

### Authorization direction

The intended v1 replacement direction is an app-owned authorization model built around clearer concepts:

- role
- preset
- capability or grant
- scope
- policy decision

This should still speak in v1 nouns such as `Organization` and `Group`.

### Feature-permission direction

- Each feature should own its own permission lane.
- A feature should not depend on another feature's read/write lane just because the early schema was coarse.
- Transitional couplings should be documented as drift until a remediation slice removes them.

### Auditability direction

- Authorization decisions should become easier to explain, inspect, and review.
- Human-facing presets should map cleanly to the underlying app-owned model.
- Auditable authorization behavior should come from app-owned concepts, not scattered boolean coincidence.

### Provider-boundary direction

- Auth remains a special-case provider edge for now.
- Outside auth and adapter layers, business logic should not need to know Supabase query syntax, table APIs, or RPC wiring.
- If the app changed database provider tomorrow, the desired blast radius would be adapters and connection wiring, not route business logic and feature modules.

## Guardrails For Contributors

- Do not add new direct `locals.supabase` business logic outside auth edges, ports/adapters, or an explicitly approved remediation slice.
- Do not deepen boolean-only authz patterns just because the current schema still uses them.
- Do not create new feature-permission piggybacking.
- Do not treat UI presets as if they solve the deeper authorization model problem.
- If a task is unrelated to authz or provider boundaries and it runs into one of these seams, document the seam and stop.
- If a task is an explicitly approved remediation slice in one of these areas, it may cross adjacent seams as needed, but it must:
  - reduce drift rather than spread it
  - document the adjacent seams it touched
  - update the Drift Ledger and relevant architecture docs

## Current Hotspots

### Authorization hotspots

- `src/routes/dashboard/+page.server.ts`
- `src/routes/org/[orgId]/settings/+page.server.ts`
- `src/routes/org/new/+page.server.ts`
- `src/routes/org/[orgId]/api/rating-scheme/+server.ts`
- `src/lib/server/permissionContext.ts`
- `supabase/migrations/*` RLS helpers and policies

### Provider-boundary hotspots

- route files using direct `locals.supabase` for business logic
- service-role utilities that still carry business rules rather than pure provider operations
- export routes that combine feature logic, raw store access, and provider details

## What Counts As Good Change Here

- replacing a route-local permission or membership flow with an app-owned use case
- moving provider-specific persistence details behind an adapter
- splitting a coarse feature permission lane into a dedicated lane
- improving explainability of access decisions
- tightening docs so current-state truth and intended direction are clearly separated

## What Counts As Harmful Change Here

- adding a new direct provider query path because it is faster than using the existing architecture
- copying one feature's permission lane into another as a convenience shortcut
- adding more UI presets without improving the underlying model
- documenting the current system as if it were already the desired design
