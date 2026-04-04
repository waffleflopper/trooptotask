# Advanced Duty Roster Rebuild PRD

## Problem Statement

The current duty-roster generator works for a narrow slice of the duty-planning problem: one assignment type, one assignee per date, a simple date range, and a simplified DA Form 6-style fairness rule. That is useful for basic recurring duties, but it breaks down for the real-world Army workflows users are asking for.

Users need the system to handle staff duty, charge of quarters, and similar team-based duties where one duty event can require multiple people at once with different role requirements. They also need the app to understand that some duties are blocking, meaning an assigned Soldier should not be considered available for overlapping duties, and some duties should enforce a rest or cooldown window after the shift ends. Today the generator does not model team structure, timed duty windows, blocking, cooldown, or meaningful review/edit flows before apply.

The result is a feature that feels too flat for complex duties, forces users to do mental gymnastics around conflicts, and makes the operator absorb too much system logic at once. The rebuild should preserve the value of the current simple generator while introducing a much more robust, intuitive, step-by-step workflow for advanced duties.

## Solution

Rebuild duty planning as a two-lane system:

1. A **simple lane** for existing one-person recurring duties that preserves DA Form 6-style rotation and familiar roster behavior.
2. An **advanced lane** for team-based duties such as staff duty and CQ, where a duty template can define coverage windows, blocking rules, cooldown rules, multiple slot definitions, slot quantities, rank eligibility, and soft scheduling preferences.

Both lanes should live inside a shared wizard shell so the product feels consistent, but the simple lane should hide complexity and move quickly. The advanced lane should separate the reusable template definition from the generation run, explain its rules in plain language, preview filled and unfilled slots, allow manual edits before apply, and preserve a first-class duty event so the team remains editable as a unit after generation.

The implementation should ship in phases. Phase 1 should establish the new duty data model, compatibility bridge, generation engine, collision/conflict rules, and a slim wizard. Phase 2 should add the more polished step-by-step experience, presets, richer explanations, stronger fairness tooling, and higher-fidelity calendar/export UX.

## User Stories

1. As an admin, I want to keep using simple one-person duty rosters, so that current organizations do not lose existing functionality.
2. As an admin, I want advanced duties and simple duties to live in the same overall feature area, so that duty planning feels coherent instead of fragmented.
3. As an admin, I want to create a reusable duty template, so that I do not have to rebuild the same staff-duty setup every time.
4. As an admin, I want to create a one-time duty run without saving a reusable template, so that I can handle unusual duty periods without extra ceremony.
5. As an admin, I want to start from presets such as company CQ or battalion staff duty, so that I can get moving quickly.
6. As an admin, I want to start from a blank advanced template, so that I can model unit-specific duty structures.
7. As an admin, I want to define whether a duty is all-day or timed, so that the system can understand overlap correctly.
8. As an admin, I want timed duties to support shifts that cross midnight, so that staff duty and CQ can be modeled accurately.
9. As an admin, I want to define whether a duty is blocking, so that assigned personnel are not double-booked into conflicting duties.
10. As an admin, I want cooldown/rest hours on a duty template, so that someone coming off an overnight duty is not assigned again too soon.
11. As an admin, I want cooldown to apply automatically after the duty end time, so that blocking behavior matches how units actually schedule recovery.
12. As an admin, I want to define multiple slot types within one duty template, so that one event can include roles like officer, NCO, and runners.
13. As an admin, I want each slot type to have its own quantity, so that I can request one NCO and two runners without duplicating setup unnecessarily.
14. As an admin, I want slot definitions to expand into individual slot instances automatically, so that the system stays easy to configure.
15. As an admin, I want each slot to define allowed ranks, so that the generator respects duty-specific grade requirements.
16. As an admin, I want slot eligibility to optionally filter by group, MOS, and role, so that I can narrow the candidate pool using existing personnel data.
17. As an admin, I want permanent exemptions to still apply, so that certain personnel are never selected for specific duties.
18. As an admin, I want the generator to derive the normal candidate pool from rules instead of manual clicking, so that recurring duties stay maintainable.
19. As an admin, I want a review step where I can exclude or force-include specific personnel for one generation run, so that I still have practical control.
20. As an admin, I want fairness tracked per role or shared rotation pool, so that interchangeable slots can rotate together while distinct roles rotate separately.
21. As an admin, I want the generator to use “longest break since last duty” as a default fairness rule, so that the system still feels familiar and Army-aligned.
22. As an admin, I want soft preferences such as avoiding recent weekend duty, avoiding back-to-back holidays/closures, and preferring selected groups, so that the generator reflects local scheduling judgment.
23. As an admin, I want those soft preferences stored on the template, so that repeated runs remain consistent.
24. As an admin, I want quick setup to use sensible default preference ordering, so that first-time users are not overwhelmed.
25. As an admin, I want full configuration mode to let me reorder soft preference priority, so that power users can tune tie-break behavior.
26. As an admin, I want the generator to fill the hardest-to-staff slots first, so that scarce candidates are not wasted on easier roles.
27. As an admin, I want the generator to forbid using the same Soldier twice in the same duty event, so that the system does not solve shortages in unrealistic ways.
28. As an admin, I want the generator to support weekday-only, weekend-only, selected weekday, holiday/closure-only, and custom-date patterns, so that I can build realistic duty runs.
29. As an admin, I want to lock selected assignments before generation, so that the system can fill around already-decided duty positions.
30. As an admin, I want the preview to show partial results when not everything can be filled, so that I can understand the shortfall instead of getting a useless failure.
31. As an admin, I want unfilled slots to explain why they were unfilled, so that I can fix eligibility or staffing problems quickly.
32. As an admin, I want the review screen to explain why a specific person was chosen or skipped, so that I can trust the generator.
33. As an admin, I want the review screen grouped by duty event/date first, so that I can understand who is on duty for a given shift.
34. As an admin, I want secondary fairness views by slot or rotation pool, so that I can inspect the underlying queue logic when needed.
35. As an admin, I want to manually replace, swap, or clear assignments in preview, so that the output can be refined before apply.
36. As an admin, I want warnings when a manual override breaks a soft preference, so that the system stays transparent without blocking judgment calls.
37. As an admin, I want hard conflicts such as overlap and cooldown violations to be surfaced clearly, so that I do not accidentally create impossible schedules.
38. As an admin, I want the system to stop for explicit collision review before overwriting existing assignments, so that apply actions feel safe.
39. As an admin, I want the final applied assignments, not the original machine suggestion, to drive future fairness history, so that the rotation reflects who actually served.
40. As an admin, I want the original generated proposal preserved for audit/debugging, so that I can understand how a roster changed before apply.
41. As an admin, I want advanced duties to create a first-class duty event, so that a staff-duty team remains one operational object rather than unrelated rows.
42. As an admin, I want duty events to remain editable as a team after apply, so that later changes keep their context.
43. As an admin, I want to regenerate one event or one slot without rerunning the entire series, so that local problems are easy to fix.
44. As an admin, I want old generated events to keep a snapshot of the rules used at the time, so that history remains auditably true.
45. As an admin, I want fairness baselines to be seeded manually when history is incomplete, so that new templates do not start from obviously wrong assumptions.
46. As an admin, I want the system to warn when fairness confidence is low, so that I know when the queue is based on thin history.
47. As an admin, I want templates to target one group, selected groups, or the whole org, so that company-level and battalion-level duties are both supported.
48. As a scoped leader, I want scope restrictions enforced on what templates and personnel I can use, so that the feature respects existing org permissions.
49. As an operator, I want the wizard to explain Army-specific concepts like longest break, blocking duty, and cooldown in plain language, so that the system is easier to use.
50. As an operator, I want a policy summary step before generation, so that I can confirm what the template actually means before I trust the output.
51. As an operator, I want a quick setup path, so that I can create common duties without working through every advanced option.
52. As an operator, I want a full configuration path, so that I can tune advanced duty behavior when needed.
53. As an operator, I want drafts for incomplete templates, so that I can save work without finishing the whole setup in one sitting.
54. As an operator, I want the simple lane to remain lightweight, so that basic duty rosters do not become tedious.
55. As an operator, I want the advanced lane to feel step-by-step instead of one giant form, so that I am not overwhelmed.
56. As an operator, I want the app to remember harmless convenience choices like review view and expanded panels, so that repeat use feels faster.
57. As an operator, I want blocking and cooldown checks to apply in both the generator and the normal calendar assignment flow, so that the app behaves consistently.
58. As an operator, I want blocking duties to affect availability calculations across the app without turning duty into a fake leave/TDY status, so that conflict logic stays accurate.
59. As an operator, I want advanced duties to appear on the calendar as one expandable team item, so that I can scan the schedule without losing team context.
60. As an operator, I want event details to show the assigned members, coverage window, warnings, and fill counts, so that the calendar remains useful at a glance.
61. As an operator, I want simple duties to keep a DA Form 6-style output, so that familiar one-person rosters remain printable in the way users expect.
62. As an operator, I want advanced duties to export as a team roster or duty packet rather than a forced DA Form 6 clone, so that team-based duties are represented honestly.
63. As an org with existing data, I want current assignment types and daily assignments to continue working during rollout, so that the rebuild does not disrupt operations.
64. As an org with legacy duties, I want existing one-person duty types surfaced as simple templates in the new flow, so that I can adopt the new UX without a hard migration.
65. As an admin, I want template creation/editing restricted to privileged users, so that operational rules do not drift casually.
66. As a future implementer, I want the rebuild split into safe phases, so that the architecture and UX can evolve without a risky big-bang release.

## Implementation Decisions

### Product Model

- Duty planning becomes a two-lane system: **simple duty templates** and **advanced duty templates**.
- Simple duties remain optimized for one-person recurring rosters and preserve DA Form 6-style fairness concepts.
- Advanced duties support multi-slot team staffing, blocking, cooldown, timed coverage windows, and post-generation review/editing.
- Both lanes use a shared wizard shell, but the simple lane exposes fewer steps and stronger defaults.

### Major Modules

- **Duty Template Module**: owns reusable duty definitions, draft/active/archive lifecycle, scope, coverage rules, blocking/cooldown settings, recurrence defaults, and soft-preference defaults.
- **Duty Slot & Rotation Module**: owns slot definitions, quantities, rank/group/MOS/role filters, rotation pools, and fairness baselines.
- **Duty Event Module**: owns generated duty events as first-class records with frozen rule snapshots, per-slot assignments, fill status, and audit history.
- **Duty Generation Engine**: owns candidate filtering, overlap/cooldown checks, fairness ordering, soft-preference scoring, hardest-slot-first fill order, partial-fill handling, and explainability output.
- **Duty Conflict/Availability Module**: owns shared answers for whether a Soldier is blocked by statuses, duty overlap, or cooldown. This module must be reusable by both generation and normal calendar assignment flows.
- **Duty Wizard/UI Module**: owns the step-by-step user experience for template selection/creation, policy review, date-pattern selection, candidate review, preview, collision review, and apply.
- **Duty Calendar Integration Module**: owns how simple duties and advanced duty events surface inside the calendar and how advanced events reopen into team editing.
- **Duty Export/History Module**: owns simple DA Form 6-style exports, advanced team-roster exports, generation history, and event-level audit views.

These should be treated as deep modules with stable inputs and outputs rather than feature code that spreads decision logic across route handlers and components.

### Phase Plan

- **Phase 1 — Foundation + Slim Wizard**
  - Introduce the advanced duty template, slot, rotation, and event model.
  - Preserve compatibility with existing simple duties and legacy daily assignments.
  - Build the generation engine for slots, blocking, cooldown, fairness, soft preferences, partial fills, and explanation output.
  - Add a slim wizard that supports template selection/creation, policy summary, generation period, review/edit, collision review, and apply.
  - Add first-class advanced duty events and editable event details.

- **Phase 2 — UX Polish + Operational Maturity**
  - Add advanced presets and richer quick-start flows.
  - Expand fairness and explanation views.
  - Improve event-level regeneration and post-apply editing ergonomics.
  - Improve calendar presentation and advanced export/print outputs.
  - Refine convenience affordances and polish around mobile/tablet review states.

### Architecture Decisions

- Existing one-person assignment types remain valid during rollout and should be surfaced as simple templates rather than forcibly migrated in one step.
- Existing daily assignments remain valid legacy/simple records during the transition.
- Advanced duties must not be forced into the legacy “one assignment row equals one duty” shape.
- The system should preserve a parent duty event with child slot assignments so that team context is not lost.
- Old duty events must store a frozen rules snapshot and never reinterpret themselves using current template settings.
- Final applied assignments, not generated suggestions, determine future fairness history.
- The app should support incomplete fairness history by allowing manual baseline seeding per rotation pool.
- Fairness history is scoped by organization + duty template + rotation pool rather than at the whole-org level.
- Blocking duties affect shared availability logic across the app but should not be written as fake status entries.

### Data Model Decisions

- Duty templates need fields for mode (simple/advanced), status (draft/active/archived), scope, coverage mode (all-day/timed), optional shift times, blocking behavior, cooldown behavior, recurrence defaults, and soft-preference defaults.
- Advanced templates need child slot definitions with role label, quantity, allowed ranks, allowed groups, allowed MOS values, allowed role values, optional slot-level blocking override, and rotation pool key.
- Rotation pools need optional fairness baseline data such as last-served dates or starting order.
- Generated duty events need a template reference, date/time coverage, frozen rules snapshot, fill summary, collision summary, and a set of slot-instance results.
- Slot-instance results need role metadata, assigned personnel, source of assignment (generated/locked/manual override), warning state, and unfilled reason where applicable.
- The design should leave room for future non-personnel slot types but v1 stays personnel-only.

### Generation Decisions

- Candidate eligibility uses existing personnel fields only in v1: rank, group, MOS, role, permanent exemptions, and per-run overrides.
- No new generic personnel-tag system is part of this PRD.
- Duplicate use of the same Soldier within one duty event is forbidden by default.
- The generator fills the hardest-to-staff slot first and uses template priority only as a tie-breaker.
- Hard rules filter candidates first. Soft preferences rank valid candidates second.
- Default soft-preference order for quick setup:
  1. longest break
  2. avoid back-to-back holidays/closures
  3. avoid recent weekend duty
  4. prefer selected groups
- Full configuration can reorder soft-preference priority.
- The same-group preference is a slot-level candidate preference in v1, not a whole-team optimization rule.
- Partial results are allowed in preview. Apply should require explicit review of gaps and collisions rather than failing silently or overwriting silently.

### Wizard Decisions

- Both simple and advanced duties should live inside a wizard shell.
- Recommended advanced flow:
  1. choose simple or advanced
  2. select or create template
  3. define/edit coverage and conflict policy
  4. define/edit slots and eligibility
  5. review plain-language policy summary
  6. choose generation period/pattern
  7. review candidate pool and per-run overrides
  8. preview assignments, gaps, warnings, and explanations
  9. resolve collisions and apply
- Quick setup and full configuration should both exist for advanced templates.
- The wizard should expose plain-language helper text for longest break, blocking, cooldown, and fairness confidence.
- The review step should be grouped by duty event/date first, with secondary fairness and rotation views.
- Users must be able to lock assignments before generation and manually replace/swap/clear assignments before apply.

### Calendar and Editing Decisions

- Advanced duties should surface on the calendar as one expandable team item rather than flattened rows first.
- Opening an advanced duty should return the user to the parent event view/editor where team-level context is preserved.
- Users should be able to regenerate one slot or one event without rerunning the whole series.
- Manual calendar assignment and planner flows must respect blocking and cooldown rules so that behavior matches the generator.

### Migration and Rollout Decisions

- Existing simple duties should be wrapped as simple templates for the new UX.
- Existing simple records remain intact during rollout rather than being destructively rewritten.
- Compatibility rollout is preferred over a hard cutover.
- Demo/sandbox-specific duty behavior is deprecated and should not be expanded as part of this work.
- If demo/sandbox duty paths are touched during implementation, they should be left clearly marked for later removal rather than deepened.

### API and Interaction Decisions

- Template creation/editing is privileged behavior.
- A future lower-risk “generate draft only” mode for less-privileged users is allowed as a future extension but is not required in this PRD.
- Apply should include explicit collision review whenever existing assignments or events would be replaced or conflicted.
- Override behavior should distinguish between hard-rule violations and soft-preference warnings.
- History and audit views should preserve both the generated proposal and the final applied result.

## Testing Decisions

Good tests should validate external behavior, user-visible outcomes, and stable module contracts rather than internal implementation details or incidental data structures.

### Core Test Targets

- **Duty Generation Engine**
  - Fairness ordering by rotation pool.
  - Hardest-slot-first fill behavior.
  - Blocking and cooldown filtering.
  - Partial-fill behavior and unfilled reasons.
  - Soft-preference ordering and explainability output.
  - Duplicate-person prevention inside one event.

- **Duty Conflict/Availability Module**
  - Overlap logic for all-day duties.
  - Overlap logic for timed duties, including cross-midnight shifts.
  - Cooldown enforcement after duty end.
  - Consistent answers across generation and manual assignment contexts.

- **Duty Template / Event Lifecycle**
  - Draft, active, and archived template behavior.
  - Frozen event snapshot behavior when templates change later.
  - Baseline seeding and fairness-confidence warnings.
  - Conversion/bridging behavior for existing simple duties.

- **Wizard / Review Flow**
  - Quick setup and full configuration paths.
  - Plain-language policy summary rendering.
  - Candidate review and per-run override behavior.
  - Collision-review gating before apply.
  - Manual replace/swap/clear actions in preview.

- **Calendar Integration**
  - Advanced duties render as expandable team items.
  - Event editing returns to team context.
  - Manual assignment surfaces blocking/cooldown conflicts in line with the generator.

### Prior Art

- Existing duty-roster tests provide current-state coverage for rendering and history behavior.
- Calendar assignment and route tests provide patterns for permission and planner behavior.
- Existing use-case and entity tests elsewhere in the repo provide the expected style for ports-and-adapters-aligned server logic.
- New deep modules should follow the same pattern used by current server use-case tests: stable inputs, stable outputs, and behavior-oriented assertions.

### Testing Scope Recommendations

- Phase 1 should prioritize engine, conflict logic, event lifecycle, migration bridge behavior, and slim-wizard review/apply flow.
- Phase 2 should add stronger UI tests for presets, richer explanation surfaces, event-level regeneration polish, and advanced export behavior.

## Out of Scope

- A new generic personnel tags or qualifications subsystem in v1.
- Non-personnel slot types such as equipment-only or checklist-only slots in v1.
- A phone-first workflow optimized for dense roster editing.
- Forcing advanced team duties into a literal DA Form 6 export.
- Automatic destructive migration of all legacy duty data into the new model.
- Expanding or improving demo/sandbox-only duty behavior.
- A complete recurrence-rule engine beyond the supported common date-pattern options.
- Fully generalized optimization for whole-team cohesion beyond the agreed slot-level preference model.

## Further Notes

- Army research supports keeping DA Form 6-style fairness in the simple lane while acknowledging that CQ and staff duty specifics are often local-SOP driven. The advanced lane should reflect that flexibility rather than hard-coding one “Army universal” staffing pattern.
- The most important product integrity rule in this PRD is consistency: the generator, manual planner, conflict checks, and calendar editing experience must agree on what blocking and cooldown mean.
- The advanced rebuild should feel less like a single overloaded configuration page and more like a guided staffing workflow that helps the user make decisions in order.
- Customer-facing changelog updates should be written in plain language when this work ships in user-visible pieces.
