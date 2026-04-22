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
- Platform admin uses a separate role system (`super_admin`, `support`, `billing`) and is not part of organization-membership authorization.
- Authorization is enforced in more than one layer:
  - app-layer permission context and auth context
  - route wrappers and use cases
  - SQL helper functions and RLS policies
- Admin UI presets like `Full Editor`, `Team Leader`, `Viewer`, and `Custom` are convenience shapes over the current model. They are not persisted first-class auth roles.

### Current feature-lane drift

- Critical Tasks currently uses the Training permission lane in routes, entities, use cases, and RLS.
- Rating Scheme currently spans more than one borrowed lane:
  - its current page view lives inside Personnel
  - its route shell uses Leaders Book permissions
  - its core CRUD use case enforces Personnel edit access
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

The approved v1 replacement direction keeps `Organization` and `Group` as canonical nouns and separates governance, member access, scope, and cross-cutting policy.

#### Governance roles

- `owner`, `admin`, and `member` remain the stable organization membership roles.
- `owner` and `admin` remain fixed, high-trust, org-wide governance roles.
- `admin` should be able to perform the same normal organization-governance work as `owner`, except ownership transfer and owner-only destructive operations such as deleting the organization.
- Member-level customization must not be used to create partial admins.

#### Member access shape

- Member access should be modeled as:
  - assigned member preset
  - explicit per-feature capability overrides
  - shared scope set
  - policy overlays that can still change the final decision
- The starter member presets are `Viewer`, `Operator`, and `Editor`.
- Presets remain platform-defined in this phase; organizations do not get saved custom presets yet.
- Manual tuning should preserve preset lineage for auditability rather than severing the preset relationship.
- Current labels such as `Team Leader` become composed states, not canonical replacement presets.

#### Capability model

- Each feature lane should map to a capability level of:
  - `none`
  - `view`
  - `operate`
  - `configure`
- Presets seed the lane-by-lane capability map; member-specific overrides adjust individual lanes.
- Governance powers over other people remain outside the member capability map.

#### Scope model

- Scope should be a shared member scope set across all scoped feature lanes.
- The approved target supports org-wide access or `1..n` groups.
- The first implementation wave may preserve current single-group storage/runtime behavior until a dedicated migration expands storage and RLS safely.
- Per-feature scope matrices are not part of the approved model.

#### Policy-decision model

- Final allow or deny decisions should come from:
  - governance role
  - capability map
  - shared scope set
  - policy overlays
- Cross-cutting rules such as read-only mode, delete-approval workflows, and owner-only danger operations should remain explicit policy overlays rather than being stuffed into the feature capability ladder.

### Feature-permission direction

- The durable first-class v1 feature lanes are:
  - calendar
  - personnel
  - training
  - critical-tasks
  - onboarding
  - rating-scheme
- The lane map covers product feature surfaces only.
- Governance concerns such as member management, organization settings, billing, destructive org-danger actions, and platform-admin concerns remain outside the feature-lane map and stay governed by fixed roles plus policy overlays.
- `Leader's Book` remains a documented transitional compatibility lane while the remake is pending; it is not part of the durable first-class lane map and it should not shape the long-term preset taxonomy more than necessary.
- Temporary route or screen placement does not define durable lane ownership.
- Rating Scheme owns its own durable lane even while the current UI remains nested in the Personnel surface.
- Each feature should own its own permission lane.
- A feature should not depend on another feature's read/write lane just because the early schema was coarse.
- Transitional couplings should be documented as drift until a remediation slice removes them.
- Approved lane-remediation order is:
  - Critical Tasks lane implementation first, because its target ownership is already settled
  - Leader's Book versus Rating Scheme boundary review next
  - Rating Scheme runtime lane remediation after that boundary review lands

### Auditability direction

- Authorization decisions should become easier to explain, inspect, and review.
- Every member should remain explainable as:
  - fixed governance role
  - assigned preset
  - lane-by-lane capability map
  - shared scope set
  - policy overlays
- Human-facing presets should map cleanly to the underlying app-owned model.
- Auditable authorization behavior should come from app-owned concepts, not scattered boolean coincidence.
- Stop inferring durable labels such as `Full Editor` from expanded booleans once the replacement model lands.

### Provider-boundary direction

- Auth remains a special-case provider edge for now.
- Outside auth and adapter layers, business logic should not need to know Supabase query syntax, table APIs, or RPC wiring.
- If the app changed database provider tomorrow, the desired blast radius would be adapters and connection wiring, not route business logic and feature modules.

## Guardrails For Contributors

- Do not add new direct `locals.supabase` business logic outside auth edges, ports/adapters, or an explicitly approved remediation slice.
- Do not deepen boolean-only authz patterns just because the current schema still uses them.
- Do not create new feature-permission piggybacking.
- Do not invent partial-admin member shapes.
- Do not introduce per-feature scope matrices.
- Do not treat UI presets as if they solve the deeper authorization model problem.
- Do not let the transitional `Leader's Book` lane dictate the durable member preset design.
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
