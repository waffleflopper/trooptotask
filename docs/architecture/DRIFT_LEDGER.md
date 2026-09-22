# V1 Drift Ledger

Phase 03 D05 task 03-05a removes the scheduled billing reconciliation route and its direct service-role store/audit wiring. Its governance baseline entry is deleted. Task 03-05b also removes single-Organization checkout/portal/recovery and billing/subscription ports from shared request contexts; 03-05c removes the webhook/provider and its ledger-cleanup caller while preserving authorized audit cleanup.

This ledger records places where current v1 reality and intended v1 direction diverge.

Each entry separates:

- what exists today
- what we want instead
- why the gap matters
- how contributors should behave until remediation lands

Apply the [stabilization decisions](ARCHITECTURE.md#stabilization-decisions) and [execution queue](../stabilization/TODO.md). These entries describe existing debt; recording a finding does not authorize a new exception or complete a migration. Newly discovered in-scope work needs a bounded queue task, and each cutover removes its obsolete consumers before closure.

## D-02 Provider-Boundary Leaks

- Current-state truth:
  - many server paths already use ports, adapters, entities, and use cases
  - invite acceptance page loading now uses hook-verified identity and pending-flow state; its redundant provider-session lookup and governance exception are removed
  - historical `#619` moved billing and export lifecycles behind store-backed helpers; D05 03-05b deletes the billing delivery helpers, retaining the export lifecycle
  - historical `#637` handled partial billing cancellation; D05 03-05b removes cancellation/recovery entirely, and 03-05c removes the webhook/provider
    - Critical Tasks workspace settings now load through an app-owned use case instead of the route layout
    - the legacy platform invite-code runtime route has been removed
    - Platform Administration aggregate Organization metrics now route through the `PlatformMetrics` use case and Supabase adapter instead of the route-level helper
    - Platform Administration membership and owner aggregate metrics now use service-role aggregate RPCs instead of adapter-side membership-row pagination
    - Platform Administration announcements CRUD now routes through the `PlatformAnnouncements` use case and Supabase adapter instead of direct route-level table calls
    - Platform Administration beta feedback list/update now routes through the `PlatformFeedback` use case and Supabase adapter instead of direct route-level table calls
      - Platform Administration gifting routes, commands, modal, use case and adapters are removed; historical gift data remains untouched
      - Platform Administration audit-log list/action/recent reads now route through the `PlatformAudit` use case and Supabase adapter instead of direct route-level audit table calls
        - Platform Administration organization-detail member reads, make-admin, and ownership transfer now route through the `PlatformMembershipAdministration` use case and Supabase adapter instead of route-level membership table calls
        - Platform Administration billing-event diagnostics and retry routes, use cases and adapters are removed; the subscription route and Billing Health diagnostics are also removed. Organization ledger, activation-health, dashboard/search and user-support commercial projections are gone. Organization JSON/Excel exports omit commercial sections and select only retained Organization profile fields
        - Platform Administration user-directory list/detail shaping now routes auth users, memberships, suspensions, and active personnel counts through the `PlatformUserDirectory` use case and Supabase adapter instead of route-level row shaping
        - Platform Administration user identity email commands now route through the `PlatformUserIdentityCommands` use case and Supabase adapter instead of route-local Supabase Auth calls
        - Platform Administration organization-detail reads use `PlatformOrganizationDetail` and its Supabase adapter for retained Organization identity, ownership and membership data; billing snapshots, gifts, feature overrides and reconciliation are removed from the detail surface
        - the organization members settings screen reads **Account Setup Link** state for its own pending **Organization Invitations** through a narrow optional service-role port on `UseCaseContext`, wired in `httpAdapter.ts` alongside `signInRosterPersonnelLookup`, rather than through route-level provider access (ADR 0012)
        - multiple non-adapter routes still depend directly on `locals.supabase`, especially admin operations and some remaining layout helpers
- Intended direction:
  - outside auth and adapter edges, business logic should be provider-agnostic
- Why this matters:
  - database-provider changes should not require feature and route rewrites
- Guardrail until fixed:
  - use app-owned use cases and adapters for business logic; remediation must remove existing leaks without adding baseline exceptions
- Recommended next slice:
  - isolate the remaining admin/platform `locals.supabase` clusters behind app-owned use cases and adapters

## D-03 Critical Tasks Permission Coupling (Resolved In #621)

- Current-state truth:
  - Critical Tasks now owns its own first-class v1 permission lane across route guards, membership booleans, invitation flows, and RLS
- Why this mattered:
  - the earlier Training piggyback made feature ownership and authz audits harder to explain
- Guardrail going forward:
  - do not re-borrow the Training lane for Critical Tasks behavior, exports, or route access

## Dashboard Training Summary Coupling (Resolved In 05-02-01)

The scoped Dashboard browser check exposed an unconditional Training summary request that rejected members with Training `none` and left their Dashboard blank. The route now omits that optional summary when Training access is absent, and the view omits its readiness claim. Training's policy remains enforced; authorized query failures still propagate. Calendar assignments and Critical Tasks keep their independent access. [Reproduction and retained-flow verification](../stabilization/EVIDENCE.md#task-05-02-01-dashboard-computed-event-cutover).

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
  - preserve the retained Personnel Duty Role field and its data contract; any declared migration must finish all affected consumers without old-path wrappers
  - do not introduce new user-facing `clinic role` copy or bare `Role` labels when the field really means `Duty Role`
- Recommended next slice:
  - runtime abstraction and migration plan once a repo-wide rename is explicitly approved

## D-07 Large Orchestration Modules

- Current-state truth:
  - several page contexts, views, and flows are large coordination-heavy modules
  - the dashboard client surface now has a feature-owned read-model boundary that centralizes hydrated-store joins, grouping preferences, and tab-facing display rows while leaving existing route/provider/authz boundaries unchanged
  - the calendar page now has a feature-owned range coordinator for client-side range expansion, store merging, retry state, and advanced duty event hydration
  - calendar reports now compose the shared Report Workspace and shared report-run/filter-selection primitives instead of maintaining five separate report chrome implementations
  - the Personnel detail artifact creation flows now compose a client-side `ArtifactDraft` seam for Follow-Ups, Leader Notes, Documents, and Counseling Records instead of keeping four cloned submit/state flows in the workspace
  - the bulk Availability Status surfaces now keep Availability Status Import rules (personnel matching, row validation, status resolution, record building) in a string-free reason-coded feature module, submit through the availability store's chunked batch seam instead of component-owned fetch, and share one Roster Picker instead of duplicated grouped-selection plumbing in the add and remove components
  - Training and Critical Tasks readiness counting now folds through the shared Readiness Rollup domain module (one home for the matrix walk, percent rounding, zero-applicable conventions, and seeded empty axes) instead of six hand-rolled per-feature aggregation loops, with classification, applicability gates, and presenters staying feature-owned
- Intended direction:
  - deeper modules with thinner public interfaces
- Why this matters:
  - large orchestration surfaces are harder to test, reason about, and safely change
- Guardrail until fixed:
  - use explicit architecture-review slices for deepening instead of incidental churn
- Recommended next slice:
  - Duty Roster generation/routes/exports are removed in phase 05 D01; complete Calendar duty hydration removal in D02 and remaining metadata/integrations in D03, then deepen retained Calendar, Personnel and Training modules through their queued tasks

## D-08 Route-Level Membership And Settings Logic (Resolved For Org Settings Governance)

- Current-state truth:
  - organization creation bootstrap now runs through an app-owned provisioning use case and Supabase adapter in `#618` while preserving the current default seeds and owner bootstrap behavior
  - dashboard invitation acceptance and membership creation moved behind an app-owned use case and adapter in `#616`
  - org settings invitation create/delete, member removal, and permission updates moved behind an app-owned use case and adapter in `#617`
  - org settings ownership transfer and delete flows moved behind an app-owned use case and Supabase adapter in `#626`
  - organization settings rename moved behind an app-owned use case and Supabase adapter in this architecture deepening slice
  - organization governance pages now live under `/org/[orgId]/settings/*`
  - stabilization 02-02-01b-03-02 closes the Organization suspension dispatch gap: a shared hook gate and user-scoped adapter deny writes/API requests before their consumers run, while page navigation retains the suspended shell; no new route provider exception is required
  - stabilization D03 removes tier reads, commercial DTOs and overlays from the retained shell, feature affordances and general settings; explicit suspension, membership, Group scope and step-up remain, and D05 03-05b removes billing pages and their commercial readers
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
  - CI defines format, lint, governance baseline checks, check, and test, but its manual-only trigger does not enforce automatic PR checks (F03; task 11-04)
  - a lightweight governance baseline check now exists for route-level provider leaks and known permission-lane couplings
  - issue templates and ADR guidance now exist for retrofit slicing and drift capture
  - there is still no comprehensive architecture-fitness suite
- Intended direction:
  - CI and template support that reinforces the repo's architecture and governance rules
- Why this matters:
  - architecture becomes guidance by prose alone unless it is reinforced operationally
- Guardrail until fixed:
  - use the baseline check to prevent new exceptions; remove resolved entries without shrinking scan coverage, and do not treat a passing check as proof of architectural correctness
- Recommended next slice:
  - deepen the checks once the first authz and provider-boundary remediation slices settle the target shape

## D-10 No Rescind Lever For Auto-Approved Platform Access

- Current-state truth:
  - an **Access Request** auto-approved from an **Organization Invitation** (ADR 0012) cannot have its platform access withdrawn between approval and setup completion
  - `reject` operates on pending requests only, and `'manual'` **Account Setup Link** revocation is unimplemented
  - a fatal setup-link creation failure blocks the invitation but leaves the request approved, so its owner could still obtain a credential through `/auth/renew-invite` even though the invitation never completed; no email is sent on that path, so nothing points them at it
  - the only mitigation is visibility: auto-approved rows are marked as such, with origin context, in the platform-admin reviewed-requests table
- Intended direction:
  - deliberately correct F01: invitation-origin platform approval and unused setup credentials need coherent issuance, renewal and rescind transitions, with provenance distinguishing independent approvals and sibling Organization grants
- Why this matters:
  - auto-approval moves the grant decision outside the platform admin's control while leaving the withdrawal decision inside it, so the two are no longer symmetric
- Guardrail until fixed:
  - preserve reviewed acquisition and separate invitation acceptance; reviewed-request marking remains a detection surface, not remediation
  - implement the repair at the owned workflow and SQL transition boundaries with concurrency-safe provenance rules; preserve unrelated approvals, another Organization's grant and existing accounts
- Recommended next slice:
  - task **11-01** in [TODO](../stabilization/TODO.md), after its prerequisites: test fatal setup issuance failure, renewal, rejection/rescind, concurrent invitations and independent approvals with deterministic clocks and failure cases. A blocked invitation must not unintentionally retain revocable platform entry. Billing removal makes the retained bridge unconditional and does not close F01; this entry remains unresolved until the repair and acceptance evidence exist.

## D-11 Onboarding Template Personnel Coupling (Repaired Locally)

- The original template/step policies borrowed Personnel read/edit helpers, denying independently authorized Onboarding configurators and allowing Personnel-only callers.
- [05-01-02-R01](../stabilization/EVIDENCE.md#task-05-01-02-r01-onboarding-template-policy-repair) replaces only those policies with independent Onboarding read/configure checks, Organization-only mutations, retained Group reads and same-tenant references. Authenticated template updates are limited to name/description. The subsequent `20260922000200_preserve_onboarding_step_ownership.sql` repair limits step updates to seven configuration fields, preventing the combined Organization/template move found by independent review while preserving same-Organization edits. Existing rows and Personnel helpers remain intact.
- This implements the existing feature-lane and scope decisions; it does not change the default architecture, operational onboarding policies or governance baseline. Local verification does not mean hosted policy deployment; the forward migration requires separately authorized operator execution.
