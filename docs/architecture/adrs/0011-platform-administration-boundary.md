# ADR 0011: Platform Administration Boundary

Status: Accepted
Date: 2026-06-06

## Context

### Current-state truth

- TroopToTask has a platform-admin surface for app-wide support and operations across **User Accounts**, **Organizations**, beta access queues, billing support, announcements, audit visibility, and suspension controls.
- The same repo also has **Organization Governance Actions** for organization-scoped access, settings, billing, member management, and destructive organization state.
- Both areas use privileged behavior, but they answer different questions: Platform Administration operates the TroopToTask platform across organizations, while Organization Governance Actions govern one Organization from inside that Organization's membership model.
- Some platform-admin code has historically lived close to Supabase because it uses service-role reads, RPCs, and operational commands.

### Decision pressure

- Platform Administration is now a named product boundary in `CONTEXT.md` and `UBIQUITOUS_LANGUAGE.md`.
- The admin dashboard and suspension flows need provider-specific reads and commands, but route-owned Supabase access would create more provider-boundary drift.
- The boundary needs to be documented so future platform-admin slices do not blur platform support operations with organization governance permission semantics.

## Decision

- Treat **Platform Administration** as its own product boundary for TroopToTask-wide support and operational workflows.
- Keep **Platform Administration** separate from **Organization Governance Actions**:
  - Platform Administration is app-wide and platform-admin gated.
  - Organization Governance Actions are Organization-scoped and membership/governance gated.
- Provider-specific Platform Administration reads and commands must stay behind app-owned modules, such as `src/lib/server/core/useCases/platformAdministration.ts` and `src/lib/server/adapters/supabasePlatformAdministration.ts`.
- Platform-admin routes should compose admin context and use cases; they should not grow route-local Supabase queries for platform business behavior.
- Privileged platform commands should emit audit events only after the underlying app-owned operation reports success.

## Rejected Or Deferred Alternatives

- Treat Platform Administration as another Organization Governance Action; rejected because platform support workflows often span all Organizations and are not owned by any one Organization membership.
- Let `/admin` routes query Supabase directly for dashboard and command behavior; rejected because it spreads provider coupling and makes privileged operational failures easier to mask.
- Move all platform-admin behavior into generic organization settings modules; rejected because platform support, beta queues, audit visibility, and suspension controls are not organization settings.
- Replace service-role Platform Administration reads with organization-member authorization now; deferred because these workflows intentionally operate above a single Organization boundary.

## Guardrails And Exceptions

- New Platform Administration code should use canonical **Platform Administration**, **User Account**, and **Organization** language.
- Do not call Platform Administration "Organization admin" or model it as organization member management.
- Supabase RPC names, table names, query syntax, service-role reads, and provider command details belong in adapters or narrowly owned platform modules, not route handlers or UI components.
- Platform Administration may use service-role access when the workflow is explicitly app-wide support or operation work.
- Organization-scoped settings, member management, billing settings, and owner-danger workflows remain **Organization Governance Actions** unless the work is explicitly platform-wide support.

## Consequences

- Platform-admin work gets a clearer product and architecture home.
- Route files stay thinner and easier to govern.
- Operational failures should surface instead of turning into empty dashboard cards or silent command success.
- The trade-off is one more named boundary for contributors to learn, plus a need to maintain adapter/RPC seams for app-wide operational reads.

## Rollout And Follow-Up

- Keep the current Platform Administration dashboard and suspension commands behind the platform administration use case and Supabase adapter.
- Prefer narrow aggregate RPCs or adapter-owned provider queries for platform-wide dashboard metrics so the UI does not scan full tables.
- When retiring the remaining route-level `adminClient` reads (drift D-02), shape the work as several narrow per-domain Platform Administration modules — for example `PlatformMetrics`, `PlatformAnnouncements`, `PlatformFeedback`, `PlatformGifting`, `PlatformUserDirectory`, and `PlatformAudit` — each with its own scoped store port and a Supabase plus in-memory test adapter. Do not absorb these into one extended `platformAdministration.ts` interface: the existing module is deep because its store port is scoped to one job, and a grab-bag store would rebuild the orchestration-heavy shape this boundary is meant to avoid.
- For Platform Administration user-directory work, the row shaping (auth users joined with memberships, suspensions, and counts) belongs behind a store port, while raw `auth.admin.*` identity/email calls may stay inside that adapter as acknowledged auth-provider edges under ADR 0004.
- Update this ADR if Platform Administration later gains a formal policy-action catalog or non-Supabase provider.

## Links

- Related PRD:
- Related issue:
- Related drift IDs:
- Related docs:
  - `CONTEXT.md`
  - `UBIQUITOUS_LANGUAGE.md`
  - `docs/architecture/ADR_INDEX.md`
  - `docs/architecture/adrs/0004-v1-provider-boundary-contract.md`
