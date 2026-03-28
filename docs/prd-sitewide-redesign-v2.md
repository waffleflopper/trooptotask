# PRD: Sitewide Visual Redesign and v2 Rollout

## Problem Statement

TroopToTask's current visual design does not reflect the product quality the platform has grown into, does not feel familiar to its military audience, and does not provide a sufficiently strong set of visual guardrails for future product work.

From the user's perspective, the current experience has several problems:

- The public marketing site and the authenticated app do not feel like parts of the same product.
- The current styling language does not align well with the visual expectations of military users, which weakens trust and product fit.
- The design system is not opinionated enough to create a clear "this is how TroopToTask should look" standard for future work.
- Previous redesign efforts have improved isolated areas, but the platform still lacks a unified, durable visual direction across public and authenticated surfaces.
- A big-bang redesign of the authenticated product would be risky, because current users still need the existing app to remain stable and usable throughout the migration.

At the same time, the project already has a working SvelteKit application, existing reusable UI primitives, and established backend contracts. The problem is therefore not a lack of functionality. The problem is that the product needs a comprehensive front-end facelift and stronger design-system discipline without disrupting existing workflows or requiring a framework rewrite.

## Solution

TroopToTask will adopt the new redesign as the exact visual source for the public landing page, then expand that visual language into a broader sitewide design system that can be applied across the rest of the marketing site and, in a toned-down product-appropriate way, across the authenticated app.

The redesign will remain in SvelteKit. Tailwind, shadcn, and a React or Next.js migration are not required to achieve the desired result and are intentionally out of scope for this initiative.

The rollout will happen incrementally through a `v2` experience:

- `v2` will include the redesigned public marketing pages.
- `v2` will also include authenticated product pages that have already been redesigned.
- Pages not yet redesigned in `v2` will show a "not redesigned yet" interstitial with a link to the current equivalent page on the main domain.
- The current production experience on the main domain will remain available and fully usable until the redesigned experience is sufficiently complete to become the primary experience.

The public landing page will be ported exactly, including its copy, motion, typography, mockups, and composition. Other marketing pages will be allowed to restructure their composition and tone so they feel native to the new visual language. The authenticated product experience will not attempt a literal one-to-one translation of the marketing aesthetic where that would hurt density, readability, or usability. Instead, it will use a productized version of the same visual system.

This initiative is primarily a visual, structural, and interaction-layer migration. Core functionality, backend behavior, routes on the main application, and schema-level behavior will remain unchanged unless a narrow best-practice cleanup is needed to remove clearly poor front-end coupling.

## User Stories

1. As a prospective customer, I want the landing page to look polished and intentional, so that I immediately trust the product.
2. As a prospective customer, I want the public site to feel visually cohesive across pages, so that the product feels established rather than pieced together.
3. As a prospective customer, I want the redesigned public site to preserve the strongest aspects of the new landing page, so that the brand identity remains consistent.
4. As a prospective customer, I want the public pages to feel tailored to military workflows and aesthetics, so that the product feels built for my environment.
5. As a prospective customer, I want marketing pages like Features, Security, Pricing, Privacy, and Terms to feel like part of the same site as the homepage, so that I do not feel like I am jumping between unrelated designs.
6. As a prospective customer, I want the public site to work well on mobile, so that I can evaluate the product from my phone.
7. As a prospective customer, I want the public site to remain fast on slower government-connected machines, so that the redesigned experience still feels usable in real environments.
8. As a prospective customer, I want the public site to remain readable in its dark presentation, so that the new aesthetic does not trade away clarity.
9. As a logged-in user, I want the authenticated app to feel visually connected to the public site, so that the product feels coherent end to end.
10. As a logged-in user, I want the redesigned app to keep the same core workflows I already know, so that I do not have to relearn my job just because the visuals changed.
11. As a logged-in user, I want the redesigned app to improve usability where needed, so that existing workflows feel cleaner and easier without changing their intent.
12. As a logged-in user, I want data-dense pages to prioritize readability and scannability, so that visual flair does not get in the way of operational use.
13. As a logged-in user, I want the authenticated app to support dark mode from the start, so that the redesign feels complete and intentional.
14. As a logged-in user, I want tablet support to be considered during redesign, so that I can use the product effectively outside a desk setup.
15. As a logged-in user, I want the dashboard selector page to feel like part of the redesigned product, so that the transition into an organization feels modern and coherent.
16. As a logged-in user, I want the org shell to be redesigned early, so that navigation and top-level chrome feel consistent before individual feature pages are migrated.
17. As a logged-in user, I want the org dashboard to adopt the new visual language without losing its current utility, so that I get a better experience without losing function.
18. As a logged-in user, I want pages that are not yet redesigned to clearly tell me that they are not available in `v2` yet, so that I am not confused by missing or inconsistent content.
19. As a logged-in user, I want that `v2` fallback experience to give me a clear path back to the current page, so that the staged rollout does not block my work.
20. As an organization member, I want permissions and existing access rules to behave the same during the redesign, so that the facelift does not create trust or security issues.
21. As a site owner, I want to roll out the redesign in standalone slices, so that each part can be shipped, reviewed, and validated independently.
22. As a site owner, I want `v2` to let redesigned and non-redesigned experiences coexist, so that I can migrate safely instead of waiting for a giant all-at-once launch.
23. As a site owner, I want the main domain to remain stable while `v2` matures, so that redesign work does not disrupt active users.
24. As a site owner, I want the public landing page ported exactly from the redesign reference, so that the strongest part of the new direction is preserved without dilution.
25. As a site owner, I want the rest of the public site to be free to restructure around that direction, so that those pages can become better marketing experiences rather than rigid clones.
26. As a site owner, I want the authenticated app to be inspired by the redesign rather than forced into a literal copy, so that the product remains practical for dense operational screens.
27. As a site owner, I want the redesign initiative to produce a more robust and unified design system, so that future contributors have clear visual boundaries.
28. As a site owner, I want the redesign to establish stronger UI practices and standards, so that future work is less likely to drift into inconsistent styling.
29. As a site owner, I want selective replacement of shared components instead of blanket rewrites, so that the project improves where needed without unnecessary churn.
30. As a site owner, I want the redesign effort to avoid unnecessary framework migrations, so that time is spent on user-facing value instead of expensive rewrites.
31. As a site owner, I want the redesign to preserve existing backend and schema behavior, so that front-end work does not create avoidable operational risk.
32. As a site owner, I want route changes on the main application to be minimized, so that existing links, habits, and integrations stay intact.
33. As a site owner, I want `v2` routing behavior to be explicit and testable, so that staged rollout logic remains reliable.
34. As a site owner, I want the redesign to produce a reusable token foundation for color, type, spacing, surfaces, and motion, so that new pages can be implemented consistently.
35. As a site owner, I want shared marketing primitives that can be reused across the public site, so that marketing pages do not become large one-off implementations.
36. As a site owner, I want a product-token bridge that adapts the marketing language to dense app workflows, so that the app stays usable while clearly belonging to the same family.
37. As a site owner, I want a written migration policy for reuse versus replacement, so that contributors make consistent decisions during the rollout.
38. As a developer, I want a design-system migration plan rather than just a homepage rewrite, so that implementation work can be organized as durable modules.
39. As a developer, I want the PR slices to be independently reviewable, so that large redesign work does not become impossible to reason about.
40. As a developer, I want a documented rollout order, so that I know which foundations need to exist before downstream page work starts.
41. As a developer, I want the exact landing page port to remain isolated from broader app redesign decisions, so that one area can ship even if another needs more design work.
42. As a developer, I want the public-site redesign to reuse a shared shell and content patterns, so that composition changes remain maintainable.
43. As a developer, I want `v2` to handle not-yet-migrated pages in a predictable way, so that partial rollout does not create ad hoc exceptions.
44. As a developer, I want the org shell redesign to land before many feature pages, so that downstream pages inherit better chrome and structure automatically.
45. As a developer, I want shared interactive primitives to be modernized thoughtfully, so that new surfaces do not keep carrying old UX debt.
46. As a developer, I want the redesign to preserve existing feature behavior contracts, so that visual work does not force backend rewrites.
47. As a developer, I want the redesign to keep performance in mind for slower environments, so that richer visuals do not become operational regressions.
48. As a developer, I want dark mode expectations to be explicit by surface, so that implementation choices are not left to guesswork.
49. As a developer, I want testing focused on routing, navigation, shell behavior, and shared interactive primitives, so that effort is concentrated on the highest-risk behavior.
50. As a developer, I want static marketing composition to be lightly tested rather than over-tested, so that the migration effort remains practical.

## Implementation Decisions

- The redesign remains in SvelteKit. A React or Next.js rewrite is not part of this initiative.
- Tailwind and shadcn are not prerequisites for achieving the new visual direction and are intentionally excluded from the core plan.
- The public landing page will be ported exactly from the redesign reference, including copy, typography, motion, mockups, and composition.
- Other public marketing pages will be redesigned to feel native to that landing page, but are allowed to restructure content composition and tone where that improves the experience.
- The initiative is a front-end migration and design-system effort, not a backend rewrite. No backend or schema changes are planned as part of this PRD.
- Existing feature behavior should remain unchanged unless a narrow front-end cleanup is necessary to remove clearly poor implementation patterns.
- Existing APIs and backend contracts should be preserved unless a targeted refactor is required to bring a clearly weak interface in line with best practices.
- Main-domain routes should remain stable unless a route adjustment is absolutely necessary.
- A `v2` experience will be introduced to support staged rollout of both public pages and authenticated pages.
- `v2` will host redesigned public marketing pages and any authenticated pages that have already been migrated.
- Pages requested in `v2` that have not yet been redesigned will show an interstitial explaining that the page is not available in the redesign yet and will provide a direct link to the equivalent page on the main domain.
- The current main-domain experience remains the source of truth until the redesign is mature enough to replace it.
- The authenticated app visual system will be a productized adaptation of the marketing language rather than a literal copy. This is required to preserve density, readability, and operational usability.
- Dark mode is required from the start for the authenticated app. The marketing site may remain primarily dark in character, but the system should still define how its surfaces behave intentionally rather than accidentally.
- Mobile support is required for the public site and major authenticated flows. Tablet support is explicitly required for the authenticated app. The calendar remains tablet/desktop-first, with mobile focused on narrow quick-hit use cases rather than full-grid parity.
- Performance expectations must account for slower government-connected machines. Visual richness must not depend on heavy interaction patterns or motion that degrade responsiveness.

### Major Modules

- **Marketing design token foundation**
  Defines the canonical visual language for the redesign, including colors, typography, spacing, surfaces, borders, shadows, motion, and dark-mode expectations.

- **Marketing shell and shared primitives**
  Provides reusable header, footer, section, CTA, layout, background, and content-composition patterns for the public site so public pages do not become one-off implementations.

- **Exact landing page port**
  Recreates the redesign landing page in Svelte with exact visual parity and behavior parity.

- **Marketing page migration layer**
  Applies the new shell and primitives across the remaining public pages while allowing those pages to restructure around the new tone and composition.

- **`v2` routing and rollout layer**
  Owns how redesigned pages are exposed, how missing pages are handled, and how users are guided back to the current experience when necessary.

- **Product token bridge**
  Translates the marketing visual language into app-appropriate tokens for dense authenticated surfaces without losing brand continuity.

- **Authenticated app shell v2**
  Covers the redesigned org shell, global navigation, high-level chrome, dashboard selector page, and org dashboard.

- **Shared product primitive refresh**
  Selectively replaces or reskins shared interactive components where needed to align with the new design system and better front-end practices.

- **Migration governance**
  Establishes rules for reuse, reskinning, replacement, and deferral so contributors make consistent decisions across many PRs.

### Rollout Strategy

- Ship the redesign in standalone slices rather than a big-bang release.
- Establish tokens and shared primitives before high-volume page migration.
- Land the exact public landing page early, since it is the clearest expression of the target direction.
- Introduce the `v2` routing and interstitial system before relying on partial rollout for broader page migration.
- Redesign the authenticated shell before many feature pages so downstream work inherits stronger chrome and structure.
- Treat the dashboard selector page and org dashboard as the first authenticated surfaces after the shell.
- Defer denser feature surfaces such as calendar until the v2 shell and dashboard foundations are proven.
- Continue migrating the rest of the authenticated app over time, with site-admin pages intentionally allowed to remain more generic and utilitarian than the main product experience.

### Intended Standalone PR Slices

1. Token foundation and typography/motion groundwork
2. Marketing shell and shared public primitives
3. Exact landing page port
4. Remaining public marketing pages
5. `v2` routing and interstitial system
6. Authenticated app shell v2
7. Dashboard selector page v2
8. Org dashboard v2
9. Subsequent authenticated feature migrations, one feature area at a time

### Migration Rules

- Reuse existing components when they already express the right behavior and can be cleanly reskinned.
- Replace existing shared interactive primitives when their current API or implementation shape would fight the new design system or represent poor front-end practice.
- Avoid parallel long-lived design systems that drift apart without a clear reason.
- Keep the public-site primitive layer and the authenticated product primitive layer related but distinct where density or behavior demands it.
- Prefer deep shared modules that encapsulate design-system behavior cleanly over scattered page-specific styling patterns.
- Keep exactness strict for the landing page and more adaptive elsewhere.

## Testing Decisions

- Good tests should verify externally visible behavior rather than implementation details. They should focus on what a user can do, what the system renders in meaningful states, and how routing and navigation respond in real usage.
- The highest-priority tests for this initiative cover:
  - `v2` routing behavior
  - `v2` fallback and interstitial behavior
  - authenticated shell and navigation behavior
  - shared interactive primitives whose behavior is reused across many pages
- Accessibility-critical interactions should be part of those tests where relevant, especially navigation, menus, dialogs, focus handling, and route transitions.
- Static marketing composition should not receive heavy test investment by default. Light validation is sufficient unless a public page contains meaningful interactive behavior.
- Prior art for this testing approach should come from existing behavior-focused tests in the codebase, especially shared-component tests and route-level tests that validate outputs and interactions rather than internal implementation shape.

## Out of Scope

- Rewriting the application in React or Next.js
- Introducing Tailwind or shadcn as mandatory infrastructure for the redesign
- Backend or schema changes
- Reworking core business workflows or feature semantics
- Replacing the entire authenticated app in a single release
- Immediate redesign of every authenticated feature page in the first wave
- Making the site-admin surface match the full product visual richness of the main app
- Full mobile parity for highly dense desktop-first tools like the calendar grid
- Publishing this PRD as a GitHub issue before product direction is finalized

## Further Notes

- This PRD is intended to guide a sequence of standalone PRs, not a single implementation branch.
- The public landing page is the visual source of truth for the redesign, but the authenticated product experience must remain operationally efficient first.
- The `v2` strategy is central to making this migration safe. It should be treated as product infrastructure, not just a temporary shortcut.
- Because the redesign is meant to create stronger guardrails for future contributors, decisions about tokens, shared primitives, and migration policy are first-class deliverables, not incidental implementation details.
