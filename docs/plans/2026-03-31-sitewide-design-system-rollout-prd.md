# PRD: Sitewide Design System Rollout and UI Refresh

## Problem Statement

TroopToTask has a strong new visual direction, but that direction is not yet expressed consistently across the actual product. The current experience still feels split across multiple visual eras:

- The new landing-page redesign establishes a clearer brand personality than the rest of the app currently follows.
- Public marketing pages, auth flows, and authenticated product areas do not yet feel like one coherent system.
- The global token layer and shared primitives still reflect an older styling contract, which makes page-by-page redesign work slower, more repetitive, and easier to drift.
- Several public and auth pages carry large page-local style blocks instead of inheriting from shared shells and reusable primitives.
- Authenticated product areas rely on shared components, but those components still encode older visual assumptions around typography, buttons, spacing, and pill-heavy accents.

From the user’s perspective, this creates a trust and continuity problem. A prospective customer can see a polished landing page and then encounter other surfaces that feel like a different product. A logged-in user can move from marketing to login to the product shell and feel visual discontinuity at each transition. A contributor can also struggle to tell which visual decisions are canonical versus historical leftovers.

The goal of this initiative is to make the new design system the authoritative visual foundation across the product without changing core workflows, backend behavior, or information architecture beyond what is necessary to support a cleaner, more coherent UI.

## Solution

TroopToTask will adopt the new design system defined in the current design-system specification as the canonical visual source of truth for all customer-facing surfaces.

Implementation will follow a phased rollout:

1. Establish the design system globally through tokens, typography, spacing, semantic colors, surfaces, states, and shared primitives.
2. Rebuild the public and pre-auth surfaces so they inherit from shared marketing and auth shells instead of carrying one-off page-local design systems.
3. Apply a productized version of the same visual system across the authenticated application shell and feature areas, preserving density, scannability, and operational clarity.

The new system should create strong continuity across the entire experience while allowing different surface types to express that system appropriately:

- Marketing surfaces may be more expressive and compositional.
- Auth surfaces should be direct, confident, and highly legible.
- Authenticated product surfaces should be denser, calmer, and more operational, while clearly belonging to the same family.

## Goals

1. Create one canonical design system for TroopToTask across marketing, auth, and authenticated product surfaces.
2. Replace the older global visual contract with the new field-document design language: disciplined structure, restrained amber signaling, condensed display typography, serif body copy where appropriate, and mono utility labeling.
3. Ensure the public site and login/auth surfaces feel visually continuous with one another and with the authenticated product.
4. Improve contributor clarity by making shared tokens, shells, and primitives the default path for future UI work.
5. Preserve existing user workflows and feature semantics while updating the visual layer.
6. Maintain accessibility, dark mode support, and performance on slower hardware and constrained networks.

## Non-Goals

- Rewriting the application in React or Next.js
- Introducing Tailwind or another styling framework as a prerequisite
- Reworking database schema, permissions, or backend business logic for redesign-only reasons
- Reimagining major product workflows as part of this initiative
- Forcing a literal marketing-page composition onto dense product screens
- Completing every authenticated page in a single release

## Design Principles

1. Design for readiness, not decoration.
2. Preserve operational trust through structure, contrast, and consistency.
3. Use amber as signal, not ornament.
4. Favor scannability over flourish on dense product screens.
5. Avoid generic SaaS styling, especially soft card stacks, oversized radii, decorative gradients, and interchangeable dashboard patterns.
6. Build shared foundations first so downstream redesign work compounds instead of repeating itself.

## Current-State Findings

The current codebase suggests four major implementation realities:

### 1. The project still runs on an older global styling contract

The app’s global tokens, fonts, and component classes are still oriented around an older visual system. Shared styles continue to encode older assumptions for buttons, inputs, typography, shadows, and border radius. This means the new design system cannot be rolled out cleanly by only rewriting pages.

### 2. Public and auth surfaces currently duplicate styling heavily

The homepage, features, pricing, security, privacy, and terms pages repeat the same general marketing shell patterns with large page-local styling blocks. The auth screens also repeat their own page-level styling patterns. This creates duplication and makes continuity harder to maintain.

### 3. The authenticated app is better positioned for system-wide migration

Much of the logged-in product already relies on shared shells and shared UI primitives. This is a positive constraint: updating those foundations will carry the new system farther than route-by-route rewriting alone.

### 4. Shared primitives are the highest-leverage migration point

Core primitives such as buttons, fields, toolbars, badges, tabs, menus, and shell chrome currently express older visual decisions. Redesigning those shared pieces will provide the biggest project-wide payoff and reduce one-off feature styling.

## User Stories

1. As a prospective customer, I want the site to feel cohesive across every public page, so that the product appears credible and well maintained.
2. As a prospective customer, I want the landing page to establish a strong visual identity, so that I quickly understand what kind of product this is.
3. As a prospective customer, I want features, security, pricing, terms, and privacy pages to feel like natural extensions of the landing page, so that I do not feel like I am jumping between unrelated designs.
4. As a prospective customer, I want the site to feel purpose-built for military administrative workflows, so that I trust the product fits my environment.
5. As a prospective customer, I want the public site to remain readable and usable on mobile, so that I can evaluate the product away from a desk.
6. As a prospective customer, I want the public site to remain performant on slower hardware and constrained networks, so that polish does not come at the cost of usability.
7. As a prospective customer, I want the login and access-request flows to feel like part of the same product as the marketing site, so that the transition into the app feels intentional.
8. As a prospective customer, I want the auth screens to be clean and legible, so that account tasks feel trustworthy and low-friction.
9. As a logged-in user, I want the authenticated app to clearly belong to the same product as the landing page, so that the overall experience feels coherent.
10. As a logged-in user, I want the app shell to feel more polished and structured, so that navigation and orientation are easier.
11. As a logged-in user, I want dense screens to remain scannable and efficient, so that redesign work does not slow me down.
12. As a logged-in user, I want key UI elements like buttons, pills, tabs, tables, and forms to feel visually consistent across features, so that the product is easier to learn and trust.
13. As a logged-in user, I want dark mode to feel intentional across marketing and product surfaces, so that the system feels complete rather than patched together.
14. As a logged-in user, I want the dashboard and shell chrome to be updated early, so that the product feels improved even before every feature route is fully migrated.
15. As a logged-in user, I want feature pages to keep their existing jobs and workflows, so that I do not have to relearn how to do my work.
16. As a logged-in user, I want roster-heavy and calendar-heavy pages to stay practical, so that visual consistency does not reduce information density where it matters.
17. As a site owner, I want the design-system rollout to produce shared visual rules and shared primitives, so that future work does not drift.
18. As a site owner, I want the rollout to happen in phases, so that progress can ship incrementally without losing the broader plan.
19. As a site owner, I want the project to modernize its shared UI foundations before feature-by-feature redesign, so that later work becomes cheaper and more consistent.
20. As a site owner, I want the landing mockup to guide the direction of other public pages without forcing them into exact copies, so that each page can still do its job well.
21. As a site owner, I want the authenticated product to use a productized version of the design system rather than a literal clone of the marketing aesthetic, so that the app remains operationally useful.
22. As a developer, I want a documented rollout order, so that I know what must land before downstream redesign work starts.
23. As a developer, I want a clear distinction between canonical tokens and temporary compatibility aliases, so that migration decisions are deliberate.
24. As a developer, I want public and auth shells extracted into reusable building blocks, so that page rewrites do not duplicate structure and styling.
25. As a developer, I want the app shell and shared primitives refreshed early, so that feature teams inherit better defaults automatically.
26. As a developer, I want the feature migration plan to be grouped by coherent workstreams, so that GitHub issues can be sliced in manageable units.
27. As a developer, I want explicit acceptance criteria for consistency, accessibility, and performance, so that completion is measurable.
28. As a designer/developer, I want one source of visual truth for typography, spacing, surfaces, states, and interaction patterns, so that new work is easier to ship correctly.

## Scope

### In Scope

- Global token, typography, spacing, and surface migration
- Shared primitive refresh for common interactive components
- Public-site shell extraction and page migration
- Auth-flow shell extraction and page migration
- Authenticated app shell refresh
- Feature-by-feature visual migration for authenticated routes
- Accessibility, dark mode, responsive, and performance validation for redesigned surfaces

### Out of Scope

- Business logic redesign
- Permissions redesign
- Data model changes
- Demo or sandbox expansion
- New feature delivery unrelated to the design-system rollout

## Proposed Architecture

### 1. One Canonical Token Foundation

TroopToTask will define one canonical token layer covering:

- color palette
- semantic status colors
- typography families and scale
- spacing scale
- border and radius rules
- shadows and elevation
- focus states
- interaction timing
- light and dark mode behavior

This foundation becomes the base for all customer-facing surfaces.

### 2. One Shared Visual Family, Two Surface Expressions

The same design system should support both:

- **Marketing/auth expression**: more compositional, more editorial, stronger hero and section framing
- **Product expression**: more restrained, denser, more structural, with stronger emphasis on tables, toolbars, filters, labels, and operational status

This is a single family, not two unrelated systems.

### 3. Shared Shells Instead of Page-Local Systems

The rollout should introduce reusable shells for:

- public marketing pages
- auth and account-entry pages
- authenticated app navigation and page chrome
- admin surfaces where appropriate

These shells should reduce duplication and centralize visual behavior.

### 4. Compatibility Bridge During Migration

Because the product currently depends on older token names and shared styles, the rollout should include a temporary compatibility layer that maps old assumptions onto the new system while route and primitive migration proceeds. This bridge is transitional and should be removed as the migration nears completion.

## Workstreams and Phases

### Phase 1: Foundation and Migration Infrastructure

Deliver the design-system groundwork that every later phase depends on.

Includes:

- canonical token definition
- new font loading and typography contract
- updated global resets and surface rules
- compatibility aliases for existing shared styles
- shared utility classes and documentation updates
- refresh of the most reused primitives such as buttons, fields, badges, tabs, menus, and page toolbars

Outcome:

The codebase has one active visual contract, even if not every route has been fully redesigned yet.

### Phase 2: Public and Pre-Auth Surface Migration

Rebuild the public and pre-auth experience around shared shells and the new design language.

Includes:

- root landing page aligned to the landing redesign reference
- features page
- pricing page
- security page
- terms page
- privacy page
- login and other auth-entry/account-recovery screens

Outcome:

Public and auth-entry surfaces feel like one coherent front door to the product.

### Phase 3: Authenticated Shell Migration

Refresh the shared logged-in experience before feature-by-feature route work.

Includes:

- top navigation/header chrome
- bottom mobile navigation
- page toolbar standards
- dashboard selector and entry experiences
- shared page containers and section framing
- admin shell alignment where appropriate

Outcome:

The product feels more consistent immediately, and downstream feature migrations inherit improved chrome.

### Phase 4: Feature-Family Migration

Migrate authenticated product areas in coherent feature groups rather than isolated pages.

Recommended order:

1. dashboard and common entry surfaces
2. calendar family
3. personnel family
4. training family
5. onboarding family
6. settings, billing, leaders-book, and other secondary surfaces
7. admin refinement pass

Outcome:

The authenticated application gradually converges on the new system without requiring a single large release.

### Phase 5: Cleanup and Decommissioning

Retire transitional styling and remove obsolete one-off design code.

Includes:

- removing compatibility aliases that are no longer needed
- deleting duplicated page-local style blocks made obsolete by shared shells
- collapsing old component variants that no longer fit the system
- final consistency and accessibility pass

Outcome:

The project ends with a durable design system rather than a partially migrated codebase carrying both old and new paradigms.

## Implementation Decisions

- The new design-system specification is the source of truth for the rollout, not prior redesign docs.
- The landing redesign HTML is the reference for the homepage and the visual guide for the broader public-site direction.
- The authenticated app will adopt the same family of tokens and visual language, but not by copying marketing-page composition directly.
- Shared primitives should be updated before most route-level redesign work.
- Page-local styling should be replaced with reusable shells and primitives wherever practical.
- The migration should preserve route structure and feature semantics unless a small UI-driven cleanup clearly improves maintainability.
- Temporary compatibility aliases are allowed as migration scaffolding, but they must not become permanent parallel systems.
- Pill-heavy treatment should be reserved for genuine status labels and similar semantics, not used as the default container or navigation aesthetic.
- Admin surfaces may remain somewhat more utilitarian than primary marketing surfaces, but they should still inherit the same system fundamentals.

## Acceptance Criteria

### System-Level

- A single canonical token layer exists and is used across redesigned surfaces.
- Shared typography, spacing, surface, and status rules are documented and implemented.
- Common UI primitives express the new design system by default.

### Public/Auth

- The homepage, supporting public pages, and auth screens feel visually related and consistent.
- Public and auth pages no longer rely on duplicated page-local design-system blocks as their primary styling model.
- The landing page reflects the approved redesign direction.

### Product

- The authenticated app shell clearly belongs to the same visual family as the public site.
- Core product surfaces maintain or improve current scannability and usability.
- Dense product screens avoid decorative regressions that reduce readability.

### Quality

- Redesigned surfaces support dark mode intentionally.
- Redesigned surfaces remain accessible by keyboard and meet WCAG 2.1 AA contrast requirements.
- Redesigned surfaces perform acceptably on slower hardware and constrained network conditions.

## Testing Decisions

- Favor behavior-focused testing over styling-detail snapshot testing.
- Test the highest-risk shared elements first: shell navigation, toolbar behavior, tabs, menus, dialogs, and forms.
- Use visual QA and manual design review for layout, typography, and composition fidelity where automated tests would add low value.
- Add targeted accessibility checks for:
  - keyboard navigation
  - focus visibility
  - menu and dialog behavior
  - form labeling and errors
  - contrast on status surfaces and critical UI
- Validate dark mode and responsive behavior on every migrated shell and representative feature page.
- Perform performance smoke checks on redesigned marketing pages and key authenticated entry points.

## Risks and Mitigations

### Risk: Route-by-route styling creates drift

Mitigation:
Prioritize foundations and shared shells before broad page migration.

### Risk: Marketing aesthetics reduce app usability

Mitigation:
Explicitly treat product surfaces as a productized adaptation of the system, not a literal marketing clone.

### Risk: Compatibility aliases become permanent

Mitigation:
Track them as migration-only scaffolding and remove them in the cleanup phase.

### Risk: The work becomes too large to sequence cleanly

Mitigation:
Break the initiative into issue-sized workstreams tied to phases, shells, and feature families.

### Risk: Visual changes accidentally alter behavior

Mitigation:
Keep backend and workflow semantics out of scope and use targeted regression testing on shared primitives and shells.

## Rollout Plan

The rollout should be managed as a parent planning issue with linked child issues grouped by workstream.

Suggested child issue groups:

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

## Suggested GitHub Issue Shape

Title:

`PRD: Sitewide design system rollout across marketing, auth, and product`

Recommended labels:

- `prd`
- `design-system`
- `frontend`
- `ui`

## Further Notes

- This initiative should be treated as a system migration, not a homepage rewrite.
- The biggest leverage comes from replacing the shared visual contract first, then letting route-level work inherit from that foundation.
- The final result should make future UI work easier, not just make current screenshots prettier.
