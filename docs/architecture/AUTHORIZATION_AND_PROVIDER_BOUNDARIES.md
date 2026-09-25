# Authorization And Provider Boundaries

Phases 03–04 removed Billing runtime and the locally verified active-schema objects. Commercial read-only guards, recovery exceptions, policy overlays, Organization billing pages and their plan readers are gone from the retained application. Decisions use identity, membership, capabilities and scope; suspension remains explicit request/shell admission and sensitive writes retain step-up. The hosted schema and deployment state remain owner-verified release preflights, not claims made by this repository documentation.

This document separates what v1 authorization and provider ownership look like today from the system we actually want to move toward.

## Current-State Truth

### Trusted identity and access contract (07-01c)

**Current admission.** [The request hook](../../src/hooks.server.ts) creates a request-local Supabase client and accepts an actor only after the bearer session, claims subject and provider user agree. It checks the original bearer session age through [`get_current_session_started_at()`](../../supabase/migrations/20260630001400_session_timeout_provenance.sql), verifies recognized MFA assurance and applies user suspension admission. Auth completion and logout have their documented narrow exceptions; a pending setup, recovery or MFA flow is not general application access. [Organization admission](../../src/lib/server/adapters/supabaseOrganizationAdmission.ts) then checks fresh status for Organization writes and API requests. The hook's admitted `locals.user.id` is the current application actor key; a form field, route parameter, cookie preference or browser store cannot assert that actor. Credential, token, cookie, provider-user and assurance details belong at the Identity/transport edge; current broad contexts still expose some of them to other server code. The detailed failure, retry and revocation rules below remain authoritative.

**Current session transport ownership (08-M01-01a).** The hook composes [Identity's server-only session read](../../src/features/identity/index.server.ts); Identity owns bearer/claims/provider-user binding, original-session lifetime and expiry revocation. The same owner implements logout, including its independent provider read and explicit-token revocation acknowledgment. The old central `authSession.ts` and unused `locals.safeGetSession` cache/interface are removed. Request-local SSR client/storage construction, HTTP response mapping, MFA/suspension and Organization admission still reside in the hook. The session returned to that delivery edge remains a current provider transport value, not a portable actor contract or authority supplied by a caller. No general provider client is exported. The remaining actor, MFA, step-up and account-security migrations belong to D01's explicit later leaves; other feature contexts remain unfinished Phase 08 work.

**Separate identities and grants.** Today that application actor key has the same UUID value as the verified Supabase `auth.users.id`, which is referenced by current actor columns and `organization_memberships.user_id`. An Organization has its own `organizations.id` and optional URL slug; a membership is a distinct row with its own `id`, Organization, user, role, preset, overrides and Group scope. A Personnel record has its own `personnel.id` and Organization/Group relationships; it is not a user account or a membership merely because a person has the same name or email. Preserve current UUID validation, foreign keys and stored values. Feature contracts should name these IDs by their actual meaning instead of treating every UUID as an interchangeable actor or introducing a second identity/membership store. No external-ID mapping, new subject column or foreign-key rewrite is part of Phase 07.

**Distinct transitions.** [Reviewed access and Account Setup Links](adrs/0009-beta-access-request-account-setup-links.md) establish eligibility and a credential; setup alone does not join an Organization. [Organization invitations](adrs/0012-organization-invited-platform-access-auto-approval.md) carry separate membership intent and may bridge a new invitee to reviewed access. The [invitation acceptance RPC](../../supabase/migrations/20260629000100_accept_invitation_with_completed_email_setup.sql) binds the authenticated subject and normalized email to a pending, unexpired invitation and performs its membership transition in SQL. [Organization creation](../../supabase/migrations/20260610000200_refresh_org_ownership_rpcs.sql) creates the Organization and owner membership in one RPC transaction; subsequent default seeding is separate, as the [ownership ledger](CURRENT_OWNERSHIP.md#persisted-and-operational-ownership-07-01b) records. Neither access approval nor account setup grants an Organization membership or a feature capability. The known invitation-origin approval/rescind defect remains task 11-01, not a rule to normalize into the contract.

**Operation authorization.** A requested Organization and resource are explicit inputs resolved from the current delivery path, then checked against the admitted actor's membership and the resource's Organization/Group. Current [membership projection](../../src/lib/server/permissionContext.ts) supplies fixed owner/admin/member governance and member preset, overrides and shared scope; [feature policy](../../src/lib/server/core/useCases/featurePolicy.ts) checks the action and resource. The six stored feature lanes, identity-owned self actions, Organization governance and separate platform-admin roles retain their distinct authorities. Sensitive governance writes additionally use [request-bound step-up](../../src/lib/server/sensitiveActionAuthorizer.ts). UI visibility and layout data are advisory; page actions, JSON endpoints and other delivery paths must reach the same authoritative policy. The requested Organization must not be selected by shared mutable active-Organization state, and client-supplied actor, role or capability flags confer no authority. Leader-note operations now receive admitted actor, explicit Personnel resource and typed collaborators; current broad contexts and route/provider access still serve other operations until their owning cutovers.

**Provider and database enforcement.** The current [effective local catalog](../stabilization/phase-06/schema-target-snapshots.md) retains RLS on its 50 public tables, SQL policy helpers using `auth.uid()` and membership/scope facts, function execution grants, auth-table references and triggers. The session-age function has authenticated-only execution and returns the caller's session start; [password-attempt reconciliation](../../supabase/migrations/20260630001500_password_attempt_reconciliation.sql) uses service-only RPC access and an `auth.users` trigger as part of its transaction guarantee. [Auth email identity synchronization](../../supabase/migrations/20260614000200_user_email_identities.sql) is another current `auth.users` trigger, not a separate account authority. Invitation acceptance, owner creation, [Calendar assignment scope](../../supabase/migrations/20260918000100_enforce_calendar_assignment_group_scope.sql) and private-file access retain their own SQL/Storage checks; a TypeScript policy decision does not replace them. [Sensitive-file policies](../../supabase/migrations/20260615000200_harden_sign_in_roster_scope_boundaries.sql) combine Storage path, Organization and Personnel scope. Service-role reads/writes remain purpose-specific privileged adapters, including the narrow invitation setup-state read described below; they do not make tenant operations generally privileged. Supabase Realtime is configured, but no current source subscriber was identified in the [ownership census](CURRENT_OWNERSHIP.md#persisted-and-operational-ownership-07-01b), and hosted publication membership is unverified. These owned provider bindings are current infrastructure, not abandoned compatibility code or a promise of provider interchangeability.

**Phase 07 target.** Existing operations should receive only the verified actor identifier, explicit requested Organization/resource and narrow collaborators needed for their policy and effect. Identity resolves provider admission; Organization owns membership and invitation transitions; each feature owns its action and resource policy; provider adapters and SQL retain their real security and transaction guarantees. D01 documents this boundary, while D03's leader-note pilot and Phase 08 implement the remaining cutovers. Future authentication-provider or native-client work does not alter today's admission, membership, identifiers or SQL guarantees.

### Authentication boundary

- Supabase Auth is the current authentication provider.
- The hook enforces the 24-hour absolute lifetime from `auth.sessions.created_at` through the no-argument `get_current_session_started_at()` RPC, bound to the verified bearer token. The function returns only the caller's own session start, with authenticated-only execution and no session-table grants. Account sign-in, token issue time, refresh and MFA do not reset age. Missing sessions expire; malformed/future facts or provider failures deny dispatch with a retryable 503. Expiry leaves request identity empty and retains existing sign-out scope; cookies clear only after confirmed revocation. Logout remains reachable during provenance outages. Migration `20260630001400_session_timeout_provenance.sql` must be applied by a separately authorized operator before deploying this hook; without it authenticated requests fail closed.
- The request hook denies dispatch when authenticated MFA assurance or required user suspension status cannot be verified. Logout remains reachable during an assurance lookup failure; pending MFA/recovery/invite sessions retain their completion routes.
- The shared sensitive-action authorizer accepts suspension facts only from an explicitly successful boolean provider result. Missing/malformed results, errors even with data, and thrown suspension lookups use the existing unavailable denial before either recent-session or MFA permission; every retry reads suspension again. Organization governance, high-privilege membership changes, platform Access Request administration consume this same authorizer. Its adapter binds the requested actor to the hook-verified identity and session, requires an unexpired token before and after provider reads, and requests assurance for that exact token. Missing/malformed/failed assurance cannot fall back to recent-login permission. A pending MFA upgrade requires completion; current AAL2 retains permission for a valid session. The 15-minute recency window uses validated authentication timestamps from that token, never the account-wide last sign-in time; future timestamps do not grant recency.
- All MFA endpoints require verified session identity. Enrollment, enrollment verification/cancellation and disable also require completed authentication and a verified unsuspended account. Authenticated MFA status and challenge verification remain available during suspension for login/recovery/invite completion; pending invite sessions cannot manage factors or leave their completion flow.
- Enrollment creation accepts no client-selected account or factor type and returns only a usable TOTP factor ID/QR pair. Confirmation validates a six-digit code and an owned pending TOTP factor before challenging; lookup errors, provider errors and missing session results cannot report success. Sequential replay cannot challenge a verified factor through enrollment confirmation. Failed confirmation retains the pending UI for retry, and enrollment controls serialize requests.
- Enrollment cancellation checks the authenticated account's provider-listed factors and only removes a pending TOTP factor. Verified factors use the separate fresh-challenge disable flow; failed lookups deny cancellation and failed cancellation retains the enrollment UI for retry.
- MFA disable selects the authenticated account's verified TOTP factor, rejects failed lookups even with accompanying data, and requires a usable fresh challenge result before removal. Errors, exceptions and mismatched removal results cannot report success; every retry requires another challenge. Account Security retains the confirmation/code on failure, serializes submissions and accepts only explicit success.
- Login/recovery MFA challenge verification selects only an authenticated provider-listed verified TOTP factor, rejects failed lookups even when data accompanies errors, and requires usable session results before reporting success. Login and the shared password-flow challenge retain code and completion state on failure, serialize submissions and advance only on explicit success; network failures remain visible and retryable.
- MFA status reports only recognized current/next assurance levels, rejects provider errors even with accompanying data, and treats missing results or exceptions as unavailable. Recovery keeps password entry blocked on status failures and offers a serialized retry using the established session; only valid status selects password entry or MFA completion.
- Password login validates scalar credentials before provider access, preserves password bytes, and requires a matching usable user/session plus recognized assurance before success or MFA continuation. Rejected credentials remain generic; unavailable provider results retain retry state without exposing exceptions or recording login success. The login form serializes submissions and retains its fields on transport failure. The request hook continues to enforce fresh identity, assurance and suspension on subsequent requests.
- User sign-out uses the shared POST `/auth/logout` action and the request client's explicit-token `auth.admin.signOut(token, 'global')`; this uses the user's bearer, not service-role authority. The hook's absolute-timeout exit uses the same provider operation. The session helper is not revocation evidence: it suppresses HTTP 401/403/404. Denied, malformed or thrown acknowledgments preserve pending/auth cookies for retry and block expired-session dispatch. Accepted revocation clears only this project's session, user-storage and PKCE cookies plus its pending-flow marker. A verified locally absent session clears local state and renders an explicit other-device-revocation-unconfirmed notice with a sign-in link; it never claims global completion. Logout remains reachable during suspension, MFA and pending flows; identity lookup failure cannot grant request-local authentication. GET/HEAD only redirect without mutation. Global sign-out revokes refresh sessions; already-issued bearer tokens retain the provider's expiry semantics.
- Token session establishment validates scalar token pairs and optional recovery/invite flow before provider access. A request-local SSR client stages cookie writes until the provider acknowledges a usable matching user/session; rejected refreshes cannot delete the existing browser session. Success retains rooted HttpOnly token-only cookies and pending-flow restrictions; unavailable results are generic and retryable. Recovery and invite consumers prioritize incoming credentials over an existing account, serialize exchange retries and expose completion only after explicit success. The hook defers pending-cookie cleanup to POST session establishment when identity lookup is unavailable, without trusting that identity. Valid bearer-session repeats remain idempotent; expiry and revoked refresh tokens remain provider-enforced.
- Sensitive-action password confirmation requires a current bound identity and a usable password-issued session for that same user. Its request-local auth client stages cookies until both session and recognized assurance are accepted; errors preserve the prior browser session. Assurance is read for the returned token, and pending MFA publishes that session only for verification continuation. The response grants no Organization permission: consumers retry the original protected action only on explicit success, or navigate to MFA with the original return path. Every retry remains independently authorized.
- `sessionAssurance.ts` owns fresh recognized assurance, token expiry and MFA admission for password updates, invite finalization, account email changes and sensitive-action password confirmation. Each auth edge retains its own identity/proof checks, response shape and effects.
- Password-update request admission requires the hook-verified user and matching unexpired session token. It safely validates scalar password fields without changing password bytes, and rechecks expiry after request parsing and durable-limit admission. Recovery/invite retain their password-only payloads; request input cannot select a different actor or pending flow. Old-password proof uses an isolated nonpersistent auth client: provider-issued actor/session/tokens/expiry, explicit token identity and recognized assurance must validate, and its temporary session must be locally revoked with explicit-token provider acknowledgment before mutation. The SDK session helper cannot supply that acknowledgment because it suppresses some permission/expiry errors. Proof cannot replace browser cookies or downgrade the admitted session's MFA; mutation stays on the original hook-bound client, with expiry rechecked after proof. Immediately before mutation, fresh recognized assurance for that exact admitted token is required; unavailable facts and expired sessions deny without password, revocation or cookie effects. Pending MFA returns `403 mfa_required` even during recovery/invite. Account Security, recovery and invite consumers preserve password fields through an inline challenge and explicit retry; proof cannot downgrade the upgraded session. Password mutation is admitted through the service-only `password_change_attempt` RPC before provider access. One row per actor binds attempt ID, original session, flow and expiry; no credentials are stored. Concurrent admissions cannot both acquire mutation permission. A consumed metadata marker and transaction-local password-change witness confirm the attempt in the same GoTrue database transaction. A status check locks the row: it observes a committed change or fences the attempt so a late marked provider transaction rolls back. Provider responses, including errors, are never rollback evidence. Revocation still requires the explicit-token SDK acknowledgment; its durable completion write precedes recovery-marker cleanup. All three loaders restore stored state without cookies. Unknown outcomes discard password drafts and offer serialized status-only reconciliation; a fenced failure permits explicit restart. Pending or completed replay never repeats mutation. Expiry and session/flow mismatches deny continuation; a fresh verified session may explicitly retire a completed attempt immediately, or an unfinished attempt only after its expiry. Replacing the attempt ID continues to reject old provider markers; retiring completion grants no password mutation or invite activation by itself. Account Security permits explicit restart after completion outside a pending flow. No receipt signer, cookie authority or receipt-only fallback remains. Migration `20260630001500_password_attempt_reconciliation.sql` must precede this auth-edge cutover under separately authorized deployment; missing persistence fails closed. The transaction witness depends on GoTrue keeping password and metadata updates in one transaction, covered by isolated real-provider checks.
- Account email changes use the same isolated, revoked password proof as password updates, preserving the admitted actor and MFA session. Scalar input, session binding/expiry, durable user/IP limits (five attempts per fifteen minutes) and fresh mutation-time assurance deny before provider mutation. A matching provider user, unchanged current email and requested pending email are required before reporting confirmation requested. Errors and lost responses do not claim rollback or completed email change; reload reads pending/current email from hook-verified identity. After the hook binds the fresh provider user to the verified token subject, that provider email takes precedence over the token’s older email claim for every downstream consumer; the token, actor and MFA assurance remain unchanged. The form serializes submissions, retains drafts through errors and inline MFA, and requires explicit retry. Confirmation instructions cover both inboxes; a requested address remains pending until provider confirmation. Organization membership and Group scope are unchanged.
- Invite finalization requires the hook-verified actor, matching unexpired session and pending invite flow. Immediately before profile/membership/cookie effects it reads recognized assurance for that exact token; missing/failed facts, expiry and pending MFA deny without completion effects. Activation requires a stored completed password attempt; absent, started, failed, pending, expired or unavailable attempts deny activation without effects. A completed flow cannot be replayed without another pending invitation flow. The sole invite consumer retains confirmed password completion during activation errors, completes MFA inline and retries only finalization, without resubmitting the password. Existing suspension-compatible auth completion remains available. Profile saves require a matching returned row; every invitation query page and acceptance result is validated. Unavailable or partial acceptance preserves the pending marker for retry without repeating confirmed membership writes. Terminal expired/blocked/missing invitations grant no membership and are reported separately from account activation; a setup-required result preserves the reviewed Account Setup Link prerequisite. The page loader uses hook-verified identity and pending-flow state, so revisiting a cleared invite offers dashboard continuation rather than another activation. Production-browser acceptance for stabilization c-03 passed, including provider failure/partial retry, post-completion reload and lost-response reconciliation.
- Auth-specific route and server code is expected to remain provider-aware for now.
- Organization invitations to new accounts always bridge to an approved Access Request and shared Account Setup Link issuance, independent of billing. Invitation delivery is separate from the setup credential; resend/retry never mint credentials, and setup alone grants no membership. Existing-account acceptance, scope, expiry, replay and rate limits remain unchanged (ADR 0012; stabilization 03-01b).
- Beta **Access Request** approval should use app-owned **Account Setup Links** rather than Supabase invite emails as the product-level setup window; see ADR 0009.
- Current auth-provider-specific areas include:
  - login, logout, invite acceptance, password reset, confirm-link flows
  - MFA enrollment, verification, disable, and session-establishment endpoints
  - request-session and pending-auth-flow handling in `src/hooks.server.ts`

### Current authorization model

- Organization membership is the current authorization anchor.
- Persisted Calendar assignments enforce the Calendar capability and Organization/Group scope in both application policy and RLS. Person targets resolve to their same-Organization Personnel Group; Group targets must resolve to an existing same-Organization Group covered by the caller’s scope. Migration `20260918000100_enforce_calendar_assignment_group_scope.sql` closes the former SQL Group-target exemption without changing saved rows or the policy-helper interfaces. Remote application belongs to a separately authorized operator; stabilization verification is disposable and local.
- After authentication and user-suspension admission, the request hook checks fresh Organization status through `supabaseOrganizationAdmission.ts` with the caller's RLS-scoped client. Every write under an Organization route and every Organization API request (including GET/HEAD exports and private reads) is denied when suspended, missing or unverifiable. Page GET/HEAD navigation retains the suspended shell. This gate grants no membership or capability and is independent of commercial state; existing route/use-case policies still apply. Platform administration and account/auth recovery keep their own admission boundaries.
- The persisted membership role is one of:
  - `owner`
  - `admin`
  - `member`
- Effective access for migrated Policy Decision workflows is derived from:
  - the membership role
  - the stored member preset and per-lane capability overrides
  - the stored shared scope set
  - request admission for suspension and sensitive-action step-up
- Platform admin uses a separate role system (`super_admin`, `support`, `billing`) and is not part of organization-membership authorization. Admin HTTP wrappers translate core access denials into SvelteKit HTTP 403 errors before protected work; page-level role denials follow the same boundary.
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
- Dashboard membership access does not require Training capability. Its route loads the optional Training summary only with Training view access; otherwise the summary is absent and Training readiness is not displayed. The Training use case still enforces its own policy, and failures for authorized requests remain errors. Calendar assignments and independently authorized summaries continue to render.
- Onboarding template/step RLS uses its independent Onboarding lane: `view` permits shared template reads (including Group-scoped members); `configure` with Organization scope permits mutations, with owner/admin authority preserved. Template and step identity/Organization are immutable for authenticated callers. Templates permit name/description edits; steps permit their declared configuration fields, including same-Organization template reassignment and ordering. Step template/Training Type references must belong to the same Organization without borrowing Personnel or Training capability. This local forward repair is recorded in [05-01-02-R01](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/EVIDENCE.md#task-05-01-02-r01-onboarding-template-policy-repair); remote application remains separately operated.
- Per-Soldier counseling, follow-up, notes, and document workflows are Personnel-owned.
- Rating Scheme remains independently grantable.
- Some settings and admin actions still bypass use-case boundaries, but organization settings rename now runs through an app-owned use case and Supabase adapter.

### Current provider-boundary drift

- The repo already has a working provider-abstraction direction in ports and adapters.
- Even so, direct `locals.supabase` usage still leaks into multiple non-adapter surfaces.
- Phase 03 D05 removed Organization billing delivery/recovery, its store-backed helpers, webhook state transitions, the Stripe provider and webhook-ledger cleanup. The shared `data_exports` lifecycle remains behind its retained adapters; the weekly cleanup endpoint retains authorized audit-log cleanup.
- The largest route-level drift clusters today are:
  - admin/platform operations
  - some critical-tasks and settings layout helpers
- Platform Administration gifting, subscriptions and Billing Health diagnostics are removed. The Organization ledger reads only identity, suspension, membership/owner and personnel counts; tier, plan and billing queries and filters are gone. Activation health reads only Organization identity and aggregate roster, membership, defaults and setup facts. Organization detail retains its role-gated identity, membership, owner-transfer and suspension operations behind existing session/MFA admission; it no longer reads commercial state or offers gifting, billing reconciliation or plan feature overrides. Dashboard/search and user support retain only noncommercial projections. Organization JSON/Excel exports omit commercial sections and select retained Organization profile fields. Phase 03 D05/D06 completed application Billing removal and integrated verification; Phase 04 retired Billing objects in the verified local target. Hosted application/schema parity remains unverified here.
- Service-role usage also exists in app-level utilities such as notifications, audit logging, and retained cleanup.
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
  - explicit suspension admission and sensitive-action step-up
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
- Policy evaluation should be action-first. Routes, pages, and buttons should request decisions for stable policy actions instead of defining authorization meaning from UI placement or route shape.
- Every policy action should be owned by a durable feature lane, organization-governance semantics, or an explicitly identity-owned self-service workflow.
- Identity-owned actions cover workflows where an authenticated member acts only on their own resources, such as personal notifications or their own deletion request submission/cancellation. They must validate resource ownership before mutation and must not borrow feature edit capability.
- The first action catalog should use workflow-level actions: meaningful user workflows rather than one action per button or one catch-all action per feature.
- Split actions when they need different capability levels, audit treatment, or UX explanations.
- The replacement should proceed through vertical authorization slices, filed as implementation issues, that carry one meaningful workflow through storage, adapter, evaluator, route enforcement, UI affordance, audit behavior, and tests together.
- The core policy evaluator should be pure TypeScript and provider-agnostic. It should receive already-loaded facts such as actor role, capability map, scope set, resource context.
- Supabase-specific reads belong in an adapter that translates provider data into policy inputs before evaluation.
- Policy evaluation should return a structured decision result, not a bare boolean. The result should include the final allow or deny value plus explanation fields such as reason code, matched capability, matched scope.
- Every policy decision should include a stable machine-readable reason code such as `allowed.capability`, `denied.missingCapability`, `denied.outOfScope`, `denied.ownerOnly`.
- Human-facing copy should be mapped from reason codes outside the evaluator; free-form explanation strings must not become canonical policy reasons.
- Structured decisions should be usable for both user-facing explanations and audit capture when members attempt denied or suspicious access.
- Audit capture should be selective rather than logging every policy decision. The policy result should carry enough structured fields for an audit event, while an audit adapter or allowlist decides whether to persist it.
- Always-audit categories should include denied writes, organization-governance actions, owner-only actions, and member-management changes. Suspicious denied reads or repeated denied attempts may become audit-worthy through explicit capture rules.
- Ordinary allowed reads should not be audited by default.
- Policy enforcement must be server-authoritative. Client-side or preloaded decisions may improve UX by hiding buttons, disabling controls, or showing explanations, but writes and sensitive reads must still be checked server-side.
- Hidden UI controls and client-side decisions are advisory only and must not be treated as security enforcement.
- Delete-approval workflows and owner-only danger operations remain explicit checks outside the feature capability ladder. Commercial read-only overlays were removed under D03; do not reintroduce them.

### Feature-permission direction

- The durable first-class v1 feature lanes are:
  - calendar
  - personnel
  - training
  - critical-tasks
  - onboarding
  - rating-scheme
- The lane map covers product feature surfaces only.
- Governance concerns such as member management, organization settings, destructive org-danger actions, and platform-admin concerns remain outside the feature-lane map and stay governed by fixed roles and sensitive-action checks.
- Temporary route or screen placement does not define durable lane ownership.
- Current primary-nav visibility also does not define feature existence or lane ownership during this transition.
- Rating Scheme owns its own durable lane and now uses the Evals route as its primary UI; nav treatment can change independently without redefining lane ownership.
- Rating Scheme owns evaluation-tracking records and workflows for rated individuals.
- `Personnel` owns roster administration.
- `Personnel` owns per-Soldier counseling records, follow-ups, leader notes, Soldier Data Sheet fields, and document uploads. The current application policies require `configure` for sensitive artifact reads (`personnel.readSensitiveRecords`) and `operate` for artifact writes (`personnel.manageRecords`), combined with the Personnel record’s Organization/Group scope.
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
- Human-facing presets should map cleanly to the underlying app-owned model.
- Auditable authorization behavior should come from app-owned concepts, not scattered boolean coincidence.
- Every member should remain explainable from fixed governance role, assigned preset, lane-by-lane capability map, shared scope set.

### Provider-boundary direction

- Auth remains a special-case provider edge for now.
- Outside auth and adapter layers, business logic should not need to know Supabase query syntax, table APIs, or RPC wiring.
- Keep current Supabase Auth, RLS, Storage and transaction-specific SQL under their owning edges and adapters. The current objective is narrow feature contracts and removal of unowned provider leakage; a database-provider replacement is not a Phase 07 requirement.

## Guardrails For Contributors

- Do not add new direct `locals.supabase` business logic outside auth edges, ports/adapters, or an explicitly approved remediation slice.
- An organization-scoped surface may read platform-owned state only through a narrow, purpose-built service-role port that returns the minimum shape that surface needs — never through an RLS grant on a platform table, and never through a denormalised mirror. Wire such a port in `httpAdapter.ts` from `getAdminClient`, not in the route; building it in a route makes it route-level admin-provider usage and requires a `routeAdminProviderAllowlist` entry. Each port is a documented per-port exception (ADR 0012), not a general licence.
- Keep member authorization on stored presets, per-lane capabilities, shared scope sets.
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
