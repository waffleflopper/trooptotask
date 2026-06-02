---
name: TroopToTask
description: Military unit management SaaS for personnel readiness and operations
colors:
  command-charcoal: 'oklch(14.7% 0.004 49.25)'
  formation-ivory: 'oklch(98.5% 0.001 106.423)'
  muster-ash: 'oklch(97% 0.001 106.424)'
  standing-stone: 'oklch(44.4% 0.011 73.639)'
  parade-line: 'oklch(92.3% 0.003 48.717)'
  field-stone: 'oklch(21.6% 0.006 56.043)'
  dark-field: 'oklch(26.8% 0.007 34.298)'
  ops-amber: 'oklch(66.6% 0.179 58.318)'
  ops-amber-dark: 'oklch(76.9% 0.188 70.08)'
  alert-red: 'oklch(57.7% 0.245 27.325)'
  alert-red-dark: 'oklch(63.7% 0.237 25.331)'
  readiness-green: 'oklch(62.7% 0.194 149.214)'
  intel-blue: 'oklch(58.8% 0.158 241.966)'
  chrome: 'oklch(14.7% 0.004 49.25)'
  chrome-text: 'oklch(95.2% 0.006 95)'
  chrome-text-muted: 'oklch(72% 0.01 73.639)'
  chrome-border: 'oklch(25.5% 0.006 56.043)'
  chrome-surface: 'oklch(18% 0.004 49.25)'
  chrome-surface-muted: 'oklch(28% 0.005 49.25)'
typography:
  display:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: '0'
  headline:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: '0'
  title:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '0'
  body:
    fontFamily: "'Source Serif 4', serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: '0'
  label:
    fontFamily: "'IBM Plex Mono', monospace"
    fontSize: '0.6875rem'
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: '0.08em'
rounded:
  sm: '2px'
  md: '4px'
  lg: '6px'
  full: '9999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
components:
  button-primary:
    backgroundColor: '{colors.command-charcoal}'
    textColor: '{colors.formation-ivory}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  button-outline:
    backgroundColor: '{colors.formation-ivory}'
    textColor: '{colors.command-charcoal}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.command-charcoal}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  button-destructive:
    backgroundColor: 'oklch(57.7% 0.245 27.325 / 0.1)'
    textColor: '{colors.alert-red}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  input-default:
    backgroundColor: 'transparent'
    textColor: '{colors.command-charcoal}'
    rounded: '{rounded.lg}'
    padding: '4px 10px'
    height: '32px'
  card-default:
    backgroundColor: '{colors.formation-ivory}'
    textColor: '{colors.command-charcoal}'
    rounded: '{rounded.md}'
  badge-default:
    backgroundColor: '{colors.command-charcoal}'
    textColor: '{colors.formation-ivory}'
    rounded: '{rounded.md}'
    padding: '2px 8px'
  chip-default:
    backgroundColor: '{colors.muster-ash}'
    textColor: '{colors.standing-stone}'
    rounded: '{rounded.full}'
    padding: '4px 12px'
---

# Design System: TroopToTask

## 1. Overview

**Creative North Star: "The Operations Center"**

TroopToTask should feel like a disciplined operations center: warm paper surfaces, hard-working controls, dense information, visible state, and no decorative noise. The interface exists for NCOs, officers, and staff sections who need to know the state of their formation quickly and act without hunting through scattered systems.

The implemented UI foundation is shadcn-svelte on Tailwind v4, configured through `components.json` with the `nova` style, `baseColor: stone`, and shared primitives under `src/lib/components/ui`. The visual language is owned centrally by `src/app.css`, Tailwind theme variables, and shared component source files. Production routes consume those visuals as-is and may vary behavior, labels, data, filters, actions, validation, and permissions.

This system rejects two opposite failures: consumer/startup SaaS polish (pastel gradients, playful illustrations, bouncy motion, "delightful" empty states) and legacy military software (green-on-gray brutalism, tiny system fonts, modal-first workflows). The target is professional operational software: modern, fast, restrained, and trustworthy.

**Key Characteristics:**

- Warm tinted neutrals, sparse operational amber, and semantic status colors.
- Tight radii, thin borders, flat page surfaces, and low-shadow overlays only.
- Barlow Condensed for structure, Source Serif 4 for content, IBM Plex Mono for data.
- Dense table-first and toolbar-first workflows using shared shadcn-backed primitives.
- Explicit keyboard focus, reduced-motion support, and WCAG AA contrast targets.

## 2. Colors

The palette is restrained and warm: paper, ink, stone, amber signal, and functional red/green/blue states.

### Primary

- **Command Charcoal** (`oklch(14.7% 0.004 49.25)`): Primary light-mode text, button fills, dark theme background, and app chrome. It is warm-tinted black, never pure black.
- **Formation Ivory** (`oklch(98.5% 0.001 106.423)`): Primary light-mode background, card surface, popover surface, and primary foreground in dark mode. It is warm paper, never pure white.

### Tertiary

- **Ops Amber** (`oklch(66.6% 0.179 58.318)`, dark: `oklch(76.9% 0.188 70.08)`): The single operational accent. Use for focus rings, current selections, warning-adjacent emphasis, chart-1, and links. Its rarity is the signal.

### Neutral

- **Muster Ash** (`oklch(97% 0.001 106.424)`): Muted surface, secondary button fill, hover tint, sidebar accent in light mode.
- **Standing Stone** (`oklch(44.4% 0.011 73.639)`): Muted text, placeholder text, secondary metadata, and subdued labels.
- **Parade Line** (`oklch(92.3% 0.003 48.717)`): Borders, dividers, input borders, table rules, and subtle component boundaries.
- **Field Stone** (`oklch(21.6% 0.006 56.043)`): Dark-mode cards, popovers, and high-contrast secondary foreground.
- **Dark Field** (`oklch(26.8% 0.007 34.298)`): Dark-mode secondary and muted surfaces, dark borders.

### Status Colors

- **Alert Red** (`oklch(57.7% 0.245 27.325)`, dark: `oklch(63.7% 0.237 25.331)`): Destructive actions, errors, expired training, overdue items, and chart-4.
- **Readiness Green** (`oklch(62.7% 0.194 149.214)`): Success states, current training, active readiness, and chart-2.
- **Intel Blue** (`oklch(58.8% 0.158 241.966)`): Informational states and chart-3.

### Chrome

- **Chrome** (`oklch(14.7% 0.004 49.25)`): Authenticated shell background and permanent dark chrome.
- **Chrome Text** (`oklch(95.2% 0.006 95)`): Chrome foreground.
- **Chrome Text Muted** (`oklch(72% 0.01 73.639)`): Chrome secondary text.
- **Chrome Border** (`oklch(25.5% 0.006 56.043)`): Chrome dividers.
- **Chrome Surface** (`oklch(18% 0.004 49.25)`) and **Chrome Surface Muted** (`oklch(28% 0.005 49.25)`): Shell panels, hover states, overlays, and muted chrome surfaces.

### Named Rules

**The One Accent Rule.** Ops Amber is the only saturated accent outside functional status colors. If amber covers more than about 10% of a normal product screen, the screen is using signal as decoration.

**The Tinted Neutral Rule.** New neutrals must carry the warm TroopToTask hue. Do not introduce `#000`, `#fff`, or achromatic gray.

**The Shared Token Rule.** Route code uses Tailwind tokens such as `bg-background`, `bg-card`, `text-muted-foreground`, `border`, and `rounded-lg`. It must not create local color systems.

## 3. Typography

**Display Font:** Barlow Condensed (with sans-serif fallback)
**Body Font:** Source Serif 4 (with serif fallback)
**Label/Mono Font:** IBM Plex Mono (with monospace fallback)

**Character:** Military brevity with editorial legibility. Barlow Condensed gives command hierarchy and density; Source Serif 4 keeps longer operational copy readable; IBM Plex Mono marks data, status, and machine-like labels.

### Hierarchy

- **Display** (Barlow Condensed 800, line-height 1.1): Public hero titles and rare high-impact titles. Avoid in dense controls.
- **Headline** (Barlow Condensed 700, line-height 1.1): Authenticated page headers and major section headers.
- **Title** (Barlow Condensed 600, line-height 1.2): Card titles, dialog titles, panel headings, table group labels.
- **Body** (Source Serif 4 400, `1rem/1.5`): Running text, descriptions, help text, route copy. Cap prose at 65-75ch.
- **Label** (IBM Plex Mono 500, `0.6875rem`, `0.08em`, uppercase): Badges, chips, metadata, table headers, small status labels, and compact facts.

### Named Rules

**The Three Voices Rule.** Barlow Condensed is structure, Source Serif 4 is content, IBM Plex Mono is data. Do not mix fonts inside one UI role to create emphasis.

**The Product Scale Rule.** Product UI uses fixed sizes and tight ratios. Do not use fluid viewport-scaled type inside authenticated workspaces, tables, toolbars, forms, or panels.

## 4. Elevation

TroopToTask is flat by default. Depth comes from surface shifts, borders, sticky positioning, and overlay layering, not from card shadows. In-flow cards, tables, fields, buttons, sidebars, and route panels stay flat. Shadows are reserved for surfaces that break the page plane.

### Shadow Vocabulary

- **Focus Ring** (`0 0 0 3px color-mix(in srgb, var(--ring) 24%, transparent)`): Keyboard and validation focus. Always paired with a visible outline or border shift.
- **Popover/Dropdown** (`0 4px 12px oklch(0% 0 0 / 0.08)`): Menus, popovers, command lists, and select panels where the component needs separation from the page plane.
- **Dialog/Sheet** (`0 8px 24px oklch(0% 0 0 / 0.12)`): Modal dialogs and sheets. Use only for true overlays.

### Named Rules

**The Flat Formation Rule.** If an element is in normal page flow, it has no shadow. A shadow on a card, table row, toolbar, or button is a bug unless the shared component catalog explicitly documents the exception.

**The Overlay Only Rule.** Floating layers may use shadow, but the interaction should still be clear from border, backdrop, placement, and focus.

## 5. Components

Shared UI primitives live in `src/lib/components/ui`. Production routes should import those primitives or app-specific shared wrappers, not rebuild local versions.

### Buttons

Clean, compact, shadcn-backed controls with direct operational weight.

- **Shape:** `rounded-lg` (6px) for default buttons; smaller button sizes use `min(var(--radius), 10px/12px)` where implemented.
- **Primary:** `bg-primary text-primary-foreground`, 32px tall by default, 10px horizontal padding. Use for the main page action only.
- **Outline:** `border-border bg-background`, with muted hover. Use for secondary actions.
- **Secondary:** `bg-secondary text-secondary-foreground`, with subtle opacity hover. Use for grouped view modes and lower-emphasis commands.
- **Ghost:** Transparent at rest, muted hover. Use for toolbar actions, icon actions, and low-emphasis controls.
- **Destructive:** Tinted destructive background with destructive text, not a solid red fill.
- **Hover / Focus:** Transitions use 120-240ms `cubic-bezier(0.2, 0, 0, 1)`. Focus uses the ring token and visible border state.
- **Sizes:** xs 24px, sm 28px, default 32px, lg 36px, icon 32px square, plus icon-xs/icon-sm/icon-lg.

### Badges and Chips

Badges communicate status; chips communicate compact metadata.

- **Badge Style:** 20px height, `rounded-md`, 1px transparent border, 8px horizontal padding, small medium text.
- **Badge Variants:** default, secondary, destructive, danger, warning, info, success, outline, ghost, link. Status variants use tinted backgrounds and functional color text.
- **Chip Style:** Full pill, IBM Plex Mono, uppercase, 4px by 12px padding, muted or amber-tinted background.
- **State:** Badges and chips are labels unless explicitly rendered as links. Do not make status labels behave like controls by accident.

### Cards / Containers

Cards frame repeated or grouped content without theatrical depth.

- **Corner Style:** `rounded-md` (4px) for cards, `rounded-lg` for shadcn controls and route-owned panels.
- **Background:** `bg-card text-card-foreground`.
- **Border:** 1px `border`.
- **Shadow Strategy:** No shadow for in-flow cards.
- **Internal Padding:** Use shared card subcomponents and route layout utilities, commonly 16-24px depending on density.

### Inputs / Fields

Inputs are compact and precise.

- **Style:** 32px height, `rounded-lg`, 1px `border-input`, transparent light background, `dark:bg-input/30`, 10px horizontal padding.
- **Focus:** Border shifts to ring, with `focus-visible:ring-3`.
- **Error:** Destructive border and destructive ring at reduced opacity.
- **Disabled:** 50% opacity, pointer-events disabled, muted background.
- **Field Composition:** Use `ui/field`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Combobox`, and `MultiSelect` instead of legacy route-local field wrappers.

### Navigation

Navigation is standard because users need muscle memory.

- **Authenticated Shell:** Permanent dark chrome using `--chrome` tokens, with muted text and amber current-state signal.
- **Breadcrumbs:** Shared breadcrumb primitives in the app header area. Do not duplicate app breadcrumbs inside route content.
- **Route Tabs:** Use `ui/page-shell` tabs or shadcn tabs for route-local Generate/History/Settings style navigation. Do not restore legacy `SubNav`.
- **Menus:** Use dropdown menu, command, popover, sheet, dialog, tooltip, and drawer primitives from shared UI.
- **Mobile:** Collapse structure through shared sidebar, sheet, drawer, toolbar overflow, and responsive route layout. Do not invent route-specific mobile chrome.

### Tables, Toolbars, and Operational Surfaces

Data-heavy work is first-class.

- **DataTable:** Production DataTable surfaces use `ui/data-table`; route code configures columns, filters, search, selection, actions, empty state, pagination, and row behavior.
- **WorkspaceToolbar:** Use `ui/workspace-toolbar` for route controls. It owns one-row toolbar structure, grouping, labels, overflow behavior, and visual treatment.
- **PageShell:** Use `ui/page-shell` for route roots, headers, tabs, fact grids, metrics, summary rails, and sticky action bars.
- **OperationalMatrix:** Training and Critical Tasks matrix surfaces converge on `ui/operational-matrix`, including vertical column headers where needed.
- **WorkflowPanel:** Onboarding, training type, and manager panels converge on shared workflow-panel and alert variants instead of route-local warning panels.
- **Charts:** Use shadcn chart primitives and shared chart conventions for reports.

## 6. Do's and Don'ts

### Do:

- **Do** keep `src/app.css`, `components.json`, and shared component files as the visual source of truth.
- **Do** use shadcn-svelte `nova` shared primitives from `src/lib/components/ui` for new production UI.
- **Do** route visual QA findings back to the component catalog and shared component layer.
- **Do** use warm OKLCH tokens for new colors and preserve the paper/ink/amber system.
- **Do** use shared Tailwind tokens for route-owned layout: `bg-background`, `bg-card`, `text-muted-foreground`, `border`, `rounded-lg`, and the normal spacing scale.
- **Do** preserve visible focus states, keyboard navigation, reduced-motion support, and WCAG AA contrast.
- **Do** prefer dense tables, toolbars, fact grids, and summary rails when they help leaders see the whole formation.

### Don't:

- **Don't** visually retune shared components inside production routes unless Robert explicitly approves that exact visual exception.
- **Don't** add route-local wrappers whose purpose is to change shared component spacing, radius, borders, shadows, typography, color, animation, density, or internal styling.
- **Don't** import legacy wrappers when shadcn/shared replacements exist, including old toolbar, EmptyState, FileUpload, SearchSelect, or spinner wrappers.
- **Don't** use consumer/startup SaaS aesthetics: pastel gradients, playful illustrations, bouncy animations, or "delightful" empty states.
- **Don't** use legacy military-software aesthetics: green-on-gray brutalism, tiny system fonts, or modal-first workflows.
- **Don't** use `#000`, `#fff`, achromatic gray, gradient text, decorative glassmorphism, or colored side-stripe borders.
- **Don't** create route-local alternate versions of buttons, inputs, badges, dialogs, menus, tables, tabs, toolbars, empty states, calendars, or charts.
- **Don't** solve a shared-component mismatch locally. Report the design-system gap and add a shared component/API extension before production routes consume it.
