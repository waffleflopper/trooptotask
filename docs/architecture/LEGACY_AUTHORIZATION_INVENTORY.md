# Legacy Authorization Inventory

Issue `#756` owns this inventory and the first guardrail for the legacy authorization removal program tracked by parent `#750`.

Legacy authorization entry points are:

- legacy per-feature booleans such as `can_view_*`, `can_edit_*`, and client `canEdit*` fields
- full-editor compatibility checks such as `isFullEditor` and `requireFullEditor`
- feature edit compatibility checks through `requireEdit(...)`
- single-Group scope storage or runtime checks through `scoped_group_id` and `scopedGroupId`

The stopping condition for the program is that production runtime authorization no longer depends on any of those entry points. Server-side writes and sensitive reads must be enforced through Policy Decisions, client affordances must use Capability Map and Scope Set data, and database/RLS helpers must no longer preserve legacy flags or single-Group scope as the durable authorization substrate.

## Guardrail

`npm run governance:check` scans production `src` files and Supabase SQL files for legacy authorization signals. Every remaining signal must appear in `docs/architecture/GOVERNANCE_BASELINE.json` under `legacyAuthorizationAllowlist` with:

- a classification
- the exact signal names found in the file
- the owning follow-up issue or decision point
- a reason and drift ledger reference

The guardrail intentionally excludes tests and docs from failure scanning. Tests may still cover old behavior, and docs may describe current-state history. New production runtime usage outside the allowlist fails the governance check.

## Classification Key

- `runtime-authorization`: production server or shared runtime code that still enforces access through a legacy entry point.
- `runtime-affordance`: client route, component, context, or utility code that still hides, disables, filters, or shapes UX from legacy authorization data. These are advisory but still need to move to Capability Map and Scope Set.
- `compatibility-adapter`: translation or persistence code that intentionally bridges legacy stored data into the replacement access model during migration.
- `historical-migration`: SQL migration history or database helper migration code. These references are historical or removal-program inputs, not new app-layer authorization patterns.
- `local-seed-fixture`: local seed data that still carries legacy columns for fixture compatibility.

## Runtime Inventory

| Owner | Classification | Files | Legacy signals | Follow-up |
| --- | --- | --- | --- | --- |
| Calendar and duty roster | `runtime-authorization`, `runtime-affordance` | `src/features/calendar/components/AssignmentPlannerPage.svelte`, `src/features/calendar/components/BulkStatusPage.svelte`, `src/features/calendar/components/CalendarPageView.svelte`, `src/features/calendar/components/CalendarSettingsPage.svelte`, `src/features/calendar/contexts/CalendarPageContext.svelte.ts`, `src/features/calendar/utils/calendarToolbarItems.ts`, `src/features/duty-roster/components/DutyRosterPage.svelte`, `src/lib/server/core/useCases/advancedDutyAccess.ts`, `src/lib/server/core/useCases/calendarQuery.ts`, `src/routes/org/[orgId]/calendar/+page.svelte`, `src/routes/org/[orgId]/calendar/assignments/+page.svelte`, `src/routes/org/[orgId]/calendar/bulk/+page.svelte`, `src/routes/org/[orgId]/calendar/duty-roster/+page.svelte` | `isFullEditor`, `canEdit*`, `scopedGroupId`, `requireFullEditor` | `#759` |
| Personnel | `runtime-authorization`, `runtime-affordance` | `src/features/personnel/components/PersonnelPageView.svelte`, `src/features/personnel/contexts/PersonnelPageContext.svelte.ts`, `src/lib/server/core/useCases/personnel.ts`, `src/routes/org/[orgId]/personnel/+page.svelte` | `isFullEditor`, `canEdit*`, `scopedGroupId` | `#760` |
| Training | `runtime-authorization`, `runtime-affordance` | None currently inventoried after #761. | None currently inventoried after #761. | `#761` converted Training record, configuration, report/export, workspace-load, and client affordance paths to Training-owned Policy Decisions. |
| Critical Tasks | `runtime-affordance` | `src/features/critical-tasks/components/IctPersonnelDetailPage.svelte`, `src/routes/org/[orgId]/critical-tasks/+page.svelte` | `canEdit*` | `#762` |
| Onboarding | `runtime-authorization`, `runtime-affordance` | `src/features/onboarding/components/OnboardingPageView.svelte`, `src/features/onboarding/contexts/OnboardingPageContext.svelte.ts`, `src/lib/server/core/useCases/onboardingLifecycle.ts`, `src/lib/server/core/useCases/onboardingQuery.ts`, `src/lib/server/core/useCases/onboardingResync.ts`, `src/lib/server/core/useCases/onboardingStepProgress.ts`, `src/lib/server/entities/onboardingTemplate.ts`, `src/lib/server/entities/onboardingTemplateStep.ts` | `isFullEditor`, `canEdit*`, `scopedGroupId`, `requireEdit(`, `requireFullEditor` | `#763` |
| Rating Scheme | `runtime-authorization`, `runtime-affordance` | `src/features/rating-scheme/components/RatingSchemePageView.svelte`, `src/features/rating-scheme/contexts/RatingSchemePageContext.svelte.ts`, `src/lib/server/core/useCases/ratingSchemeEntryCrud.ts` | `isFullEditor`, `canEdit*` | `#764` |
| Organization shell, member management, and client affordances | `runtime-authorization`, `runtime-affordance`, `compatibility-adapter` | `src/features/groups/components/OrganizationMemberManager.svelte`, `src/lib/access/memberAccessShape.ts`, `src/lib/server/adapters/supabaseDashboardOrgAccess.ts`, `src/lib/server/adapters/supabaseOrgSettingsMemberManagement.ts`, `src/lib/server/adapters/supabaseOrgShell.ts`, `src/lib/server/auto-accept-org-invites.ts`, `src/lib/server/core/orgShell.ts`, `src/lib/server/core/useCases/dashboardQuery.ts`, `src/lib/server/core/useCases/loadOrgShell.ts`, `src/lib/server/core/useCases/orgSettingsMemberManagement.ts`, `src/lib/server/core/useCases/organizationInvitationMembership.ts`, `src/lib/stores/orgContext.svelte.ts`, `src/lib/utils/scopePersonnel.ts`, `src/routes/org/[orgId]/+layout.svelte`, `src/routes/org/[orgId]/settings/+page.server.ts`, `src/routes/org/[orgId]/settings/+page.svelte` | `isFullEditor`, `canEdit*`, `can_view_*`, `can_edit_*`, `scopedGroupId`, `scoped_group_id` | `#757` partially converted the org shell data contract, shared org context affordance helpers, and primary shell navigation to Capability Map and Scope Set. Remaining references are compatibility fields, member-management persistence, dashboard/scope utilities, or feature-owned surfaces scheduled in later child issues. |
| Shared legacy authorization APIs | `runtime-authorization`, `compatibility-adapter` | `src/lib/server/adapters/httpAdapter.ts`, `src/lib/server/adapters/inMemory.ts`, `src/lib/server/adapters/supabaseAuthContext.ts`, `src/lib/server/core/ports.ts`, `src/lib/server/core/useCases/crud.ts`, `src/lib/server/entitySchema.ts`, `src/lib/server/groupAccess.ts`, `src/lib/server/permissionContext.ts`, `src/lib/types.ts` | `isFullEditor`, `requireFullEditor`, `requireEdit(`, `canEdit*`, `can_view_*`, `can_edit_*`, `scopedGroupId`, `scoped_group_id` | `#766`, `#767` |

## Historical, Fixture, And Documentation References

| Classification | Files | Legacy signals | Follow-up |
| --- | --- | --- | --- |
| `historical-migration` | `supabase/migrations/20260413001158_remote_schema.sql`, `supabase/migrations/20260414000100_critical_tasks_foundation.sql`, `supabase/migrations/20260421000100_critical_tasks_permission_lane.sql`, `supabase/migrations/20260423000100_rating_scheme_permission_lane.sql`, `supabase/migrations/20260423000200_rating_scheme_helper_search_path.sql`, `supabase/migrations/20260423000300_ensure_rating_scheme_personnel_lookup.sql`, `supabase/migrations/20260501000100_member_access_storage.sql` | `can_view_*`, `can_edit_*`, `scoped_group_id` | `#766` |
| `local-seed-fixture` | `supabase/seed.sql` | `can_view_*`, `can_edit_*`, `scoped_group_id` | `#766` |
| test coverage and fixtures | `*.test.ts`, `*.svelte.test.ts`, `e2e/global-setup.ts` | legacy fields used to prove or seed old compatibility behavior | covered by the owning runtime cluster |
| docs and plans | `CONTEXT.md`, `UBIQUITOUS_LANGUAGE.md`, `docs/architecture/*`, `docs/plans/*`, `docs/entity-system.md` | current-state history, prior PRDs, or entity-system reference material | update as the owning follow-up issues remove the runtime clusters |

## Out Of Scope For This Slice

- converting individual workflows to Policy Decisions
- deleting compatibility fields or database helpers
- changing database/RLS behavior
- resolving the Leader's Book product decision
