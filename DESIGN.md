---
name: 'TroopToTask'
description: 'Operational shadcn-svelte product UI with field-document discipline, task-first density, and shared-component visual authority.'
colors:
  ink-command: '#0e0e0d'
  ink-secondary: '#4a4a47'
  ink-muted: '#8e8e8a'
  rule-hairline: '#d6d5d0'
  rule-subtle: '#f0efeb'
  paper-page: '#f8f7f4'
  paper-panel: '#fafaf8'
  operational-amber: '#c47f00'
  amber-field-note: '#fdf3dc'
  amber-deep: '#8a5800'
  amber-active: '#e09200'
  success-field: '#345b22'
  success-wash: '#e8f0e2'
  danger-field: '#8a2d25'
  danger-wash: '#f7e7e4'
  info-field: '#2f5d75'
  info-wash: '#e7eef3'
  chrome-rail: '#12110f'
  chrome-text: '#f0efe9'
  chrome-muted: '#b0afa8'
  chrome-rule: '#2a2825'
shadcn:
  style: 'nova'
  baseColor: 'stone'
  css: 'src/app.css'
  uiPath: 'src/lib/components/ui'
  showroom: '/ui-showroom'
  appShellShowroom: '/ui-showroom/app-shell'
  conversionMap: '/ui-showroom/conversion-map'
  themeSource: 'documentElement[data-theme]'
  transitionDarkModeSupport: 'data-theme and .dark'
  tokenLayer: 'Tailwind v4 @theme inline variables mapped from CSS custom properties'
typography:
  display:
    fontFamily: 'Barlow Condensed, sans-serif'
    fontSize: '3.25rem'
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: '0.04em'
  headline:
    fontFamily: 'Barlow Condensed, sans-serif'
    fontSize: '2.25rem'
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: '0.04em'
  title:
    fontFamily: 'Barlow Condensed, sans-serif'
    fontSize: '1.375rem'
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: '0.04em'
  body:
    fontFamily: 'Source Serif 4, serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: 'normal'
  label:
    fontFamily: 'IBM Plex Mono, monospace'
    fontSize: '0.6875rem'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '0.12em'
rounded:
  sm: '2px'
  md: '4px'
  lg: '6px'
  pill: '9999px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  '8': '32px'
  '10': '40px'
  '12': '48px'
  '16': '64px'
components:
  button-primary:
    backgroundColor: '{colors.chrome-rail}'
    textColor: '{colors.chrome-text}'
    typography: '{typography.title}'
    rounded: '{rounded.md}'
    padding: '10px 18px'
    height: '40px'
  button-amber:
    backgroundColor: '{colors.operational-amber}'
    textColor: '{colors.ink-command}'
    typography: '{typography.title}'
    rounded: '{rounded.md}'
    padding: '10px 18px'
    height: '40px'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.ink-secondary}'
    typography: '{typography.title}'
    rounded: '{rounded.md}'
    padding: '10px 18px'
    height: '40px'
  input:
    backgroundColor: '{colors.paper-panel}'
    textColor: '{colors.ink-command}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '11px 12px'
    height: '44px'
  chip:
    backgroundColor: '{colors.rule-subtle}'
    textColor: '{colors.ink-secondary}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    padding: '4px 12px'
---

# Design System: TroopToTask

## 1. Overview

**Creative North Star: "The Field Ledger"**

TroopToTask should feel like shadcn-svelte translated through a field ledger: disciplined, legible, and built for repeated operational use. The interface earns trust through alignment, rules, restrained contrast, clear labels, fast recognition, and component behavior users can predict. It should feel closer to accountable paperwork and technical manuals than a generic SaaS dashboard.

This is a product register system. Design serves the work. Authenticated surfaces should prioritize dense but ordered information, predictable controls, fast filtering, and brief-ready comprehension. Marketing gestures, ornamental hero treatments, gratuitous motion, and decorative panels are out of place inside the app.

The current UI direction is a shadcn-svelte and Tailwind v4 migration, not a route-by-route redesign. The approved visual baseline is the shared component system demonstrated in `/ui-showroom` and `/ui-showroom/app-shell`. Future design work should start from those primitives, their compound project wrappers, and the shared tokens in `src/app.css`.

The visual system rejects generic SaaS marketing, shiny startup dashboards, soft productivity-app tropes, "AI slop," fake command-center theatrics, decorative gradients, glassmorphism, excessive roundness, heavy glow, purple-gradient AI aesthetics, novelty motion, card soup, stock military cliches, and trend-chasing visuals.

**Key Characteristics:**

- Paper-and-ink surfaces with a dark operational rail.
- Operational amber used as signal, not decoration.
- Condensed display type for command hierarchy, serif body copy for readable content, mono labels for metadata.
- Hairline dividers, tight radii, minimal shadows, and strong alignment.
- Dense controls that stay predictable under pressure.
- shadcn-svelte primitives calibrated centrally through Tailwind v4 tokens, not visually restyled at route usage sites.

## 2. Colors

The palette is restrained: warm paper, disciplined ink, one operational amber accent, and muted semantic colors for status. New shared UI work should use the shadcn/Tailwind token names exposed from `src/app.css`, especially `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border`, `ring`, `primary`, `secondary`, `accent`, `destructive`, and `sidebar-*`. TroopToTask's named paper, ink, amber, chrome, and semantic tokens remain the product meaning behind those shadcn names.

### Primary

- **Operational Amber**: The primary signal color for active navigation, focus, selected state, current day, emphasized action, and small status highlights. It is scarce by design.
- **Chrome Rail**: The dark app-shell surface used for primary navigation and durable workspace framing.

### Secondary

- **Field Success**: Green for positive readiness, available status, completed states, and success feedback.
- **Field Danger**: Red-brown for destructive actions, error states, sick status, and unavailable risk.
- **Field Information**: Blue-gray for informational status, school/training distinctions, and neutral report emphasis.

### Neutral

- **Command Ink**: Primary text and highest contrast details.
- **Secondary Ink**: Supporting labels, inactive metadata, and quieter controls.
- **Muted Ink**: Tertiary text, disabled copy, and low-priority chrome.
- **Hairline Rule**: Default border and table divider.
- **Subtle Rule**: Secondary divider, hover wash, and low-contrast row grouping.
- **Paper Page**: Main app background.
- **Paper Panel**: Panel, toolbar, modal, and table surface.
- **Chrome Text**: Text on the dark app rail.

### Named Rules

**The Amber Is Signal Rule.** Operational amber is for selection, focus, current state, and action. If it is being used only to make a surface more exciting, remove it.

**The Paper Never Goes Pure White Rule.** Product surfaces use warm paper values, not flat white. Pure white makes the system feel generic and breaks the field-document character.

**The Semantic Color Carries Meaning Rule.** Success, danger, and info colors appear only when they communicate state or classification. They are not decorative palette fillers.

**The Token Mapping Rule.** Product color decisions belong in `src/app.css`, Tailwind v4 `@theme inline` variables, and shared component source. Do not solve a route color mismatch with a local Tailwind override on a shared component.

## 3. Typography

**Display Font:** Barlow Condensed with sans-serif fallback.
**Body Font:** Source Serif 4 with serif fallback.
**Label/Mono Font:** IBM Plex Mono with monospace fallback.

**Character:** The pairing is intentionally document-like. Barlow Condensed gives command hierarchy and tight operational headers, Source Serif 4 keeps longer content readable and authoritative, and IBM Plex Mono makes metadata feel precise.

### Hierarchy

- **Display** (800, 3.25rem to 6rem, 0.95 line-height): Rare page-scale numbers, public page headlines, and major dashboard values. Avoid it inside dense controls.
- **Headline** (700 to 800, 2.25rem to 3.25rem, tight line-height): Major section titles and feature-level headings.
- **Title** (600 to 700, 1.1875rem to 1.75rem, tight line-height): Toolbar labels, modal headings, table group headings, and compact panel titles.
- **Body** (400, 1rem, 1.65 line-height): Prose, explanations, descriptions, and readable content. Cap prose at 65 to 75 characters when it is not table data.
- **Label** (500 to 600, 0.6875rem to 0.8125rem, 0.08em to 0.12em letter spacing): Breadcrumbs, filters, metadata, badges, form labels, table headers, and operational markers.

### Named Rules

**The Labels Are Instruments Rule.** Labels use IBM Plex Mono because they are controls and metadata, not decoration. Keep them short, uppercase when structural, and tied to an affordance.

**The Display Font Does Not Operate Controls Rule.** Barlow Condensed can command hierarchy, but it should not make dense controls, form fields, or data labels harder to scan.

**The shadcn Text Scale Rule.** shadcn primitives should keep compact, readable control text. Use Barlow Condensed for command hierarchy and selected headings only when it does not degrade form, menu, table, toolbar, or combobox scanability.

## 4. Elevation

TroopToTask is flat by default and layered by structure. Depth comes primarily from borders, tonal contrast, sticky bars, rail chrome, and table grids. Shadows exist, but they are quiet and stateful: small for raised controls, medium on hover, large for modals and overlays.

### Shadow Vocabulary

- **Low Operational Lift** (`0 1px 3px rgba(14, 14, 13, 0.08)`): Primary buttons and subtle raised surfaces.
- **State Lift** (`0 2px 8px rgba(14, 14, 13, 0.1), 0 1px 2px rgba(14, 14, 13, 0.06)`): Hovered controls and active cards.
- **Modal Lift** (`0 4px 20px rgba(14, 14, 13, 0.12), 0 2px 6px rgba(14, 14, 13, 0.07)`): Dialogs and topmost overlays.

### Named Rules

**The Flat-At-Rest Rule.** Tables, panels, and page regions should be flat until a state change or modal layer earns elevation.

**The Border Before Shadow Rule.** Reach for a 1px rule, tonal background, or alignment before adding shadow.

**The Shared Layer Owns Depth Rule.** Radius, border, shadow, ring, and hover depth for buttons, fields, cards, dialogs, menus, popovers, sheets, tables, and toolbars must be calibrated in shared UI and proven in the showroom before production routes consume them.

## 5. Components

TroopToTask now treats shadcn-svelte primitives and shadcn-derived compound components as the primary UI foundation. Generated shadcn code is project-owned once installed, but visual changes still happen centrally in `src/lib/components/ui/**`, `src/lib/components/**`, `src/app.css`, `components.json`, and `/ui-showroom`.

Production routes may configure behavior, data, labels, permissions, validation, columns, filters, sorting, loading, disabled state, and action handlers. They must not visually retune calibrated shared components through route-local classes, arbitrary Tailwind values, internal selectors, local CSS, or route-specific wrapper styling unless Robert explicitly approves the exception.

Use `/ui-showroom/conversion-map` before replacing legacy components. If a shared component cannot express a real route need, report a design-system gap and extend the shared component/API with showroom coverage instead of patching the route locally.

### shadcn Foundation

- **Primitive source:** shadcn-svelte components under `src/lib/components/ui/**`, configured through `components.json`.
- **Current style:** `nova` with `stone` base color, as recorded by the implementation-time shadcn-svelte CLI.
- **Token layer:** Tailwind v4 via `@import "tailwindcss"` and `@theme inline` in `src/app.css`.
- **Dark mode:** `documentElement[data-theme]` remains the app source of truth; `.dark` is also supported during the migration for shadcn compatibility.
- **Review surface:** `/ui-showroom` and `/ui-showroom/app-shell` are the approved places to calibrate and review shared component appearance.

### Buttons

Buttons are compact command controls built from the shared shadcn button primitive.

- **Shape:** Tight structured corners, compact heights, stable icon sizing, and no layout shift between states.
- **Primary:** Decisive actions use the shared primary variant, mapped to the calibrated token baseline.
- **Secondary / Outline / Ghost:** Supporting actions use shared variants only. Do not create route-local button skins.
- **Amber / Warning:** Operational amber is for selected, current, warning, or high-signal actions, not routine decoration.
- **Hover / Focus:** Hover, active, focus-visible, loading, and disabled states come from the shared component. Route code only provides state.

### Forms And Fields

Forms should use shadcn-backed `field`, `label`, `input`, `input-group`, `textarea`, `native-select`, `select`, `checkbox`, `radio-group`, `switch`, `combobox`, and `multi-select` primitives or project wrappers derived from them.

- **Inputs:** Quiet bordered controls with readable text, compact density, visible focus rings, and stable height.
- **Labels:** Short, precise, and close to the field. Mono labels are appropriate for structural metadata and dense operational forms.
- **Errors / Hints:** Preserve accessible associations and color-independent meaning.
- **Combobox / Multi-select:** Use shared compound APIs for searchable personnel, group, task, and filter selection. Do not keep route-local search-select skins.

### Toolbars

Toolbars are first-class operational controls, not loose rows of buttons.

- Use `ui/workspace-toolbar`, shadcn button groups, dropdown menus, select/combobox controls, input groups, and shared overflow behavior.
- Keep toolbars compact and predictable. Prefer grouped filters and command overflow over two-row toolbar sprawl.
- Routes may choose which commands are visible, disabled, loading, or moved into overflow. Routes may not change toolbar spacing, radius, borders, shadows, color, density, or typography.

### Tables, Data Tables, And Operational Matrices

Data-heavy surfaces should use shadcn table primitives, the shared `ui/data-table` foundation, or project-specific matrix wrappers. These surfaces are central to the product, not afterthoughts.

- **DataTable:** Use the shadcn-backed shared table system for sortable, searchable, paged, selectable, and action-heavy lists.
- **OperationalMatrix:** Training, Critical Tasks, DA6, and long-range calendar grids are not generic DataTables. Use `ui/operational-matrix` or a feature wrapper around it when the surface needs sticky axes, narrow rotated headers, legends, and status cells.
- **Reports / Charts:** Use shared report and chart wrappers that follow shadcn chart conventions and the showroom conversion map.
- **Density:** Fixed dimensions, sticky headers where useful, visible focus, accessible row actions, and color-independent status labels are required.

### Chips

Badges and chips are mono, compact, and status-oriented.

- **Style:** Pill shape, 4px by 12px padding, mono label, and semantic background wash.
- **State:** Use filled semantic chips for real state or classification. Use outlined or neutral chips for low-emphasis metadata.

### Cards / Containers

Containers should feel like bounded work surfaces, not decorative cards. Use shadcn `card` sparingly and preferably through project wrappers such as page shell, report workspace, workflow panel, summary rail, or data-table shells.

- **Corner Style:** Small structured radii (2px to 6px).
- **Background:** Paper panel over paper page, sometimes mixed with subtle rule tone for toolbar bands.
- **Shadow Strategy:** Flat by default. Hover shadows are acceptable only on interactive or selectable surfaces.
- **Border:** 1px hairline borders are the primary container affordance.
- **Internal Padding:** 16px for compact surfaces, 24px to 32px for substantial panels, and less for dense table shells.

### Inputs / Fields

Inputs are quiet, bordered, and readable.

- **Style:** Paper-panel fill, 1px field border, 4px radius, 44px minimum height, and inherited serif body text.
- **Focus:** Amber border plus amber focus ring.
- **Error / Disabled:** Danger text and border for errors; opacity reduction for disabled states without changing shape.

### Navigation

The authenticated shell uses the calibrated app-shell/sidebar treatment on desktop and a compact mobile navigation treatment. Navigation labels are icon-led, compact, and active states use operational amber or the calibrated sidebar primary token. Breadcrumbs in the top bar should read as structural location, not page marketing. Use shared sidebar, breadcrumb, tabs, sheet, dropdown, tooltip, and app-shell wrappers instead of route-local navigation treatments.

### Tables And Calendars

Data-heavy surfaces should use fixed dimensions, hairline grid rules, sticky headers where useful, and small metadata. Status color should be backed by text, abbreviation, icon, or label. Calendar and roster surfaces are work canvases, not framed cards inside cards. The main operational calendar remains app-specific; shadcn calendar/date-picker primitives are for picker and range-selection workflows unless a separate product decision changes that.

### Dialogs, Sheets, Popovers, And Menus

Overlays should use shadcn `dialog`, `alert-dialog`, `sheet`, `popover`, `dropdown-menu`, `command`, and `tooltip` primitives or shared wrappers around them.

- Preserve async close-blocking, destructive confirmation, disabled action, and loading behavior.
- Mobile-heavy filtering and long-form workflows should use shared sheet/drawer patterns once calibrated.
- Do not use a modal as the default answer when inline workflow, sheet, or progressive disclosure fits better.

### Empty, Alert, Toast, Loading, And Progress States

Feedback states should come from shared shadcn-backed primitives: `empty`, `alert`, `sonner`/toast provider, `skeleton`, `spinner`, and `progress`.

- Empty states should be direct and action-oriented, without marketing copy.
- Alerts are semantic and compact. Avoid route-local warning boxes, notice banners, and context panels once a shared primitive exists.
- Loading states should preserve layout and prevent text or controls from jumping.

### Showroom And Migration Governance

- `/ui-showroom` is the only approved calibration surface for shared visual appearance.
- `/ui-showroom/app-shell` is the app-shell visual baseline.
- `/ui-showroom/conversion-map` records legacy-to-shadcn replacement decisions.
- Production route migration should start with a gap scan. If required primitives are missing, stop and create or extend shared UI before migrating the route.
- Do not bridge old components with compatibility adapters unless a slice explicitly approves that tradeoff. Prefer clean replacement, then delete obsolete local CSS and legacy component paths.

## 6. Do's and Don'ts

### Do:

- **Do** start new product UI from calibrated shadcn-svelte primitives and project-owned compound components.
- **Do** use `/ui-showroom`, `/ui-showroom/app-shell`, and `/ui-showroom/conversion-map` as the visual review and migration baseline.
- **Do** use warm paper surfaces, dark ink, hairline rules, and tight radii as the default visual grammar.
- **Do** keep operational amber rare and meaningful: focus, active nav, selected state, current day, and action emphasis.
- **Do** use mono labels for metadata, filters, breadcrumbs, table headers, badges, and operational markers.
- **Do** make dense product controls predictable, keyboard-accessible, and visually stable across breakpoints.
- **Do** use grids, dividers, alignment, and grouping to communicate operational order.
- **Do** put durable visual variants in shared UI with showroom coverage and component-catalog documentation.
- **Do** let routes configure behavior and content while shared components own appearance.
- **Do** preserve WCAG AA contrast and never depend on color alone for status.

### Don't:

- **Don't** visually retune shared components from production routes without explicit owner permission.
- **Don't** use arbitrary Tailwind values, internal selectors, or route-local wrapper classes to change shared component spacing, radius, border, shadow, typography, color, animation, or density.
- **Don't** keep legacy wrappers such as old toolbar, search-select, multi-tag-select, empty-state, file-upload, or spinner patterns when a calibrated shadcn replacement exists.
- **Don't** treat generic shadcn defaults as automatically sufficient. Calibrate them in the showroom for TroopToTask first.
- **Don't** create compatibility adapters between old and new component systems unless a slice explicitly authorizes that compromise.
- **Don't** create generic SaaS marketing surfaces inside authenticated workflows.
- **Don't** use shiny startup dashboards, soft productivity-app tropes, "AI slop," or fake command-center theatrics.
- **Don't** use decorative gradients, glassmorphism, excessive roundness, heavy glow, or purple-gradient AI aesthetics.
- **Don't** make card soup. Use cards only for bounded items, repeated records, modals, or genuinely framed tools.
- **Don't** use side-stripe borders greater than 1px as colored accents on cards, list items, callouts, or alerts.
- **Don't** use gradient text.
- **Don't** use amber as a general decoration color.
- **Don't** animate layout or add novelty motion that does not communicate state.
