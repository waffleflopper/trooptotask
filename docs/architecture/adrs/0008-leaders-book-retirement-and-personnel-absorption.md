# ADR 0008: Leaders Book Retirement And Personnel Absorption

Status: Accepted
Date: 2026-05-14

## Context

### Current-state truth

- The `/leaders-book` route has been hidden and redirecting since the secondary-route design pass. The Leaders Book PRD (`docs/plans/2026-03-19-leaders-book-redesign-prd.md`) described a standalone per-Soldier admin tool with tabbed Data Sheet, Counselings, Goals, and Training views.
- The Personnel detail page (`/org/[orgId]/personnel/[personnelId]`) already surfaces readiness lanes, counseling records, extended info, leader notes, and a follow-ups panel. Issue [#875](https://github.com/waffleflopper/trooptotask/issues/875) adds first-class leader-created follow-ups to this page.
- ADR 0003 documented that Leader's Book owns counseling records, development goals, and the future remade per-Soldier admin surface, while remaining a Compatibility Lane outside the durable first-class lane map.
- CONTEXT.md and UBIQUITOUS_LANGUAGE.md still describe Leader's Book as a "transitional compatibility surface" with an open question about whether the remade surface would re-enter the durable lane taxonomy.

### Decision pressure

- Building both a standalone Leaders Book route and the Personnel detail page would create two competing per-Soldier admin surfaces with overlapping data and user intent.
- The Personnel detail page already has the per-Soldier structure, streamed data loading, and the right permission model. The Leaders Book redesign PRD's valuable requirements (Soldier Data Sheet fields, simplified counseling storage, leader working tools) fit naturally into Personnel.
- Issue [#875](https://github.com/waffleflopper/trooptotask/issues/875) introduces follow-ups as a flexible leader working list that replaces both the derived follow-ups and the development goals concept from the Leaders Book PRD, making the Goals tab redundant.
- The open question from ADR 0003 about whether the remade Leader's Book would re-enter the durable lane map can now be answered: it will not, because the feature is being absorbed rather than rebuilt.

## Decision

- Leader's Book is retired as a product concept. It is not hidden pending a rebuild; it is removed from the platform entirely — route, code, permissions, settings, help copy, and all compatibility surface area.
- The Personnel detail page absorbs the surviving Leader's Book content:
  - **Counseling records** move to Personnel lane ownership as lightweight PDF storage with date, title, optional summary, and uploaded-by metadata. No signature workflows, status tracking, recurrence, or type management.
  - **Extended info / Soldier Data Sheet** expands to include the fields from the Leaders Book PRD (blood type, BASD, date of rank, marital status, dependents/children, civilian education, military education). This is the digital Soldier Data Sheet.
  - **Follow-ups** (issue [#875](https://github.com/waffleflopper/trooptotask/issues/875)) are a free-form leader working list covering action items, counseling reminders, award recommendations, and developmental goals. They replace the Leaders Book PRD's development goals as a separate concept.
  - **Leader notes** remain as an observation and accomplishment journal — separate from follow-ups, which are action-oriented.
- **Development goals** are dropped as a standalone concept. The follow-up system covers this use case.
- The `leaders-book` Compatibility Lane is decommissioned. It no longer appears in the durable or compatibility lane maps.
- The Personnel detail page is gated behind `operate` capability on the Personnel lane. View-only users have no reason to access the detail page; the roster list page provides everything they need.
- The durable first-class Feature Lanes are: Calendar, Personnel, Training, Critical Tasks, Onboarding, and Rating Scheme. Leader's Book is no longer listed in any lane taxonomy.

## Rejected Or Deferred Alternatives

- Build the standalone Leaders Book route as designed in the PRD.
  - Rejected because the Personnel detail page already has the right structure and building two per-Soldier admin surfaces would split user attention and create data overlap.
- Keep development goals as a separate concept alongside follow-ups.
  - Rejected because the distinction forces leaders to decide "is this a goal or a follow-up?" — a separation that doesn't match how they actually work. A developmental goal like "Complete BLC packet by August" fits naturally as a follow-up.
- Gate different sections of the Personnel detail page at different capability levels (view sees Data Sheet, operate sees counseling).
  - Rejected because view-only users don't need the detail page at all. The roster list provides everything a viewer needs. A single `operate` gate is simpler to build, test, and reason about.
- Keep Leader's Book as a Compatibility Lane with no active surface while the code is removed.
  - Rejected because there is no pending rebuild. The feature is absorbed, not deferred. A compatibility lane with nothing behind it is misleading.

## Guardrails And Exceptions

- Do not recreate a Leaders Book route, feature module, or permission lane.
- Do not treat counseling records as a workflow tool. They are PDF storage with metadata — date, title, optional summary, uploaded-by.
- Do not build a separate development goals system. Follow-ups cover that use case.
- Do not introduce capability-level splits within the Personnel detail page. The entire page requires `operate` on Personnel.
- Counseling records, follow-ups, and leader notes are Personnel-owned. Do not create new lanes or compatibility surfaces for them.

## Consequences

- Expected benefits:
  - One per-Soldier admin surface instead of two, reducing user confusion and engineering surface area.
  - The `leaders-book` permission flag, settings toggle, help copy, and compatibility code can be fully removed.
  - Follow-ups as a single flexible concept are simpler than maintaining separate follow-ups and development goals.
  - ADR 0003's open question about whether Leader's Book re-enters the durable lane map is resolved: it does not.
- Tradeoffs:
  - The Personnel lane now owns more data than before (counseling records, follow-ups, leader notes, expanded extended info). This is a larger permission surface but matches how leaders actually work — everything about one Soldier in one place.
  - The Leaders Book PRD is superseded. Any remaining requirements from it should be evaluated against the Personnel detail page, not treated as a build plan.
- New risks or migration costs:
  - Existing `leaders-book` permission flags, settings, help references, and route code must be cleaned up.
  - Any existing counseling records or development goals data must be migrated or acknowledged as test/demo data that can be dropped.

## Rollout And Follow-Up

- Issue [#875](https://github.com/waffleflopper/trooptotask/issues/875) implements the follow-up system on Personnel.
- Separate implementation slices needed for:
  - Expanding `personnel_extended_info` with Soldier Data Sheet fields
  - Removing the `leaders-book` route, redirect, permission flag, settings, and help copy
  - Cleaning up or migrating existing counseling/goals data
- Docs updated with this ADR:
  - `CONTEXT.md`
  - `UBIQUITOUS_LANGUAGE.md`

## Links

- Related PRD:
  - `docs/plans/2026-03-19-leaders-book-redesign-prd.md` (superseded by this decision)
- Related issues:
  - [#875](https://github.com/waffleflopper/trooptotask/issues/875)
- Related ADRs:
  - [ADR 0003](0003-leaders-book-and-rating-scheme-boundary.md) (Leader's Book boundary — this ADR resolves the open question)
  - [ADR 0002](0002-v1-feature-permission-lane-map.md) (Feature lane map — Leader's Book removed from lane taxonomy)
