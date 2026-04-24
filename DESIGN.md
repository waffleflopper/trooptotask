---
name: 'TroopToTask'
description: 'Operational unit-management UI with field-document discipline and task-first density.'
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

TroopToTask should feel like a field ledger translated into a modern product surface: disciplined, legible, and built for repeated operational use. The interface earns trust through alignment, rules, restrained contrast, clear labels, and fast recognition. It should feel closer to accountable paperwork and technical manuals than a generic SaaS dashboard.

This is a product register system. Design serves the work. Authenticated surfaces should prioritize dense but ordered information, predictable controls, fast filtering, and brief-ready comprehension. Marketing gestures, ornamental hero treatments, gratuitous motion, and decorative panels are out of place inside the app.

The visual system rejects generic SaaS marketing, shiny startup dashboards, soft productivity-app tropes, "AI slop," fake command-center theatrics, decorative gradients, glassmorphism, excessive roundness, heavy glow, purple-gradient AI aesthetics, novelty motion, card soup, stock military cliches, and trend-chasing visuals.

**Key Characteristics:**

- Paper-and-ink surfaces with a dark operational rail.
- Operational amber used as signal, not decoration.
- Condensed display type for command hierarchy, serif body copy for readable content, mono labels for metadata.
- Hairline dividers, tight radii, minimal shadows, and strong alignment.
- Dense controls that stay predictable under pressure.

## 2. Colors

The palette is restrained: warm paper, disciplined ink, one operational amber accent, and muted semantic colors for status.

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

## 4. Elevation

TroopToTask is flat by default and layered by structure. Depth comes primarily from borders, tonal contrast, sticky bars, rail chrome, and table grids. Shadows exist, but they are quiet and stateful: small for raised controls, medium on hover, large for modals and overlays.

### Shadow Vocabulary

- **Low Operational Lift** (`0 1px 3px rgba(14, 14, 13, 0.08)`): Primary buttons and subtle raised surfaces.
- **State Lift** (`0 2px 8px rgba(14, 14, 13, 0.1), 0 1px 2px rgba(14, 14, 13, 0.06)`): Hovered controls and active cards.
- **Modal Lift** (`0 4px 20px rgba(14, 14, 13, 0.12), 0 2px 6px rgba(14, 14, 13, 0.07)`): Dialogs and topmost overlays.

### Named Rules

**The Flat-At-Rest Rule.** Tables, panels, and page regions should be flat until a state change or modal layer earns elevation.

**The Border Before Shadow Rule.** Reach for a 1px rule, tonal background, or alignment before adding shadow.

## 5. Components

### Buttons

Buttons are compact command controls with condensed uppercase text, tight radii, and quick state feedback.

- **Shape:** Structured corners (4px radius), 40px default minimum height, 34px compact height, and 48px large height.
- **Primary:** Dark chrome fill with chrome text for decisive actions.
- **Amber:** Operational amber fill with dark ink text for selected or high-signal actions, not routine decoration.
- **Secondary:** Transparent fill, hairline border, secondary ink text, and subtle surface hover.
- **Hover / Focus:** Hover lifts by 1px and deepens shadow. Focus uses the amber outline and focus ring.

### Chips

Chips are mono, uppercase, compact, and status-oriented.

- **Style:** Pill shape, 4px by 12px padding, mono label, and semantic background wash.
- **State:** Use filled semantic chips for real state or classification. Use outlined or neutral chips for low-emphasis metadata.

### Cards / Containers

Containers should feel like bounded work surfaces, not decorative cards.

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

The authenticated shell uses a dark left rail on desktop and a bottom tab bar on mobile. Navigation labels are mono, icon-led, compact, and active states use operational amber. Breadcrumbs in the top bar should read as structural location, not page marketing.

### Tables And Calendars

Data-heavy surfaces should use fixed dimensions, hairline grid rules, sticky headers where useful, and small mono metadata. Status color should be backed by text, abbreviation, or label. Calendar and roster surfaces are work canvases, not framed cards inside cards.

## 6. Do's and Don'ts

### Do:

- **Do** use warm paper surfaces, dark ink, hairline rules, and tight radii as the default visual grammar.
- **Do** keep operational amber rare and meaningful: focus, active nav, selected state, current day, and action emphasis.
- **Do** use mono labels for metadata, filters, breadcrumbs, table headers, badges, and operational markers.
- **Do** make dense product controls predictable, keyboard-accessible, and visually stable across breakpoints.
- **Do** use grids, dividers, alignment, and grouping to communicate operational order.
- **Do** preserve WCAG AA contrast and never depend on color alone for status.

### Don't:

- **Don't** create generic SaaS marketing surfaces inside authenticated workflows.
- **Don't** use shiny startup dashboards, soft productivity-app tropes, "AI slop," or fake command-center theatrics.
- **Don't** use decorative gradients, glassmorphism, excessive roundness, heavy glow, or purple-gradient AI aesthetics.
- **Don't** make card soup. Use cards only for bounded items, repeated records, modals, or genuinely framed tools.
- **Don't** use side-stripe borders greater than 1px as colored accents on cards, list items, callouts, or alerts.
- **Don't** use gradient text.
- **Don't** use amber as a general decoration color.
- **Don't** animate layout or add novelty motion that does not communicate state.
