# V1 Drift Ledger

This ledger records places where current v1 reality and intended v1 direction diverge.

Each entry separates:

- what exists today
- what we want instead
- why the gap matters
- how contributors should behave until remediation lands

## D-02 Provider-Boundary Leaks

- Current-state truth:
	- many server paths already use ports, adapters, entities, and use cases
	- billing organization-state reads and writes plus the shared export-record lifecycle now run through app-owned store-backed helpers in `#619`
	- billing cancellation now acknowledges successful Stripe cancellation even if the immediate local organization reset fails, relying on the existing Stripe deleted-subscription webhook as the documented reconciliation path in `#637`
		- Critical Tasks workspace settings now load through an app-owned use case instead of the route layout
		- the legacy platform invite-code runtime route has been removed
		- Platform Administration aggregate Organization metrics now route through the `PlatformMetrics` use case and Supabase adapter instead of the route-level helper
		- Platform Administration announcements CRUD now routes through the `PlatformAnnouncements` use case and Supabase adapter instead of direct route-level table calls
		- multiple non-adapter routes still depend directly on `locals.supabase`, especially admin operations and some remaining layout helpers
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

## D-07 Large Orchestration Modules

- Current-state truth:
  - several page contexts, views, and flows are large coordination-heavy modules
  - the dashboard client surface now has a feature-owned read-model boundary that centralizes hydrated-store joins, grouping preferences, and tab-facing display rows while leaving existing route/provider/authz boundaries unchanged
  - the calendar page now has a feature-owned range coordinator for client-side range expansion, store merging, retry state, and advanced duty event hydration
  - calendar reports now compose the shared Report Workspace and shared report-run/filter-selection primitives instead of maintaining five separate report chrome implementations
  - the duty-roster page now keeps advanced-duty template normalization and applied-duty timeline collection rules behind a feature-owned module
  - the Personnel detail artifact creation flows now compose a client-side `ArtifactDraft` seam for Follow-Ups, Leader Notes, Documents, and Counseling Records instead of keeping four cloned submit/state flows in the workspace
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
  - organization governance pages now live under `/org/[orgId]/settings/*`
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
