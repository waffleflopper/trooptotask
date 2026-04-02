# Sitewide Design System Rollout — Child Issue Breakdown

This document breaks the parent PRD at [docs/plans/2026-03-31-sitewide-design-system-rollout-prd.md](/Users/robertbaddeley/projects/trooptotask/docs/plans/2026-03-31-sitewide-design-system-rollout-prd.md) into ordered child issues.

These are intentionally phase-aligned rollout issues, not pure tracer-bullet slices. That is the better fit for this initiative because the PRD explicitly treats the work as a system migration with strong sequencing requirements: foundations first, shells second, product shell third, then feature-family migration, then cleanup.

Each issue draft is written so it could be turned into a GitHub issue body with light editing.

## Recommended Labels

- `frontend`
- `design-system`
- `ui`
- `phase-rollout`

## Recommended Dependency Order

1. Design token foundation and compatibility bridge
2. Shared primitive refresh
3. Public marketing shell extraction
4. Landing page implementation
5. Remaining marketing page migration
6. Auth shell extraction and auth-page migration
7. Authenticated app shell refresh
8. Dashboard and entry-surface migration
9. Calendar-family migration
10. Personnel-family migration
11. Training-family migration
12. Onboarding-family migration
13. Settings, billing, and secondary-route migration
14. Admin alignment pass
15. Cleanup and removal of legacy styling paths

## Issue 1 — Design Token Foundation and Compatibility Bridge

**Suggested type**: AFK

**Blocked by**: None

**Goal**

Replace the current legacy global visual contract with one canonical token layer derived from [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md), while providing a temporary compatibility bridge so existing routes and shared components do not break mid-migration.

**What we are trying to do**

- Establish the design system as the single source of truth for color, typography, spacing, borders, elevation, focus treatment, and light/dark mode behavior.
- Move the app away from the current older token contract in [src/app.css](/Users/robertbaddeley/projects/trooptotask/src/app.css), which still reflects a different visual era.
- Introduce transitional aliases only where necessary to keep existing shared components functioning during the rollout.
- Prefer self-hosted font loading for the new families instead of page-level Google Font tags.

**Key implementation areas**

- [src/app.css](/Users/robertbaddeley/projects/trooptotask/src/app.css)
- Theme and root layout wiring that controls dark mode behavior
- Documentation updates in [docs/component-catalog.md](/Users/robertbaddeley/projects/trooptotask/docs/component-catalog.md)

**Acceptance criteria**

- Canonical tokens for the new palette, semantic states, typography, spacing, radius, borders, shadows, and focus states are defined globally.
- The canonical typography contract reflects the design system families and roles, with a production-friendly loading strategy.
- Light mode and dark mode both use intentional token mappings rather than ad hoc overrides.
- A temporary alias layer exists for still-unmigrated components, and those aliases are clearly marked as migration-only scaffolding.
- No new component or page work added after this issue relies on the old token names as a first-class API.

**Guardrails**

- Do not copy the landing reference CSS wholesale into global app styles.
- Do not let compatibility aliases become a second permanent token system.
- Do not introduce Tailwind or another styling framework.

**References**

- [docs/plans/2026-03-31-sitewide-design-system-rollout-prd.md](/Users/robertbaddeley/projects/trooptotask/docs/plans/2026-03-31-sitewide-design-system-rollout-prd.md)
- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)

**User stories addressed**

- 1, 3, 9, 13, 17, 19, 23, 27, 28

## Issue 2 — Shared Primitive Refresh

**Suggested type**: AFK

**Blocked by**: Issue 1

**Goal**

Refresh the shared UI primitives and shared layout components so downstream route work inherits the new system by default instead of re-implementing styling page by page.

**What we are trying to do**

- Update the most reused primitives to express the new field-document visual language.
- Normalize interactive states, typography, spacing, density, focus treatment, and status styling across shared components.
- Ensure the shared primitives are appropriate for both marketing/auth surfaces and denser authenticated product surfaces.

**Key implementation areas**

- [src/lib/components/PageToolbar.svelte](/Users/robertbaddeley/projects/trooptotask/src/lib/components/PageToolbar.svelte)
- [src/lib/components/Modal.svelte](/Users/robertbaddeley/projects/trooptotask/src/lib/components/Modal.svelte)
- [src/lib/components/ui/Badge.svelte](/Users/robertbaddeley/projects/trooptotask/src/lib/components/ui/Badge.svelte)
- [src/lib/components/ui/FormField.svelte](/Users/robertbaddeley/projects/trooptotask/src/lib/components/ui/FormField.svelte)
- [src/lib/components/ui/SearchSelect.svelte](/Users/robertbaddeley/projects/trooptotask/src/lib/components/ui/SearchSelect.svelte)
- [src/lib/components/ui/SubNav.svelte](/Users/robertbaddeley/projects/trooptotask/src/lib/components/ui/SubNav.svelte)
- [src/lib/components/ui/ConfirmDialog.svelte](/Users/robertbaddeley/projects/trooptotask/src/lib/components/ui/ConfirmDialog.svelte)
- [src/lib/components/ui/data-table/DataTable.svelte](/Users/robertbaddeley/projects/trooptotask/src/lib/components/ui/data-table/DataTable.svelte)
- [docs/component-catalog.md](/Users/robertbaddeley/projects/trooptotask/docs/component-catalog.md)

**Acceptance criteria**

- Button variants match the design-system intent: dark primary, amber signal action, and restrained outline usage.
- Badges and status pills use mono labeling and reserved semantic meaning instead of acting as generic decorative pills.
- Form controls, menus, tabs, tables, dialogs, and page toolbars share consistent density, borders, type hierarchy, and focus states.
- Shared primitives remain keyboard accessible and support intentional dark mode behavior.
- The component catalog is updated so future contributors can use the refreshed primitives without guessing.

**Guardrails**

- Avoid route-specific exceptions unless a shared API genuinely cannot support the use case.
- Prefer extending shared primitives over creating one-off replacements inside feature folders.
- Preserve behavior and data flow; this is a visual contract refresh, not a business-logic rewrite.

**References**

- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)
- [docs/component-catalog.md](/Users/robertbaddeley/projects/trooptotask/docs/component-catalog.md)

**User stories addressed**

- 10, 11, 12, 17, 19, 25, 27, 28

## Issue 3 — Public Marketing Shell Extraction

**Suggested type**: AFK

**Blocked by**: Issues 1-2

**Goal**

Extract a reusable public-site shell so marketing pages stop carrying their own copy of navigation, section framing, theme toggles, CTA framing, and footer styling.

**What we are trying to do**

- Replace the duplicated shell patterns currently embedded in the public pages with shared layout building blocks.
- Create a public shell that captures the visual direction of the landing redesign without forcing every page into the exact same composition.
- Centralize the recurring structural elements now repeated across the landing, features, pricing, security, privacy, and terms pages.

**Key implementation areas**

- [src/routes/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/+page.svelte)
- [src/routes/features/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/features/+page.svelte)
- [src/routes/pricing/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/pricing/+page.svelte)
- [src/routes/security/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/security/+page.svelte)
- [src/routes/privacy/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/privacy/+page.svelte)
- [src/routes/terms/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/terms/+page.svelte)

**Acceptance criteria**

- Shared public-site shell components exist for the top nav, section framing, CTA/footer treatment, and common page scaffolding.
- Public pages no longer use large duplicated shell-level `<style>` blocks as their primary architecture.
- The shell preserves responsive behavior and intentional dark mode support.
- The shell is expressive enough for marketing surfaces while staying within the design-system rules.

**Guardrails**

- Do not collapse every public page into a single oversized component.
- Do not make legal pages compete with the homepage hero for visual attention.
- Do not reintroduce soft-card SaaS styling that conflicts with the field-document direction.

**References**

- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)
- [trooptotask-landing-redesign.html](/Users/robertbaddeley/projects/trooptotask/trooptotask-landing-redesign.html)

**User stories addressed**

- 1, 3, 4, 5, 6, 20, 24, 27

## Issue 4 — Landing Page Implementation

**Suggested type**: HITL

**Blocked by**: Issues 1-3

**Goal**

Bring the homepage onto the new system using [trooptotask-landing-redesign.html](/Users/robertbaddeley/projects/trooptotask/trooptotask-landing-redesign.html) as the direct implementation reference for composition, type hierarchy, framing, and tone.

**What we are trying to do**

- Rebuild the landing page against the extracted public shell and the canonical tokens.
- Preserve the approved visual direction from the redesign reference while implementing it in the app’s shared system rather than as a one-off HTML artifact.
- Establish the public visual standard the rest of the marketing site should inherit from.

**Key implementation areas**

- [src/routes/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/+page.svelte)
- Any new public-shell components created in Issue 3

**Acceptance criteria**

- The homepage clearly reflects the approved landing redesign direction.
- Hero, section sequencing, CTA hierarchy, and section transitions feel deliberate and consistent with the reference.
- The implementation uses shared shell pieces and canonical tokens rather than landing-specific ad hoc design tokens.
- Mobile and dark mode versions feel intentionally designed, not merely tolerated.
- Marketing performance remains acceptable despite richer composition.

**Why this is marked HITL**

- This issue likely benefits from a human design/acceptance review before the public-shell direction is considered final.

**References**

- [trooptotask-landing-redesign.html](/Users/robertbaddeley/projects/trooptotask/trooptotask-landing-redesign.html)
- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)

**User stories addressed**

- 1, 2, 4, 5, 6, 18, 20, 27

## Issue 5 — Remaining Marketing Page Migration

**Suggested type**: AFK

**Blocked by**: Issues 3-4

**Goal**

Migrate the non-homepage public pages onto the shared marketing shell so they feel like natural extensions of the landing page instead of separate mini-sites.

**What we are trying to do**

- Bring the features, pricing, security, privacy, and terms pages into the same visual family.
- Reuse the extracted shell and shared sections where it makes sense, but adapt the content density and hierarchy to each page’s job.
- Reduce local styling duplication and page-specific reinventions of nav, CTA, and footer patterns.

**Key implementation areas**

- [src/routes/features/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/features/+page.svelte)
- [src/routes/pricing/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/pricing/+page.svelte)
- [src/routes/security/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/security/+page.svelte)
- [src/routes/privacy/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/privacy/+page.svelte)
- [src/routes/terms/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/terms/+page.svelte)

**Acceptance criteria**

- All public pages share a coherent navigation, typography, spacing, and footer/CTA language.
- Legal and informational pages are quieter and more utilitarian than the homepage while still clearly belonging to the same system.
- Large page-local style blocks are reduced materially because shared shell pieces now carry the common design contract.
- The pages remain readable on mobile and performant on slower devices.

**Guardrails**

- Do not treat the features page as a second homepage.
- Keep legal pages highly legible and structurally calm.
- Do not deepen any deprecated demo-specific storytelling patterns while touching public pages.

**References**

- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)
- [trooptotask-landing-redesign.html](/Users/robertbaddeley/projects/trooptotask/trooptotask-landing-redesign.html)

**User stories addressed**

- 1, 3, 4, 5, 6, 18, 20, 24, 27

## Issue 6 — Auth Shell Extraction and Auth-Page Migration

**Suggested type**: AFK

**Blocked by**: Issues 1-3

**Goal**

Rebuild the auth and account-entry surfaces around a shared auth shell so login, registration, invite acceptance, password recovery, MFA, and access-request flows feel like one coherent front door.

**What we are trying to do**

- Replace the repeated auth-page-local visual systems with shared auth scaffolding.
- Carry over the marketing/public design language in a more direct, focused, and low-friction format appropriate for credential tasks.
- Ensure auth flows remain trustworthy, legible, accessible, and mobile-friendly.

**Key implementation areas**

- [src/routes/auth/login/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/auth/login/+page.svelte)
- [src/routes/auth/register/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/auth/register/+page.svelte)
- [src/routes/auth/request-access/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/auth/request-access/+page.svelte)
- [src/routes/auth/forgot-password/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/auth/forgot-password/+page.svelte)
- [src/routes/auth/reset-password/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/auth/reset-password/+page.svelte)
- [src/routes/auth/accept-invite/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/auth/accept-invite/+page.svelte)
- [src/routes/auth/mfa-verify/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/auth/mfa-verify/+page.svelte)

**Acceptance criteria**

- A shared auth shell exists and is used across the major auth-entry flows.
- Auth pages feel visually related to the public site without inheriting unnecessary marketing complexity.
- Inputs, errors, help text, and submit states rely on shared primitives rather than route-local styling inventions.
- Keyboard navigation, focus visibility, and error messaging remain strong across auth screens.
- Remaining page-local auth CSS is limited to truly unique layout needs.

**Guardrails**

- Do not redesign the auth workflow semantics as part of this issue.
- Do not let the auth shell become a second marketing shell.
- Keep the content simple and conversion-oriented.

**References**

- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)
- [trooptotask-landing-redesign.html](/Users/robertbaddeley/projects/trooptotask/trooptotask-landing-redesign.html)

**User stories addressed**

- 7, 8, 18, 24, 27

## Issue 7 — Authenticated App Shell Refresh

**Suggested type**: AFK

**Blocked by**: Issues 1-2

**Goal**

Refresh the logged-in shell so the application immediately feels like part of the same product family before individual feature families are fully migrated.

**What we are trying to do**

- Rework shared app chrome, navigation, shell spacing, and high-level surface framing.
- Apply the design system in a productized, denser, calmer way that preserves operational clarity.
- Improve the visual defaults inherited by all feature routes.

**Key implementation areas**

- [src/routes/org/[orgId]/+layout.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/+layout.svelte)
- [src/lib/components/TopHeader.svelte](/Users/robertbaddeley/projects/trooptotask/src/lib/components/TopHeader.svelte)
- [src/lib/components/BottomTabBar.svelte](/Users/robertbaddeley/projects/trooptotask/src/lib/components/BottomTabBar.svelte)
- Banner and shell-adjacent components under [src/lib/components](/Users/robertbaddeley/projects/trooptotask/src/lib/components)

**Acceptance criteria**

- The primary logged-in shell clearly belongs to the same visual family as the public and auth surfaces.
- Header, mobile nav, shell spacing, and surface hierarchy are updated without reducing clarity or discoverability.
- Amber is used as signal and emphasis, not as decorative fill across the shell.
- The shell supports mobile layouts, dark mode, and banner stacking cleanly.
- Existing navigation behavior and permissions-based visibility remain unchanged.

**Guardrails**

- Do not turn the product shell into a literal marketing hero composition.
- Keep density appropriate for daily operational use.
- Preserve current route structure and access control behavior.

**References**

- [docs/plans/2026-03-31-sitewide-design-system-rollout-prd.md](/Users/robertbaddeley/projects/trooptotask/docs/plans/2026-03-31-sitewide-design-system-rollout-prd.md)
- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)

**User stories addressed**

- 9, 10, 11, 13, 14, 21, 25, 27

## Issue 8 — Dashboard and Entry-Surface Migration

**Suggested type**: AFK

**Blocked by**: Issue 7

**Goal**

Migrate the first logged-in surfaces users see so the redesign is visible early and downstream feature families have a stronger reference implementation.

**What we are trying to do**

- Redesign the dashboard, entry panels, and nearby “first impression after login” surfaces using the refreshed shell and primitives.
- Improve structural clarity and visual hierarchy without changing the jobs those surfaces perform.
- Use this issue to establish patterns for product cards, section framing, summary modules, and entry CTAs.

**Key implementation areas**

- [src/routes/org/[orgId]/(dashboard)/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/(dashboard)/+page.svelte)
- [src/features/dashboard/components/DashboardPageView.svelte](/Users/robertbaddeley/projects/trooptotask/src/features/dashboard/components/DashboardPageView.svelte)
- [src/features/dashboard/components/DashboardModals.svelte](/Users/robertbaddeley/projects/trooptotask/src/features/dashboard/components/DashboardModals.svelte)
- [src/routes/dashboard/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/dashboard/+page.svelte)

**Acceptance criteria**

- The dashboard feels aligned with the refreshed app shell and shared primitives.
- Summary modules, activity blocks, empty states, and entry CTAs follow clear, reusable product patterns.
- The redesign preserves scan speed and does not bury the most important operational information.
- At least one strong reference implementation exists for section framing and dense-but-readable product composition.

**References**

- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)

**User stories addressed**

- 9, 10, 11, 14, 15, 18, 21, 25

## Issue 9 — Calendar Family Migration

**Suggested type**: AFK

**Blocked by**: Issues 2 and 7

**Goal**

Migrate the calendar workstream to the new product expression while preserving density, speed, and practical scheduling workflows.

**What we are trying to do**

- Apply the system to calendar views, planners, breakdowns, legends, filters, and related modals.
- Improve the readability of status surfaces, toolbar structure, headers, and table/grid framing.
- Keep the calendar family distinctly operational rather than decorative.

**Key implementation areas**

- [src/routes/org/[orgId]/calendar/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/calendar/+page.svelte)
- [src/routes/org/[orgId]/calendar/+layout.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/calendar/+layout.svelte)
- [src/features/calendar/components](/Users/robertbaddeley/projects/trooptotask/src/features/calendar/components)

**Acceptance criteria**

- Calendar headers, navigation, legends, assignment views, and modals align with the refreshed shell and shared primitives.
- Status indicators follow the semantic status system from the design spec.
- Dense calendar surfaces remain fast to scan and usable on smaller screens.
- Visual updates do not alter calendar logic, permissions, or workflow semantics.

**References**

- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)

**User stories addressed**

- 11, 12, 15, 16, 18, 21, 26, 27

## Issue 10 — Personnel Family Migration

**Suggested type**: AFK

**Blocked by**: Issues 2 and 7

**Goal**

Migrate personnel surfaces to the new product system, especially roster-heavy screens, modals, filters, and bulk workflows.

**What we are trying to do**

- Refresh personnel list views, bulk-management surfaces, edit modals, and supporting controls.
- Make tables, row hierarchy, labels, and secondary metadata feel more structured and readable.
- Preserve the operational speed expected for roster maintenance tasks.

**Key implementation areas**

- [src/routes/org/[orgId]/personnel/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/personnel/+page.svelte)
- [src/routes/org/[orgId]/personnel/+layout.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/personnel/+layout.svelte)
- [src/features/personnel/components](/Users/robertbaddeley/projects/trooptotask/src/features/personnel/components)

**Acceptance criteria**

- Personnel list, bulk tools, and edit flows use refreshed toolbars, form controls, table styles, badges, and modals.
- Name hierarchy, metadata labeling, and status indicators follow the productized design-system rules.
- Bulk workflows remain efficient and understandable rather than becoming visually heavier.
- No behavior regressions are introduced in CRUD or bulk operations.

**References**

- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)

**User stories addressed**

- 11, 12, 15, 16, 18, 21, 26, 27

## Issue 11 — Training Family Migration

**Suggested type**: AFK

**Blocked by**: Issues 2 and 7

**Goal**

Migrate training pages, views, reports, and matrix-heavy screens to the new product system while preserving data density and analytical clarity.

**What we are trying to do**

- Update matrix layouts, reporting surfaces, training type management, views, and training modals.
- Clarify dense state-heavy UI with better typography, labels, grid rules, and restrained emphasis.
- Ensure this family becomes a strong reference for complex product surfaces under the new system.

**Key implementation areas**

- [src/routes/org/[orgId]/training/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/training/+page.svelte)
- [src/routes/org/[orgId]/training/+layout.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/training/+layout.svelte)
- [src/features/training/components](/Users/robertbaddeley/projects/trooptotask/src/features/training/components)

**Acceptance criteria**

- Training matrix, report views, selectors, and management dialogs align with the new product shell and refreshed primitives.
- Dense information remains legible and does not regress into decorative noise.
- Status, due-state, and action emphasis use semantic color and mono labeling intentionally.
- The UI remains usable on laptop-size viewports common in operational settings.

**References**

- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)

**User stories addressed**

- 11, 12, 15, 16, 18, 21, 26, 27

## Issue 12 — Onboarding Family Migration

**Suggested type**: AFK

**Blocked by**: Issues 2 and 7

**Goal**

Migrate onboarding pages and related modals/templates to the new product system, balancing clear progress framing with the utilitarian tone of the broader app.

**What we are trying to do**

- Update onboarding page structure, reports, progress states, template management, and modal flows.
- Improve clarity of stage progression, callouts, and supporting metadata without introducing generic “wizard” styling.
- Ensure onboarding belongs to the same family as the rest of the product while remaining friendly for first-run tasks.

**Key implementation areas**

- [src/routes/org/[orgId]/onboarding/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/onboarding/+page.svelte)
- [src/routes/org/[orgId]/onboarding/+layout.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/onboarding/+layout.svelte)
- [src/features/onboarding/components](/Users/robertbaddeley/projects/trooptotask/src/features/onboarding/components)

**Acceptance criteria**

- Onboarding screens, banners, progress indicators, and supporting modals align with the refreshed product system.
- Progress/status presentation is clear, not gimmicky.
- Empty, first-run, and report states feel intentional and trustworthy.
- Existing onboarding behavior and workflow semantics remain intact.

**References**

- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)

**User stories addressed**

- 11, 12, 15, 18, 21, 26, 27

## Issue 13 — Settings, Billing, and Secondary-Route Migration

**Suggested type**: AFK

**Blocked by**: Issues 2 and 7

**Goal**

Bring the lower-frequency but customer-visible authenticated surfaces into the new system so the redesign does not stop at the primary feature families.

**What we are trying to do**

- Update settings, billing, and other secondary authenticated routes to use the new shell and primitives.
- Cover supporting surfaces that are important to trust and continuity even if they are not used daily.
- Consolidate any remaining shared patterns discovered in secondary-route migration back into shared components where appropriate.

**Key implementation areas**

- [src/routes/org/[orgId]/settings/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/settings/+page.svelte)
- [src/routes/org/[orgId]/billing/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/billing/+page.svelte)
- [src/routes/account/security/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/account/security/+page.svelte)
- [src/routes/org/new/+page.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/new/+page.svelte)
- Secondary feature surfaces related to leaders-book, duty rosters, sign-in rosters, rating scheme, help, and suspended states where applicable

**Acceptance criteria**

- Secondary authenticated routes clearly belong to the refreshed app family.
- Settings and billing surfaces feel trustworthy, legible, and appropriately restrained.
- Repeated patterns discovered here are folded back into shared shell/primitives instead of copied locally.
- Any still-unmigrated secondary route is explicitly documented rather than silently left behind.

**Guardrails**

- Keep this issue focused on visual/system alignment, not new feature delivery.
- If a secondary surface is effectively deprecated or pending separate redesign, call that out explicitly instead of over-investing in bespoke polish.

**References**

- [docs/plans/2026-03-31-sitewide-design-system-rollout-prd.md](/Users/robertbaddeley/projects/trooptotask/docs/plans/2026-03-31-sitewide-design-system-rollout-prd.md)
- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)

**User stories addressed**

- 9, 10, 12, 13, 15, 18, 21, 26, 27

## Issue 14 — Admin Alignment Pass

**Suggested type**: AFK

**Blocked by**: Issues 2, 7, and 13

**Goal**

Align admin surfaces to the new system fundamentals while keeping them slightly more utilitarian than the primary customer-facing product areas.

**What we are trying to do**

- Apply the new shell/primitives to admin pages where appropriate.
- Improve consistency, spacing, hierarchy, tables, forms, and shell behavior across the admin experience.
- Respect the PRD guidance that admin can remain more utilitarian while still belonging to the same family.

**Key implementation areas**

- [src/routes/admin/+layout.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/admin/+layout.svelte)
- [src/routes/admin](/Users/robertbaddeley/projects/trooptotask/src/routes/admin)
- [src/routes/org/[orgId]/admin/+layout.svelte](/Users/robertbaddeley/projects/trooptotask/src/routes/org/[orgId]/admin/+layout.svelte)
- Admin-focused shared components under [src/lib/components/admin](/Users/robertbaddeley/projects/trooptotask/src/lib/components/admin)

**Acceptance criteria**

- Admin surfaces share the same foundational tokens, typography families, spacing logic, and interaction treatments as the rest of the app.
- Admin tables, forms, and toolbars feel coherent with the system without inheriting unnecessary marketing flourish.
- Any admin-specific divergence from the main product style is intentional and documented.

**References**

- [docs/plans/2026-03-31-sitewide-design-system-rollout-prd.md](/Users/robertbaddeley/projects/trooptotask/docs/plans/2026-03-31-sitewide-design-system-rollout-prd.md)
- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)

**User stories addressed**

- 10, 12, 17, 18, 21, 26, 27, 28

## Issue 15 — Cleanup and Removal of Legacy Styling Paths

**Suggested type**: AFK

**Blocked by**: Issues 1-14

**Goal**

Finish the migration by removing the temporary styling scaffolding, duplicated local design systems, and outdated component variants that were only tolerated during the transition.

**What we are trying to do**

- Remove compatibility aliases that are no longer needed.
- Delete obsolete page-local style blocks and dead shared variants that survived earlier phases only for safety.
- Complete a final consistency, accessibility, dark mode, and performance pass across representative public, auth, product, and admin surfaces.

**Key implementation areas**

- [src/app.css](/Users/robertbaddeley/projects/trooptotask/src/app.css)
- Public routes under [src/routes](/Users/robertbaddeley/projects/trooptotask/src/routes)
- Shared components under [src/lib/components](/Users/robertbaddeley/projects/trooptotask/src/lib/components)
- Shared UI primitives under [src/lib/components/ui](/Users/robertbaddeley/projects/trooptotask/src/lib/components/ui)

**Acceptance criteria**

- Migration-only compatibility aliases that no longer have consumers are removed.
- Duplicated page-local shell CSS that has been superseded by shared shells is deleted.
- Obsolete component variants that conflict with the new system are removed or deprecated clearly.
- A final QA pass verifies keyboard navigation, focus visibility, contrast, dark mode, responsive behavior, and performance smoke checks on representative surfaces.
- The resulting codebase has one clear visual system, not parallel old and new paradigms.

**Guardrails**

- Do not remove compatibility code unless the dependent routes have actually been migrated.
- When deleting demo/sandbox-related design leftovers, preserve clear deprecation notes if the underlying behavior still exists elsewhere.

**References**

- [docs/plans/2026-03-31-sitewide-design-system-rollout-prd.md](/Users/robertbaddeley/projects/trooptotask/docs/plans/2026-03-31-sitewide-design-system-rollout-prd.md)
- [trooptotask-design-system.md](/Users/robertbaddeley/projects/trooptotask/trooptotask-design-system.md)

**User stories addressed**

- 1, 3, 9, 12, 13, 17, 18, 19, 23, 27, 28

## Notes on Granularity

This breakdown keeps the core migration work in 15 child issues because that matches the PRD’s own suggested rollout groups and keeps ownership clear:

- foundations and shared primitives are isolated because they unblock everything else
- public, auth, shell, and feature families each have their own lane
- cleanup is separated so migration scaffolding does not quietly become permanent

If you want a finer-grained breakdown after review, the best candidates to split further are:

- Issue 2 into `interactive primitives` and `dense data-display primitives`
- Issue 5 into `features/pricing` and `security/privacy/terms`
- Issue 13 into `settings/billing` and `secondary routes`
- Issue 14 into `platform admin` and `org admin`
