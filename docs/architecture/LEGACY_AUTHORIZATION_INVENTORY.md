# Legacy Authorization Inventory

Issue `#756` owns this inventory and the first guardrail for the legacy authorization removal program tracked by parent `#750`.

Legacy authorization entry points are:

- legacy per-feature booleans such as `can_view_*`, `can_edit_*`, and client `canEdit*` fields
- full-editor compatibility checks such as `isFullEditor` and `requireFullEditor`
- feature edit compatibility checks through `requireEdit(...)`
- single-Group scope storage or runtime checks through `scoped_group_id` and `scopedGroupId`

The shared runtime APIs for `requireEdit(...)`, `requireFullEditor`, and `isFullEditor` have been deleted. The remaining program stopping condition is that production runtime authorization no longer depends on any of the remaining legacy entry points. Server-side writes and sensitive reads must be enforced through Policy Decisions, client affordances must use Capability Map and Scope Set data, and database/RLS helpers must no longer preserve legacy flags or single-Group scope as the durable authorization substrate.

## Guardrail

`npm run governance:check` scans production `src` files and Supabase SQL files for legacy authorization signals. Every remaining signal must appear in `docs/architecture/GOVERNANCE_BASELINE.json` under `legacyAuthorizationAllowlist` with:

- a classification
- the exact signal names found in the file
- the owning follow-up issue or decision point
- a reason and drift ledger reference

The guardrail intentionally excludes tests and docs from failure scanning. Tests may still cover old behavior, and docs may describe current-state history. New production runtime usage outside the allowlist fails the governance check.

## Classification Key

- `compatibility-adapter`: translation or persistence code that intentionally bridges legacy stored data into the replacement access model during migration.
- `historical-migration`: SQL migration history or database helper migration code. These references are historical or removal-program inputs, not new app-layer authorization patterns.
- `local-seed-fixture`: local seed data that still carries legacy columns for fixture compatibility.

## Runtime Inventory

| Owner | Classification | Files | Legacy signals | Follow-up |
| --- | --- | --- | --- | --- |
| Calendar and duty roster | None | None currently inventoried after #759 and #768. | None currently inventoried after #759 and #768. | `#759` converted Calendar workflows to Calendar-owned Policy Decisions. `#768` removed stale duty roster and calendar route-shell legacy affordance pass-throughs from the production scan. |
| Personnel | None | None currently inventoried after #760. | None currently inventoried after #760. | `#760` converted Personnel workflows and affordances to Personnel-owned Policy Decisions. |
| Training | None | None currently inventoried after #761. | None currently inventoried after #761. | `#761` converted Training record, configuration, report/export, workspace-load, and client affordance paths to Training-owned Policy Decisions. |
| Critical Tasks | None | None currently inventoried after #762. | None currently inventoried after #762. | `#762` converted the remaining Critical Tasks client affordance paths to Policy Decisions. |
| Onboarding | None | None currently inventoried after #763. | None currently inventoried after #763. | `#763` converted the remaining Onboarding workflow, template, and client affordance paths to Policy Decisions. |
| Rating Scheme | None | None currently inventoried after #764. | None currently inventoried after #764. | `#764` converted the remaining Rating Scheme workflow and client affordance paths to Policy Decisions. |
| Organization shell, member management, and client affordances | `compatibility-adapter` | `src/features/groups/components/OrganizationMemberManager.svelte`, `src/lib/access/memberAccessProjection.ts`, `src/lib/access/memberAccessShape.ts`, `src/lib/server/adapters/supabaseOrgShell.ts`, `src/lib/server/core/orgShell.ts`, `src/lib/stores/orgContext.svelte.ts`, `src/routes/org/[orgId]/+layout.svelte` | `isFullEditor`, `canEdit*`, `scopedGroupId` | `#757` moved shared org/client affordance behavior to Capability Map and Scope Set. `#765` policy-converted the remaining supported `Leader's Book` compatibility lane with explicit Policy Decision actions and a separate compatibility lane map. `#976` moved Organization Settings workspace route data behind a shaped read model. `#1113` removed active storage fallback/projection from legacy Permission Flags and `scoped_group_id`; remaining references are route-data compatibility fields derived from replacement storage, not active runtime authorization classifications. The old client-side `scopePersonnel` helper has been deleted; current roster filtering goes through the Roster Read Model. |
| Shared legacy authorization APIs | `compatibility-adapter` | `src/lib/types.ts` | `canEdit*`, `scopedGroupId` | `#767` deleted the shared edit/full-editor runtime APIs. Remaining entries are shared route-data fields owned by the org-shell/member-access migration. `groupAccess.ts` now adapts to Scope Set matching instead of owning legacy `scopedGroupId` semantics. |

## Historical, Fixture, And Documentation References

| Classification | Files | Legacy signals | Follow-up |
| --- | --- | --- | --- |
| `historical-migration` | `supabase/migrations/20260413001158_remote_schema.sql`, `supabase/migrations/20260414000100_critical_tasks_foundation.sql`, `supabase/migrations/20260421000100_critical_tasks_permission_lane.sql`, `supabase/migrations/20260423000100_rating_scheme_permission_lane.sql`, `supabase/migrations/20260423000200_rating_scheme_helper_search_path.sql`, `supabase/migrations/20260423000300_ensure_rating_scheme_personnel_lookup.sql`, `supabase/migrations/20260501000100_member_access_storage.sql`, `supabase/migrations/20260522000500_organization_invitation_membership_role_snapshot.sql`, `supabase/migrations/20260522000600_accept_organization_invitation_transition.sql`, `supabase/migrations/20260522001000_accept_invitation_requires_completed_access_request_setup.sql`, `supabase/migrations/20260526000100_normalize_member_access_replacement_storage.sql`, `supabase/migrations/20260526000300_drop_legacy_member_access_columns.sql` | `can_view_*`, `can_edit_*`, `can_manage_members`, `scoped_group_id` | `#766`, `#1009`, `#1010`, `#1013`, `#1108`, `#1114` |
| `compatibility-adapter` | `supabase/migrations/20260526000250_repair_rls_before_legacy_member_access_drop.sql` | `can_view_*`, `can_edit_*` | `#1114` |
| `compatibility-adapter` | `supabase/migrations/20260502000100_remove_legacy_authorization_from_rls_helpers.sql` | `can_view_*`, `can_edit_*` | `#766` replaced the active helper bodies with member preset, capability override, and Scope Set checks. The helper names remain only as the existing RLS policy API and do not define app-layer authorization APIs. |
| `compatibility-adapter` | `supabase/migrations/20260503000200_advanced_duty_revision_storage.sql` | `can_view_*` | `#778` uses the existing Calendar view helper only for compact applied Advanced Duty Revision Change Set history reads. Draft payload reads/writes and history writes use the new advanced-duty revision management helper. |
| `compatibility-adapter` | `supabase/migrations/20260504000100_duty_roster_templates.sql` | `can_view_*`, `can_edit_*` | `#801` uses the existing Calendar helper API only for table-level Duty Roster Template RLS. The new route and service layer enforce Calendar Policy Decisions for list, open, and create behavior. |
| `compatibility-adapter` | `supabase/migrations/20260504000300_duty_roster_template_runs.sql` | `can_view_*`, `can_edit_*` | `#805` uses the existing Calendar helper API only for table-level accepted Duty Roster Run RLS. The route and service layer enforce Calendar Policy Decisions for list, generate, manual selection, settings, and accept behavior. |
| `compatibility-adapter` | `supabase/migrations/20260504000500_duty_roster_run_invalidation.sql` | `can_edit_*` | `#808` uses the existing Calendar helper API only for the table-level invalidation status update. The service layer enforces latest-run invalidation, History locking, future-count exclusion, and Calendar rollback behavior. |
| `compatibility-adapter` | `supabase/migrations/20260504000600_duty_roster_run_corrections.sql` | `can_view_*`, `can_edit_*` | `#809` uses the existing Calendar helper API only for table-level Duty Roster Correction reads and inserts. The service layer enforces append-only correction records, future-count impact, invalidated-run non-counting behavior, and Calendar sync. |
| `compatibility-adapter` | `supabase/migrations/20260515000100_create_leader_notes.sql` | `can_view_*`, `can_edit_*` | `#887` uses the existing Personnel helper API only for table-level Leader Notes RLS. The route and service layer enforce Personnel Policy Decisions and group-scope checks for list and create behavior. |
| `compatibility-adapter` | `supabase/migrations/20260515000500_retire_leaders_book.sql` | `can_view_*`, `can_edit_*` | `#891` redefines the existing sensitive-file storage helper API so counseling attachment reads and writes dispatch to Personnel helpers before the old Leaders Book helpers are dropped. |
| `compatibility-adapter` | `supabase/migrations/20260515000600_repair_groups_access_after_leaders_book_retirement.sql` | `can_view_*` | `#891` repairs the existing Groups RLS helper API after Leaders Book column removal so Personnel bootstrap can read groups through durable member-access capabilities instead of dropped Leaders Book flags. |
| `compatibility-adapter` | `supabase/migrations/20260515001200_counseling_records_scope_and_document_cap.sql` | `can_view_*`, `can_edit_*` | `#893` redefines the existing sensitive-file storage helper API so counseling attachment reads and writes retain the historical function names while enforcing Personnel capability and group-scope checks. |
| test coverage and fixtures | `*.test.ts`, `*.svelte.test.ts`, `e2e/global-setup.ts`, `src/lib/test-support/orgContextBuilder.ts` | legacy fields used to prove or seed old compatibility behavior | covered by the owning runtime cluster |
| docs | `CONTEXT.md`, `UBIQUITOUS_LANGUAGE.md`, `docs/architecture/*`, `docs/entity-system.md` | current-state history or entity-system reference material | update as the owning follow-up issues remove the runtime clusters |

## Out Of Scope For This Slice

- converting remaining org-shell/member-management compatibility fields
- deleting historical helper names
- changing database/RLS behavior
- deleting Leader's Book compatibility fields before the rebuilt surface decision is ready
