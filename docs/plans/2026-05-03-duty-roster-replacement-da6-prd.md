# Duty Roster Replacement DA6 Generator PRD

## Problem Statement

The current duty-roster area has split into legacy simple rosters, advanced duty rosters, and an Assignments / Taskings surface. That split no longer matches the product need. The advanced duty model became a side-by-side team-duty system when the desired feature is a deeper DA Form 6 roster generator that replaces both old lanes.

Users need a trustworthy way to build one-duty DA6 rosters such as CQ NCO, CQ runner, Staff Duty NCO, or Staff Duty runner. Each roster needs its own pool, counts, history, exports, and optional Calendar application. The system must reduce manual DA6 work without making history feel mutable or fragile.

The new feature must not repeat the old route's shallow-module shape. It needs deep, testable modules for DA6 generation, snapshots, acceptance, invalidation, corrections, Calendar linkage, and export models. It also needs a high-quality operational UI. When this PRD is later sliced into issues, the UX cannot become an afterthought or a polish-only follow-up.

## Solution

Build a new replacement **Duty Roster** surface at `/org/[org]/duty-rosters`.

The new surface is template-first. A **Duty Roster Template** represents one duty position with its own **Duty Roster Pool**, duty-specific exemptions, optional **Manual DA6 Baseline**, short code, slug, generation workflow, accepted history, correction trail, DA6 matrix, export/print surfaces, and Calendar application state.

The old simple duty roster, advanced duty roster, and Assignments / Taskings duty-roster surfaces are superseded by this replacement. Legacy duty-roster data does not need to migrate into the new system. Existing Calendar assignments stay in Calendar.

## User Stories

1. As an operator, I want one replacement Duty Roster route, so that I do not have to choose between old simple and advanced roster lanes.
2. As an operator, I want each duty position to be its own template, so that CQ NCO and CQ runner keep separate counts.
3. As an operator, I want a template list as the entry point, so that I can quickly open the roster I need.
4. As an operator, I want each template to have Generate, History, and Settings views, so that repeated work stays organized.
5. As an operator, I want those views to have real URLs, so that browser refresh and back/forward navigation keep me in the same place.
6. As an operator, I want human-readable template URLs, so that links do not expose long UUIDs.
7. As an operator, I want editable template slugs, so that routes can match unit language.
8. As an operator, I want slug collisions handled inside the Organization, so that template links stay unique without global naming rules.
9. As an operator, I want a short display code that can repeat across templates, so that related duties can share a compact Calendar badge like CQ.
10. As an operator, I want a high-quality operational UI, so that duty roster work feels dependable and clear under time pressure.
11. As an operator, I want the UI to make templates, history, corrections, warnings, and actions easy to scan, so that the feature does not become another spreadsheet-shaped burden.
12. As an operator, I want the app to generate rosters from DA6 rules, so that I do not manually calculate the next duty.
13. As an operator, I want the generator to choose the Soldier with the longest break from that duty, so that selection follows the normal DA6 fairness rule.
14. As an operator, I want a new roster without baseline data to start from DA6 roster order, so that first use follows standard rank and alphabetical ordering.
15. As an operator, I want optional starting counts, so that I can pick up from a prior manual or outside DA6 system.
16. As an operator, I want baseline counts to apply only until the first accepted run, so that old setup data does not remain mutable live state.
17. As an operator, I want template pool criteria by rank, Group, MOS, and Duty Role, so that the roster can match the people who should pull that duty.
18. As an operator, I want pool criteria to use OR within a category and AND across categories, so that filters behave predictably.
19. As an operator, I want exemptions to be selected only from the resolved pool, so that I do not exempt people who were never eligible.
20. As an operator, I want duty-specific exemptions to remove people from a duty pool, so that permanent duty restrictions are separate from date availability.
21. As an operator, I want Calendar Status Types to provide DA6 availability treatment, so that templates do not redefine unavailable statuses.
22. As an operator, I want overlapping statuses to resolve predictably, so that leave and other duty do not create ambiguous cells.
23. As an operator, I want `A`, `D`, and future `U` to drive whether counts increment, so that DA6 numbering stays correct.
24. As an operator, I want `U` support preserved in the engine but not enabled in normal UI yet, so that misconduct/AWOL handling is not casually introduced without the right workflow.
25. As an operator, I want Generate to show a preview first, so that I can review the roster before it becomes official.
26. As an operator, I want the preview to show a list view and DA6 matrix view, so that I can understand assignments and inspect the form-like output.
27. As an operator, I want to manually change a preview assignment before accepting, so that human judgment can fix the roster before it becomes official.
28. As an operator, I want manual preview selections marked as `MANUAL`, so that history shows where human judgment changed the generated proposal.
29. As an operator, I want clean manual swaps to avoid unnecessary reason entry, so that common review edits stay fast.
30. As an operator, I want manual choices with warnings to require a reason, so that risky or outside-pool decisions are explainable.
31. As an operator, I want archived or missing personnel to be hard blocked, so that manual selection cannot create invalid history.
32. As an operator, I want most other manual conflicts to be reviewable, so that real-unit exceptions can be handled without breaking the workflow.
33. As an operator, I want the preview list to show the final selected Soldier and access to the original generated Soldier, so that the change is visible without clutter.
34. As an operator, I want the DA6 matrix cells to show only authorized DA6 markings, so that the matrix remains form-like.
35. As an operator, I want Print Draft to print without accepting the run, so that I can review or brief a draft without changing history.
36. As an operator, I want Accept and Print to save the official run before opening print preview, so that official output always has history behind it.
37. As an operator, I want Apply to Calendar to accept the run if needed, so that Calendar application and DA6 history stay linked.
38. As an operator, I want accepted runs to be official history even if they are not applied to Calendar immediately, so that printed rosters still advance counts.
39. As an operator, I want to apply an accepted run to Calendar later from history, so that printing and Calendar application can happen at different times.
40. As an operator, I want accepted history to use the saved run snapshot, so that later personnel or template changes do not rewrite the past.
41. As an operator, I want template edits to affect future runs only, so that accepted history remains trustworthy.
42. As an operator, I want to invalidate only the latest accepted run, so that recent mistakes can be undone without rewriting older history.
43. As an operator, I want invalidated runs to remain visible and locked, so that the audit trail explains what happened.
44. As an operator, I want invalidation to remove Calendar assignments created by that run, so that Calendar does not keep invalid duty entries.
45. As an operator, I want a clear invalidation confirmation, so that I understand Calendar assignments will be removed.
46. As an operator, I want run-created Calendar assignments to keep lineage to the accepted run, so that invalidation and history inspection can act safely.
47. As an operator, I want invalidation to remove generated Calendar assignments even if they were manually edited later, so that the rollback is complete.
48. As an operator, I want the app to warn me when invalidating a run whose Calendar assignments were later edited, so that I understand what will be removed.
49. As an operator, I want post-acceptance changes to use a Duty Roster Correction, so that official history is corrected instead of silently edited.
50. As an operator, I want a correction to capture who was originally assigned, who actually served, the date, reason, actor, and timestamp, so that it mirrors a duty swap memo.
51. As an operator, I want correction reasons to be required, so that future readers understand why the swap happened.
52. As an operator, I want corrections to affect future counts based on who actually performed the duty, so that future rosters stay fair.
53. As an operator, I want corrections to update Calendar assignments when the run was applied, so that Calendar shows the current operational truth.
54. As an operator, I want corrections to remain visible if a run is invalidated, so that the audit trail stays intact.
55. As an operator, I want corrections on invalidated runs to stop affecting counts, so that invalidated history does not drive future generation.
56. As an operator, I want accepted history to include both a list view and DA6 matrix view, so that corrections and form review each have the right surface.
57. As an operator, I want official exports to come from accepted run history, so that printed or exported DA6 output matches the system of record.
58. As a scoped leader, I want access rules to respect Calendar/Duty Roster permissions, so that only authorized users can generate, accept, apply, correct, invalidate, or configure rosters.
59. As a future implementer, I want deep module boundaries, so that DA6 logic is testable outside Svelte routes and UI state.
60. As a future implementer, I want vertical slices to include UI acceptance criteria, so that the final system does not ship with backend correctness and a poor workflow.

## Implementation Decisions

### Product Boundary

- The new **Duty Roster** replaces the old simple duty roster, advanced duty roster, and Assignments / Taskings duty-roster surfaces.
- Existing Calendar assignments remain in Calendar and are not migrated into the new DA6 history.
- Legacy duty-roster data does not need to migrate into the new system.
- The old advanced duty/team-duty model should be treated as legacy current-state, not the target model.

### Route And Workspace

- The route target is `/org/[org]/duty-rosters`.
- The entry point is a template-first workspace.
- Each template exposes Generate, History, and Settings as URL-addressable views.
- Intended route shape:
  - `/org/[orgId]/duty-rosters`
  - `/org/[orgId]/duty-rosters/[templateSlug]/generate`
  - `/org/[orgId]/duty-rosters/[templateSlug]/history`
  - `/org/[orgId]/duty-rosters/[templateSlug]/settings`
- `[templateSlug]` should be a human-readable **Duty Roster Template Slug**, scoped to the Organization.
- The internal template id remains the stable database identity.
- Template slugs default from the template name, are editable in settings, and must be unique inside the Organization.
- The app should not keep indefinite slug redirect history. If stale redirects are later added, they should be short-lived cleanup aids.
- Templates may also have a non-unique **Duty Roster Short Code** for compact display.

### High-Quality UI Requirement

This feature must include high user experience UI work in the implementation plan, not as a vague follow-up.

- The route should feel like a dense operational work surface, not a marketing page, card soup, or generic wizard.
- Template list, template workspace, generation preview, history, settings, correction flows, invalidation confirmation, and print/export surfaces all need deliberate UX acceptance criteria.
- Browser refresh, deep links, back/forward navigation, loading states, empty states, validation states, warning states, and destructive confirmations are part of the feature.
- The UI should use the TroopToTask product design language: warm paper surfaces, dark ink, hairline rules, tight radii, mono metadata labels, restrained operational amber, dense tables/grids, and predictable controls.
- The DA6 matrix and operational list view must be visually distinct because they serve different jobs.
- Later `to-issues` slicing must include UI implementation and UI verification slices, not just backend/model slices.

### Template Pool And Baseline

- A **Duty Roster Template** describes one duty position only.
- Pool filters include Rank, Group, MOS, and Duty Role.
- Filters combine with OR inside a category and AND across categories.
- Duty-specific exemptions are selected only from the resolved pool.
- A **Manual DA6 Baseline** is optional and stores starting counts for resolved, non-exempt pool members.
- If no baseline exists, first generation starts from **DA6 Roster Order**.
- After the first accepted run, baseline data is locked as setup history and accepted, non-invalidated history drives future counts.

### DA6 Generation Rules

- The generator should follow DA Pam 220-45 behavior where the product has enough data.
- A new roster starts from **DA6 Roster Order**: alphabetically within pay grade, beginning with the highest pay grade.
- Duty selection uses the Soldier with the longest break from that duty first.
- DA6 roster order breaks ties when history and baseline data do not separate Soldiers.
- Pool members remain in the DA6 matrix when unavailable on a duty date.
- Unavailability reason controls count behavior:
  - **Authorized Absence**: `A`, nonchargeable, interrupts numbering.
  - **Other Duty**: `D`, chargeable, continues numbering.
  - **Misconduct Unavailable**: `U`, chargeable, continues numbering once the product workflow exists.
- Status Type **DA6 Availability Treatment** is the source of status meaning.
- Templates do not redefine unavailable statuses.
- Overlapping statuses use the documented priority: future `U` once enabled, then `A`, then `D`.
- `U` support should exist in the engine but should not be enabled in normal UI until a misconduct/AWOL workflow and audit trail exists.

### Preview, Acceptance, Printing, And Calendar Apply

- Generate creates a preview only.
- Preview does not affect official DA6 history or future counts.
- Preview supports list review and DA6 matrix review.
- The preview list shows final selected Soldier, `MANUAL` markers, warning/reason state, and access to the original generated Soldier.
- The DA6 matrix shows only DA6 markings such as sequence numbers, `A`, `D`, and future `U`.
- Print Draft is allowed from preview and does not accept the run.
- Accept and Print saves the accepted run before opening print preview.
- Apply to Calendar accepts the run if it was still a preview.
- Accepted runs advance future counts whether or not they are applied to Calendar.
- Accepted runs that were not applied immediately can be applied later from history.
- Official print/export output should come from accepted history.

### Snapshots And History

- Each generated run snapshots the resolved pool, exemptions, baseline/count source, relevant status treatment, generated result, final selected result, display fields, warnings, and export model.
- Accepted history, official exports, and later Calendar apply use the saved **Run Snapshot**, not current Personnel, template, or Calendar state.
- Template edits affect future runs only and must not mutate accepted history.
- Accepted history should include both:
  - operational list view for understanding, corrections, and swap context
  - DA6 matrix view for form review, print, and export

### Manual Selection Before Acceptance

- Operators may manually change a generated preview assignment before acceptance.
- Manual choices are preserved in accepted history.
- A `MANUAL` marker is preferred for manually selected rows.
- Manual selections may choose someone outside the generated pool as a reviewable human decision.
- Archived or missing Personnel Records are hard blocks.
- Most manual conflicts should be reviewable with warnings and reason capture instead of hard-blocked.
- Clean swaps between eligible Soldiers do not require a reason.
- Manual choices with reviewable warnings require a reason.

### Invalidation

- Only the latest accepted run for a template may be invalidated.
- Invalidation marks the run unusable, keeps it visible and locked in history, and excludes it from future count derivation.
- Invalidation is an audit action for recent mistakes, not a way to rewrite older history.
- If the run was applied to Calendar, invalidation removes the Calendar assignments created by that run.
- The confirmation warning should clearly say: "Invalidating this run will remove the assignments from the calendar. Are you sure?"
- If Calendar assignments created by the run were edited after apply, invalidation should warn clearly but still remove the whole run's Calendar footprint.

### Calendar Linkage

- Applying a run to Calendar creates or updates Calendar assignments while preserving lineage back to the accepted run.
- Run-to-Calendar lineage is required so invalidation can remove exact records without guessing by date, template, or person.
- Calendar remains the operational schedule; Duty Roster remains the DA6 history.

### Duty Roster Corrections

- Post-acceptance changes use **Duty Roster Corrections**, not manual preview selections.
- A correction preserves the original accepted Soldier and records the replacement Soldier who actually performs the duty.
- A correction captures duty date, reason, actor, and timestamp.
- A correction reason is required.
- Corrections should support duty-swap memo language: replacement Soldier performs the duty for original Soldier because of a stated reason.
- Corrections affect future count derivation based on who actually performed duty.
- If the accepted run was applied to Calendar, corrections update the Calendar assignment while preserving lineage to the accepted run.
- If a run is invalidated, its corrections stay visible in that run's history but no longer affect future counts.

### Deep Module Targets

Implementation should avoid route/component-owned business logic. Candidate deep modules:

- **Duty Roster Template Module**: template identity, slug, short code, pool criteria, exemptions, lifecycle, and settings validation.
- **Duty Roster Pool Module**: pool resolution, OR/AND filter semantics, exemption validation, and pool snapshots.
- **DA6 Generation Module**: DA6 ordering, count derivation, availability classification, selection, warnings, and matrix construction.
- **Duty Roster Run Module**: preview snapshots, acceptance, export model, official history payloads, and run state.
- **Duty Roster Calendar Linkage Module**: apply to Calendar, lineage, correction sync, and invalidation removal.
- **Duty Roster Correction Module**: post-acceptance corrections, reason enforcement, count impact, and display model.
- **Duty Roster Workspace UI Module**: template-first route UX, durable URL state, preview list, DA6 matrix, history, settings, empty/loading/error states, and destructive confirmations.

## Testing Decisions

Good tests should verify product behavior and module contracts, not incidental implementation details.

Core test targets:

- Template slug uniqueness, default slug generation, editable slug behavior, and no indefinite redirect-history dependency.
- Pool resolution with OR-within-category and AND-across-category semantics.
- Exemptions limited to resolved pool members.
- Baseline counts only applying until the first accepted run.
- DA6 roster order by pay grade and alphabetical order.
- Longest-break selection and tie-breaking.
- Status treatment mapping for `A`, `D`, and future `U`.
- Overlapping status priority.
- Snapshot stability after Personnel, template, and Calendar changes.
- Manual preview selections, `MANUAL` markers, reviewable warnings, and reason requirements.
- Acceptance behavior for Apply to Calendar and Accept and Print.
- Print Draft not accepting a run.
- Later Calendar apply from accepted history.
- Calendar lineage for applied runs.
- Latest-run-only invalidation.
- Invalidation removing Calendar assignments and excluding the run from counts.
- Correction creation with required reason, original Soldier, replacement Soldier, actor, timestamp, and count impact.
- Correction sync to Calendar.
- Corrections becoming non-counting when the parent run is invalidated.
- URL-backed template workspace navigation and refresh behavior.
- UI rendering of template list, generate, history, settings, warning states, empty states, and destructive confirmations.

Prior art:

- Existing pure DA6 generation tests in the current duty-roster run module.
- Existing status treatment utilities and tests.
- Existing calendar assignment and daily assignment tests.
- Existing advanced duty snapshot/correction tests for snapshot and append-only history patterns.
- Existing Svelte page tests for route-level UI behavior.

## Out Of Scope

- Migrating legacy simple roster, advanced duty roster, or Assignments / Taskings duty-roster data into the new DA6 system.
- Building a full misconduct/AWOL workflow for `U`.
- Replacing all Calendar assignment behavior outside the Duty Roster apply/correction/invalidation linkage.
- Keeping permanent redirect history for every old template slug.
- Preserving the old advanced team-duty product model as the future target.
- Production database migration execution. Migrations must be reviewed and run remotely by the user before merging.
- Resetting or deleting local or remote database data.

## Further Notes

- This PRD supersedes the old two-lane simple/advanced duty-roster target.
- Future `to-issues` slicing should include explicit UI/UX slices and acceptance criteria, not only backend foundations.
- The first implementation should likely ship behind the new `/org/[org]/duty-rosters` route, then switch routing and redirect the legacy duty-roster route once the replacement is ready.
- Existing Calendar assignments remain available during rollout so there is no period where duty visibility disappears.
- DA Pam 220-45 is the current DA6 behavior reference used for ordering and `A` / `D` / `U` count treatment.
