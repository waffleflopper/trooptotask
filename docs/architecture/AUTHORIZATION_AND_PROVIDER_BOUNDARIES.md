# Authorization And Provider Boundaries

This document separates what v1 authorization and provider ownership look like today from the system we actually want to move toward.

## Current-State Truth

### Authentication boundary

- Supabase Auth is the current authentication provider.
- The request hook denies dispatch when authenticated MFA assurance or required user suspension status cannot be verified. Logout remains reachable during an assurance lookup failure; pending MFA/recovery/invite sessions retain their completion routes.
- All MFA endpoints require verified session identity. Enrollment, enrollment verification/cancellation and disable also require completed authentication and a verified unsuspended account. Authenticated MFA status and challenge verification remain available during suspension for login/recovery completion; invite sessions retain their separate completion restrictions.
- Enrollment creation accepts no client-selected account or factor type and returns only a usable TOTP factor ID/QR pair. Confirmation validates a six-digit code and an owned pending TOTP factor before challenging; lookup errors, provider errors and missing session results cannot report success. Sequential replay cannot challenge a verified factor through enrollment confirmation. Failed confirmation retains the pending UI for retry, and enrollment controls serialize requests.
- Enrollment cancellation checks the authenticated account's provider-listed factors and only removes a pending TOTP factor. Verified factors use the separate fresh-challenge disable flow; failed lookups deny cancellation and failed cancellation retains the enrollment UI for retry.
- Auth-specific route and server code is expected to remain provider-aware for now.
- Beta **Access Request** approval should use app-owned **Account Setup Links** rather than Supabase invite emails as the product-level setup window; see ADR 0009.
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
- Effective access for migrated Policy Decision workflows is derived from:
  - the membership role
  - the stored member preset and per-lane capability overrides
  - the stored shared scope set
  - policy overlays such as read-only mode
- Platform admin uses a separate role system (`super_admin`, `support`, `billing`) and is not part of organization-membership authorization.
- Authorization is enforced in more than one layer:
  - app-layer permission context and auth context
  - route wrappers and use cases
  - SQL helper functions and RLS policies
- Settings UI presets like `Viewer`, `Operator`, and `Editor` are convenience shapes over the current model. They are not persisted first-class auth roles.

### Current feature-lane reality

- Critical Tasks now owns a dedicated lane across routes, entities, use cases, and RLS.
- Rating Scheme now owns a dedicated lane across route guards, CRUD, membership and invitation flags, and RLS-backed scoped record access.
  - its current primary surface is the first-class Evals route
  - rating-scheme-only members can use that Evals route without Personnel access
  - its record model remains distinct from counseling and development-goal records
- Per-Soldier counseling, follow-up, notes, and document workflows are Personnel-owned.
- Rating Scheme remains independently grantable.
- Some settings and admin actions still bypass use-case boundaries, but organization settings rename now runs through an app-owned use case and Supabase adapter.

### Current provider-boundary drift

- The repo already has a working provider-abstraction direction in ports and adapters.
- Even so, direct `locals.supabase` usage still leaks into multiple non-adapter surfaces.
- Billing organization-state reads and writes now run through app-owned store-backed helpers, including cancellation-state reconciliation when Stripe cancellation succeeds before a local org update failure, and the shared `data_exports` lifecycle no longer passes provider clients through export routes.
- The largest route-level drift clusters today are:
  - admin/platform operations
  - some critical-tasks and settings layout helpers
- Service-role usage also exists in app-level utilities such as notifications, audit logging, cleanup, and webhooks.
- One organization-scoped surface now reads platform-owned state through a sanctioned service-role port: the members settings screen reads **Account Setup Link** state for its own pending **Organization Invitations** via `OrganizationInvitationSetupStateLookupPort`, wired in `httpAdapter.ts` (ADR 0012). It returns invitation id to setup state and nothing else.

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
- Group-scoped member access composes scope with lane capabilities instead of becoming a separate role or preset.

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
- Ungrouped Personnel Records are organization-scoped resources for scope decisions; a group-scoped member does not receive them through a group grant.
- Personnel-specific member access is intentionally out of scope for the v1 replacement model. The storage contract must not reserve `access_scope_personnel_ids`; a future personnel-scoped authorization model would need a new ADR or approved slice that defines policy semantics, RLS behavior, UI affordances, and audit behavior together.
- Multi-group scope should move into the replacement program sooner rather than later. Slices may use temporary translation only as migration scaffolding, but the intended rollout is to retire single-group storage/runtime behavior from each migrated workflow.
- Per-feature scope matrices are not part of the approved model.

#### Policy-decision model

- Final allow or deny decisions should come from:
  - governance role
  - authenticated user identity and resource ownership for self-service workflows
  - stable policy action
  - capability map
  - shared scope set
  - policy overlays
- Policy evaluation should be action-first. Routes, pages, and buttons should request decisions for stable policy actions instead of defining authorization meaning from UI placement or route shape.
- Every policy action should be owned by a durable feature lane, organization-governance semantics, or an explicitly identity-owned self-service workflow.
- Identity-owned actions cover workflows where an authenticated member acts only on their own resources, such as personal notifications or their own deletion request submission/cancellation. They must validate resource ownership before mutation and must not borrow feature edit capability.
- The first action catalog should use workflow-level actions: meaningful user workflows rather than one action per button or one catch-all action per feature.
- Split actions when they need different capability levels, audit treatment, or UX explanations.
- The replacement should proceed through vertical authorization slices, filed as implementation issues, that carry one meaningful workflow through storage, adapter, evaluator, route enforcement, UI affordance, audit behavior, and tests together.
- The core policy evaluator should be pure TypeScript and provider-agnostic. It should receive already-loaded facts such as actor role, capability map, scope set, resource context, and policy overlays.
- Supabase-specific reads belong in an adapter that translates provider data into policy inputs before evaluation.
- Policy evaluation should return a structured decision result, not a bare boolean. The result should include the final allow or deny value plus explanation fields such as reason code, matched capability, matched scope, and blocking overlay.
- Every policy decision should include a stable machine-readable reason code such as `allowed.capability`, `denied.missingCapability`, `denied.outOfScope`, `denied.readOnlyMode`, or `denied.ownerOnly`.
- Human-facing copy should be mapped from reason codes outside the evaluator; free-form explanation strings must not become canonical policy reasons.
- Structured decisions should be usable for both user-facing explanations and audit capture when members attempt denied or suspicious access.
- Audit capture should be selective rather than logging every policy decision. The policy result should carry enough structured fields for an audit event, while an audit adapter or allowlist decides whether to persist it.
- Always-audit categories should include denied writes, organization-governance actions, owner-only actions, billing changes, and member-management changes. Suspicious denied reads or repeated denied attempts may become audit-worthy through explicit capture rules.
- Ordinary allowed reads should not be audited by default.
- Policy enforcement must be server-authoritative. Client-side or preloaded decisions may improve UX by hiding buttons, disabling controls, or showing explanations, but writes and sensitive reads must still be checked server-side.
- Hidden UI controls and client-side decisions are advisory only and must not be treated as security enforcement.
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
- Temporary route or screen placement does not define durable lane ownership.
- Current primary-nav visibility also does not define feature existence or lane ownership during this transition.
- Rating Scheme owns its own durable lane and now uses the Evals route as its primary UI; nav treatment can change independently without redefining lane ownership.
- Rating Scheme owns evaluation-tracking records and workflows for rated individuals.
- `Personnel` owns roster administration.
- `Personnel` owns per-Soldier counseling records, follow-ups, leader notes, Soldier Data Sheet fields, and document uploads. Both reads and writes of these artifacts require `operate` capability (#910).
- Rating Scheme may use app-owned roster reference queries to resolve rated people and internal raters without borrowing the Personnel lane.
- Rating Scheme and Personnel must remain independently grantable.
- Each feature should own its own permission lane.
- A feature should not depend on another feature's read/write lane just because the early schema was coarse.
- Transitional couplings should be documented as drift until a remediation slice removes them.
- Approved lane-remediation order is:
  - Critical Tasks lane implementation first, because its target ownership is already settled
  - Critical Tasks lane implementation is now complete in `#621`
  - Rating Scheme runtime lane remediation is now complete in `#627`

### Auditability direction

- Authorization decisions should become easier to explain, inspect, and review.
- Policy decisions should preserve enough structured explanation to support audit trails without requiring every call site to reverse-engineer why access was allowed or denied.
- Authorization audit trails should stay selective and useful; avoid turning routine allowed reads into audit noise.
- Every member should remain explainable as:
  - fixed governance role
  - assigned preset
  - lane-by-lane capability map
  - shared scope set
  - policy overlays
- Human-facing presets should map cleanly to the underlying app-owned model.
- Auditable authorization behavior should come from app-owned concepts, not scattered boolean coincidence.
- Every member should remain explainable from fixed governance role, assigned preset, lane-by-lane capability map, shared scope set, and policy overlays.

### Provider-boundary direction

- Auth remains a special-case provider edge for now.
- Outside auth and adapter layers, business logic should not need to know Supabase query syntax, table APIs, or RPC wiring.
- If the app changed database provider tomorrow, the desired blast radius would be adapters and connection wiring, not route business logic and feature modules.

## Guardrails For Contributors

- Do not add new direct `locals.supabase` business logic outside auth edges, ports/adapters, or an explicitly approved remediation slice.
- An organization-scoped surface may read platform-owned state only through a narrow, purpose-built service-role port that returns the minimum shape that surface needs — never through an RLS grant on a platform table, and never through a denormalised mirror. Wire such a port in `httpAdapter.ts` from `getAdminClient`, not in the route; building it in a route makes it route-level admin-provider usage and requires a `routeAdminProviderAllowlist` entry. Each port is a documented per-port exception (ADR 0012), not a general licence.
- Keep member authorization on stored presets, per-lane capabilities, shared scope sets, and policy overlays.
- Do not create new feature-permission piggybacking.
- Do not invent partial-admin member shapes.
- Do not introduce per-feature scope matrices.
- Do not treat UI presets as if they solve the deeper authorization model problem.
- Do not let retired or historical lanes dictate the durable member preset design.
- Record unrelated authz/provider discoveries and continue the authorized task. Pause only a dependent change whose authorization, tenancy or privilege semantics remain unresolved; use the [decision boundaries](AI_AGENT_OPERATING_MODEL.md#decision-boundaries). Necessary adjacent edits that preserve these contracts do not require another approval.
- If a task is an explicitly approved remediation slice in one of these areas, it may cross adjacent seams as needed, but it must:
  - reduce drift rather than spread it
  - document the adjacent seams it touched
  - update the Drift Ledger and relevant architecture docs

## Current Hotspots

### Authorization hotspots

- `src/routes/org/[orgId]/settings/+page.server.ts`
- `src/routes/org/[orgId]/personnel/+layout.server.ts`
- `src/lib/server/permissionContext.ts`
- `src/lib/server/core/useCases/organizationInvitationMembership.ts`
- `supabase/migrations/*` RLS helpers and policies

### Provider-boundary hotspots

- route files using direct `locals.supabase` for business logic
- service-role utilities that still carry business rules rather than pure provider operations
- admin/platform routes that still mix route orchestration with provider-specific persistence

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
