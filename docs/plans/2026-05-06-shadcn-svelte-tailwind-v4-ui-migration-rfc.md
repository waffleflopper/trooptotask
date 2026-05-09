# RFC: shadcn-svelte And Tailwind v4 UI Migration

## Purpose

Migrate TroopToTask's UI foundation to shadcn-svelte and Tailwind v4 without turning the product into a route-by-route redesign project.

The goal is one calibrated shared component system for the authenticated product, public surfaces, and supporting workflows. The migration should make the current field-ledger design language easier to apply consistently: warm paper surfaces, disciplined ink, sparse operational amber, tight radii, dense controls, strong labels, visible focus, and table-first operational clarity.

This is a migration program, not a rewrite and not a visual free-for-all.

## Context

TroopToTask v1 is a single SvelteKit app. The main app lives under `src/routes/org/[orgId]`, product feature modules live under `src/features/*`, and shared UI primitives live under `src/lib/components/**` and `src/lib/components/ui/**`.

The current architecture docs already prefer:

- thin route shells
- feature-owned page views, contexts, stores, utilities, and read models
- shared UI primitives before one-off controls
- documented drift instead of hidden contradictions

The current component catalog already defines shared primitives such as `PageToolbar`, `Modal`, `ConfirmDialog`, `Badge`, `FormField`, `SearchSelect`, `MultiTagSelect`, `EmptyState`, `FileUpload`, `DataTable`, and the `Toolbar` family.

`SubNav` was removed during the shadcn-svelte migration inventory pass because no production route or component usage remained. Future route-level navigation should be resolved through `tabs`, toolbar navigation, side navigation, or a shared `RouteTabs` treatment instead of restoring `SubNav`.

The existing design-system rollout PRD establishes the product direction. This RFC narrows that direction into a concrete shadcn-svelte and Tailwind v4 migration contract.

Current upstream docs checked while writing this RFC:

- shadcn-svelte latest migration docs state that the latest version expects Svelte 5 and Tailwind v4.
- shadcn-svelte Tailwind v4 notes call out `@theme`, `@theme inline`, Svelte 5 component updates, `data-slot` attributes on rendered primitives, the move toward the `new-york` style for new projects, and OKLCH color output.
- shadcn-svelte describes itself as open component code built with Bits UI and Tailwind CSS, not a closed component library package.
- Tailwind's SvelteKit guide uses `@tailwindcss/vite` and `@import "tailwindcss"` for Tailwind v4.
- Tailwind v4 targets modern browsers, with core support depending on Chrome 111, Safari 16.4, and Firefox 128 or newer.

Reference links:

- [shadcn-svelte SvelteKit install docs](https://www.shadcn-svelte.com/docs/installation/sveltekit)
- [shadcn-svelte Tailwind v4 migration docs](https://shadcn-svelte.com/docs/migration/tailwind-v4)
- [shadcn-svelte theming docs](https://www.shadcn-svelte.com/docs/theming)
- [shadcn-svelte component index](https://www.shadcn-svelte.com/docs/components)
- [Tailwind CSS SvelteKit install docs](https://tailwindcss.com/docs/installation/framework-guides/sveltekit)
- [Tailwind CSS compatibility docs](https://tailwindcss.com/docs/compatibility)

## Decision

TroopToTask will adopt shadcn-svelte as the primary shared component source and Tailwind v4 as the utility/token integration layer for future UI work.

Because shadcn-svelte gives the app source code for components, the generated code becomes TroopToTask-owned shared UI after installation. Upstream defaults are a starting point, not a permanent external dependency contract. Local changes should happen centrally in shared component files and token files, with the showroom proving those changes before route migration uses them.

The approved target appearance is the shadcn-svelte visual style calibrated in `/ui-showroom` and `/ui-showroom/app-shell`. Migrated production surfaces should align all non-component styling with that baseline using Tailwind CSS utilities and shared tokens. This applies to layout scaffolding, spacing, local helper text, simple panels, empty permission states, and other route-owned structure that is not itself a shared shadcn/shared component.

The migration must happen in phases:

1. Install and configure shadcn-svelte and Tailwind v4.
2. Identify every shadcn/shared component the project expects to use.
3. Build a component showroom/demo page containing all selected components and important states.
4. Tune global tokens and shared component styling using only that showroom.
5. Migrate app areas using the calibrated shared components without local visual overrides.

No feature route should become the place where the shared visual language is invented.

## Core Rule: Shared Visuals, Route Behavior

After shared components are visually calibrated, route-level code must not alter their visual appearance without explicit owner permission.

Do not assume permission. Permission must be written into the issue, PRD, RFC, or PR comments for the slice doing the work.

Route-level code may configure behavior:

- which table features are enabled
- which columns render
- which filters, search, view modes, bulk actions, and row actions exist
- which actions are disabled, hidden, or permission-gated
- which validation rules apply
- which labels, helper text, and empty-state messages are shown
- which data is passed into cells, dialogs, forms, and menus

Route-level code may use Tailwind CSS for route-owned layout and structure during migration, but that Tailwind must align with the approved showroom/app-shell baseline. It is for expressing shared spacing, layout, surface, and typography patterns consistently, not for creating a new route-specific look.

Route-level code may not visually restyle calibrated shared components:

- no route-local Tailwind classes that change spacing, radius, borders, shadows, typography, colors, animation, or component density on shared components
- no route-local CSS selectors that target shared component internals
- no one-off wrapper classes whose purpose is to make a shared component look different
- no arbitrary Tailwind values to tune a shared component for one page
- no duplicate route-local versions of buttons, inputs, badges, dialogs, menus, tables, tabs, toolbars, or empty states
- no visual variants added only because one route "needs something a little different"

If a route exposes a real reusable need, add a shared component variant or behavior prop in `src/lib/components/**` or `src/lib/components/ui/**`, document it in `docs/component-catalog.md`, and prove it in the showroom before route migration uses it.

## Non-Goals

- Rebuilding the app from scratch.
- Changing product workflows just because the component stack changes.
- Replacing feature modules or route structure as part of visual migration.
- Deepening demo/sandbox behavior.
- Treating shadcn-svelte defaults as automatically sufficient for TroopToTask without calibration.
- Preserving every legacy visual detail if it conflicts with the new shared baseline.
- Allowing local visual escape hatches after calibration.

## Phase 1: Install And Configure shadcn-svelte + Tailwind v4

Purpose: establish the technical foundation without changing broad product surfaces.

Implementation notes for the future slice:

- Use `shadcn-svelte@latest`, Svelte 5, and Tailwind v4.
- Use the current official shadcn-svelte and Tailwind v4 installation guidance at implementation time.
- Expect Tailwind v4 to use the Vite plugin path with `@tailwindcss/vite`.
- Expect `src/app.css` to import Tailwind through `@import "tailwindcss"` once Tailwind is active.
- Use Tailwind v4 `@theme` and `@theme inline` for exported design tokens when that is the cleanest way to expose TroopToTask CSS variables to utility classes.
- Preserve SvelteKit and Svelte 5 conventions.
- Keep the current product fonts and field-ledger token intent unless a separate design decision says otherwise.
- Map TroopToTask tokens into Tailwind v4 in a way that keeps `src/app.css`, Tailwind theme variables, and shared components as the canonical visual layer.
- Keep light/dark mode behavior aligned with the existing `data-theme` setup unless the implementation slice explicitly changes that contract.
- Configure `components.json` so generated shadcn-svelte components land under project shared paths, especially `$lib/components/ui`.
- Prefer adding shadcn primitives through the project-local shared UI folders instead of scattering generated components into feature routes.
- Prefer the current shadcn-svelte default style for new projects unless the implementation slice records a different decision. As of this RFC, upstream docs say new projects use `new-york`.
- Account for Tailwind v4 browser support in product QA. If TroopToTask must support browsers older than Tailwind v4's documented baseline, that must be decided before migration proceeds.

Acceptance criteria:

- Tailwind v4 is configured for the SvelteKit app.
- shadcn-svelte is initialized with project-compatible aliases and component paths.
- Existing global tokens are mapped or bridged intentionally.
- Tailwind/shadcn tokens use OKLCH or documented CSS variable mappings where practical, while preserving TroopToTask's named product tokens.
- The migration records whether `data-theme`, `.dark`, or both will be supported for dark mode during the transition.
- No feature route is migrated in this phase except for the minimum smoke surface needed to prove the stack loads.
- Required verification passes.

## Phase 2: Identify The Expected Component Set

Purpose: decide what the product will standardize before generating or migrating components.

The inventory must compare three sources:

- shadcn-svelte available components
- current TroopToTask shared components in `docs/component-catalog.md`
- real route needs across authenticated, public, auth, and admin surfaces

Initial expected component families:

| Family | Expected shared components |
| --- | --- |
| App structure | sidebar, app shell, page shell, page header, page actions, breadcrumb, separator, scroll area |
| Commands | button, button group, icon button, dropdown menu, context menu, overflow menu, command menu where justified |
| Forms | field, formsnap, label, input, input group, textarea, native select, select, checkbox, radio group, switch, combobox/search select, multi-select, slider, form section, validation message |
| Feedback | alert, alert dialog, sonner/toast, progress, spinner, skeleton, empty state |
| Overlays | dialog, drawer, sheet, popover, hover card, tooltip |
| Navigation | tabs, subnav, navigation menu, segmented control/toggle group, pagination, mobile nav primitives |
| Data display | table, data table, badge, avatar/avatar menu, item/detail rows, description/list rows, date cell, calendar/range calendar, chart shell |
| Toolbars | toolbar shell, toolbar actions, toolbar filters, toolbar search, toolbar view toggle, toolbar nav/meta/metric items |
| File and import workflows | file upload, import preview table, bulk import table |
| Charts and reports | chart shell, report section, chart tooltip/legend conventions |

Known shadcn-svelte components that should be considered during inventory include accordion, alert dialog, alert, aspect ratio, avatar, badge, breadcrumb, button group, button, calendar, card, carousel, chart, checkbox, collapsible, combobox, command, context menu, data table, date picker, dialog, drawer, dropdown menu, empty, field, formsnap, hover card, input group, input OTP, input, item, kbd, label, menubar, native select, navigation menu, pagination, popover, progress, radio group, range calendar, resizable, scroll area, select, separator, sheet, sidebar, skeleton, slider, sonner, spinner, switch, table, tabs, textarea, toggle group, toggle, tooltip, and typography.

TroopToTask does not need to adopt every available upstream component. The inventory phase should choose the smallest complete set that covers real app needs.

Acceptance criteria:

- Every selected component has an owner path in `src/lib/components/**` or `src/lib/components/ui/**`.
- Every existing shared component is classified as one of: migrate to shadcn-backed shared component, keep as app-specific wrapper, deprecate after migration, or leave unchanged for now.
- Data-heavy surfaces, especially tables and toolbars, are treated as first-class migration targets instead of afterthoughts.
- The component list is recorded in this RFC or a linked inventory document before Phase 3 starts.

## Phase 3: Build The Component Showroom

Purpose: create one calibration surface where the UI system can be tuned without borrowing visual decisions from feature routes.

The showroom should be a development-only or internal route that renders selected shared components and important states. The exact route can be decided during implementation, but it should be easy for agents and humans to open locally.

Required showroom coverage:

- light and dark themes
- default, hover, focus, disabled, loading, selected, destructive, warning, success, empty, and error states
- dense desktop and constrained mobile layouts
- keyboard focus paths for menus, dialogs, tabs, selects, tables, and forms
- table examples with sorting, filtering, empty rows, row actions, bulk actions, pagination, sticky headers, and compact cells
- toolbar examples with actions, overflow, filters, search, view toggles, meta items, nav items, and mobile compaction
- forms with required fields, validation, hints, disabled fields, combobox/search select, multi-select, checkbox/switch/radio controls, and textarea
- overlays including dialog, confirm dialog, sheet, popover, dropdown, and tooltip
- status and feedback examples including badges, alerts, toasts, skeletons, progress, empty states, and file-upload states

Showroom rules:

- The showroom is the only approved place to tune global tokens and shared component visuals.
- The showroom must use the same shared components that routes will use.
- The showroom should exercise the upstream `data-slot` hooks where shared styling needs stable component-part targeting.
- The showroom may arrange examples for clarity, but it must not define alternate component styling that routes can copy.
- Visual QA findings from feature routes must be brought back to the showroom and resolved at the shared layer.

Acceptance criteria:

- The showroom renders all selected components and states.
- The showroom is documented in `docs/component-catalog.md`.
- The showroom is usable for visual review on desktop and mobile widths.
- Automated tests cover shared behavior where practical; visual review covers appearance.

## Phase 4: Tune Global Tokens And Shared Styling In The Showroom

Purpose: calibrate shadcn-svelte defaults to TroopToTask's product language once, centrally.

Calibration areas:

- color tokens, including paper, ink, amber, semantic states, shell chrome, and dark mode
- shadcn token mappings, including `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart-*`, and `sidebar-*`
- typography, including condensed command hierarchy, mono labels, and readable body text
- radius, preserving tight structured corners
- borders, hairline rules, and low-shadow elevation
- spacing and density for operational screens
- focus rings and keyboard states
- loading, disabled, destructive, warning, and success states
- table and toolbar density
- motion timing, reduced-motion behavior, and menu/dialog transitions

Rules:

- Tune global tokens first.
- Tune shared component wrappers second.
- Add shared variants only when they represent durable product semantics.
- Use component-level `data-slot` styling only in shared component code or global shared styles, not in feature routes.
- Do not tune one route as a proxy for the whole system.
- Do not add route-local visual overrides to compensate for incomplete token work.

Acceptance criteria:

- Shared components match the field-ledger design direction in the showroom.
- Light and dark themes are intentionally calibrated.
- WCAG AA contrast is checked for core text, controls, focus, status, destructive actions, and disabled states.
- Component docs describe allowed props, variants, and behavior knobs.
- The owner explicitly accepts the visual baseline before broad route migration starts.

## Phase 5: Migrate App Areas With Calibrated Shared Components

Purpose: move real product surfaces onto the calibrated shared system without reopening visual design at every route.

Route migration order should follow coherent app areas, not isolated opportunistic files:

1. app shell and common page structure
2. dashboard and entry surfaces
3. critical tasks
4. training
5. duty rosters and calendar
6. personnel
7. onboarding
8. organization settings, billing, and admin
9. public and auth support surfaces, if they are not handled in a separate public-site migration slice
10. cleanup and deprecation of legacy UI paths

Route migration rules:

- Use calibrated shared components as-is.
- Convert remaining non-component styling to Tailwind CSS that matches the `/ui-showroom` and `/ui-showroom/app-shell` visual baseline.
- Keep route files thin: data wiring, feature context, and behavior configuration only.
- Keep feature-specific orchestration inside `src/features/*`.
- Move repeated route patterns into shared components instead of local wrappers.
- Preserve workflow behavior unless the issue explicitly authorizes product changes.
- Preserve permission gates and authorization behavior.
- Update `docs/component-catalog.md` whenever a shared component API changes.
- Remove obsolete local CSS and legacy component paths as each area migrates.

Acceptance criteria for each app-area slice:

- The area uses calibrated shared components for buttons, forms, tables, dialogs, toolbars, empty states, tabs/navigation, menus, and status labels where applicable.
- Route-level code contains behavior configuration, not visual overrides.
- Any needed new visual variant is added centrally, documented, and shown in the showroom before route usage.
- Existing behavior and permissions are preserved unless explicitly changed.
- Focus, keyboard access, responsive behavior, and dark mode are checked for the migrated area.
- Required verification passes.

## Governance

This RFC adds a UI governance rule:

> Shared component appearance is owned by the shared UI layer after calibration. Route code owns behavior only.

Governance expectations:

- Future issues should state whether they are allowed to change shared visuals.
- Pull requests that add route-local visual overrides should be treated as failing the migration contract unless explicit permission is linked.
- Reviewers should ask whether a route-level class changes behavior/layout responsibility or visual appearance.
- If the answer is visual appearance, the change belongs in shared UI and the showroom.
- If a route cannot express its needs through shared components, the slice should stop and propose a shared component/API extension.

## Documentation Updates Required During Implementation

Update these documents as the migration lands:

- `docs/component-catalog.md` for shared component APIs, props, variants, usage rules, and the showroom route.
- `docs/architecture/ARCHITECTURE.md` only if the default frontend architecture changes beyond adopting the shared UI stack.
- `docs/architecture/MODULE_CONVENTIONS.md` if shared UI placement or route conventions change.
- `docs/architecture/DRIFT_LEDGER.md` if the migration identifies or removes meaningful UI-system drift.
- `docs/architecture/ADR_BACKLOG.md` if a lasting architecture decision needs a follow-up ADR.

## Testing And Verification

The migration should use the repo's standard verification:

- `npm run format`
- `npm run lint`
- `npm run governance:check`
- `npm run check`
- `npm run test`

Additional UI checks for implementation slices:

- shared component unit tests for behavior and accessibility-sensitive state
- route smoke tests for migrated workflows
- manual or browser-assisted visual review of the showroom at desktop and mobile widths
- focused keyboard testing for dialogs, menus, tabs, forms, table actions, and toolbar compaction
- dark mode review for the showroom and each migrated area

## Risks

### Risk: shadcn-svelte adoption is treated as a silver bullet

Mitigation: keep the showroom, token calibration, component catalog, and route-level visual override ban as required parts of the migration.

### Risk: route migration recreates visual drift

Mitigation: route code may configure behavior only. Visual changes go through shared UI and the showroom.

### Risk: Tailwind utilities become local design escape hatches

Mitigation: utility classes can support layout where ownership belongs to the route, but component appearance must remain centralized.

### Risk: data-heavy screens lose operational density

Mitigation: tables, toolbars, compact filters, row actions, and mobile compaction are required showroom cases before route migration.

### Risk: the migration becomes too large to review

Mitigation: ship in area-based vertical slices after the foundation, inventory, showroom, and calibration phases are complete.

## Open Questions

1. Should the showroom be available only in development, only to platform admins, or both?
2. Should public marketing components migrate through the same showroom or a separate public-facing showroom section?
3. Which legacy shared components should be preserved as app-specific wrappers around shadcn primitives instead of replaced directly?
4. Should the route-level visual override ban be enforced by lint/governance checks once the migration is underway?

## Recommendation

Proceed with this RFC as the controlling migration contract. Start with the foundation and inventory slices, then build the showroom before any broad app-area migration.

The most important success condition is not that TroopToTask uses shadcn-svelte. It is that TroopToTask ends with one shared, calibrated UI system that future route work cannot quietly fork.
