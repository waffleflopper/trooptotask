---
version: alpha
name: TroopToTask Utilitarian Precision
description: Military field-document visual system for operational unit management software.
colors:
  primary: '#0e0e0d'
  primary-muted: '#4a4a47'
  primary-subtle: '#8e8e8a'
  border: '#d6d5d0'
  rule: '#f0efeb'
  neutral: '#f8f7f4'
  surface: '#fafaf8'
  white: '#ffffff'
  tertiary: '#c47f00'
  tertiary-container: '#fdf3dc'
  tertiary-dark: '#8a5800'
  tertiary-hover: '#e09200'
  on-tertiary: '#0e0e0d'
  success: '#345b22'
  success-container: '#e8f0e2'
  error: '#8a2d25'
  error-container: '#f7e7e4'
  info: '#2f5d75'
  info-container: '#e7eef3'
  dark-primary: '#f0efe9'
  dark-primary-muted: '#b0afa8'
  dark-primary-subtle: '#72716c'
  dark-border: '#3a3936'
  dark-rule: '#252421'
  dark-neutral: '#1a1917'
  dark-surface: '#211f1d'
  dark-tertiary: '#e5a000'
  dark-tertiary-container: '#2e2206'
  dark-tertiary-dark: '#f5c84a'
  dark-tertiary-hover: '#f0b020'
typography:
  display-xl:
    fontFamily: Barlow Condensed
    fontSize: 72px
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: 0em
  display-lg:
    fontFamily: Barlow Condensed
    fontSize: 52px
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: 0em
  headline-lg:
    fontFamily: Barlow Condensed
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: 0em
  headline-md:
    fontFamily: Barlow Condensed
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0em
  headline-sm:
    fontFamily: Barlow Condensed
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: 0.02em
  body-lg:
    fontFamily: Source Serif 4
    fontSize: 19px
    fontWeight: 300
    lineHeight: 1.65
    letterSpacing: 0em
    fontVariation: "'opsz' 18"
  body-md:
    fontFamily: Source Serif 4
    fontSize: 16px
    fontWeight: 300
    lineHeight: 1.65
    letterSpacing: 0em
    fontVariation: "'opsz' 16"
  body-sm:
    fontFamily: Source Serif 4
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0em
    fontVariation: "'opsz' 14"
  label-md:
    fontFamily: IBM Plex Mono
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.12em
  label-sm:
    fontFamily: IBM Plex Mono
    fontSize: 10px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.12em
  data-md:
    fontFamily: IBM Plex Mono
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: 0.02em
rounded:
  none: 0px
  sm: 2px
  md: 4px
  lg: 6px
  full: 9999px
spacing:
  micro: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  '2xl': 48px
  '3xl': 64px
  '4xl': 96px
  '5xl': 128px
  container: 1200px
  container-wide: 1400px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.surface}'
    typography: '{typography.headline-sm}'
    rounded: '{rounded.md}'
    padding: 12px
  button-primary-hover:
    backgroundColor: '{colors.primary-muted}'
    textColor: '{colors.surface}'
  button-accent:
    backgroundColor: '{colors.tertiary}'
    textColor: '{colors.on-tertiary}'
    typography: '{typography.headline-sm}'
    rounded: '{rounded.md}'
    padding: 12px
  button-accent-hover:
    backgroundColor: '{colors.tertiary-hover}'
    textColor: '{colors.on-tertiary}'
  button-outline:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.primary}'
    typography: '{typography.headline-sm}'
    rounded: '{rounded.md}'
    padding: 12px
  page:
    backgroundColor: '{colors.neutral}'
    textColor: '{colors.primary}'
  subtle-surface:
    backgroundColor: '{colors.rule}'
    textColor: '{colors.primary-muted}'
  white-surface:
    backgroundColor: '{colors.white}'
    textColor: '{colors.primary}'
  divider:
    backgroundColor: '{colors.border}'
  tertiary-rule:
    backgroundColor: '{colors.primary-subtle}'
  panel:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.primary}'
    rounded: '{rounded.lg}'
    padding: 32px
  status-present:
    backgroundColor: '{colors.success-container}'
    textColor: '{colors.success}'
    typography: '{typography.label-md}'
    rounded: '{rounded.sm}'
    padding: 4px
  status-warning:
    backgroundColor: '{colors.tertiary-container}'
    textColor: '{colors.tertiary-dark}'
    typography: '{typography.label-md}'
    rounded: '{rounded.sm}'
    padding: 4px
  status-danger:
    backgroundColor: '{colors.error-container}'
    textColor: '{colors.error}'
    typography: '{typography.label-md}'
    rounded: '{rounded.sm}'
    padding: 4px
  status-info:
    backgroundColor: '{colors.info-container}'
    textColor: '{colors.info}'
    typography: '{typography.label-md}'
    rounded: '{rounded.sm}'
    padding: 4px
  table-header:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.primary-muted}'
    typography: '{typography.label-sm}'
    padding: 8px
  table-cell:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.primary-muted}'
    typography: '{typography.data-md}'
    padding: 12px
  dark-page:
    backgroundColor: '{colors.dark-neutral}'
    textColor: '{colors.dark-primary}'
  dark-panel:
    backgroundColor: '{colors.dark-surface}'
    textColor: '{colors.dark-primary}'
  dark-subtle-surface:
    backgroundColor: '{colors.dark-rule}'
    textColor: '{colors.dark-primary-muted}'
  dark-divider:
    backgroundColor: '{colors.dark-border}'
  dark-tertiary-rule:
    backgroundColor: '{colors.dark-primary-subtle}'
  dark-muted-label:
    backgroundColor: '{colors.dark-surface}'
    textColor: '{colors.dark-primary-muted}'
    typography: '{typography.label-sm}'
  dark-accent:
    backgroundColor: '{colors.dark-tertiary}'
    textColor: '{colors.dark-neutral}'
    typography: '{typography.headline-sm}'
    rounded: '{rounded.md}'
    padding: 12px
  dark-accent-hover:
    backgroundColor: '{colors.dark-tertiary-hover}'
    textColor: '{colors.dark-neutral}'
  dark-accent-surface:
    backgroundColor: '{colors.dark-tertiary-container}'
    textColor: '{colors.dark-tertiary-dark}'
    typography: '{typography.label-md}'
    rounded: '{rounded.sm}'
    padding: 4px
---

# DESIGN.md

## Overview

TroopToTask uses a Utilitarian Precision design language: military field documents, printed orders, technical manuals, accountability forms, and operational paperwork translated into a modern SvelteKit application. The product serves military unit leaders and administrative staff who need fast, reliable answers about personnel, availability, training, assignments, onboarding, and organizational continuity.

The interface should feel disciplined, direct, and trustworthy under pressure. It should help leaders answer who is here, who is unavailable, what is due, where the gaps are, and what action is required before the next formation, brief, or transition.

The emotional target is confidence. Users should feel supported by authority-grade information and should trust TroopToTask as a source of truth during real unit work. Avoid consumer-product whimsy, over-marketed SaaS polish, and visual language that looks trendy instead of operational.

## Colors

The palette is paper, ink, hairline rules, and one operational amber signal. Neutral surfaces carry the work; amber is reserved for active states, primary confirmation actions, and meaningful operational emphasis.

- **Primary ink (`#0e0e0d`):** Primary text, strong headings, and high-contrast controls.
- **Muted ink (`#4a4a47`, `#8e8e8a`):** Secondary text, metadata, and dimmed labels that must remain readable.
- **Rules and paper (`#d6d5d0`, `#f0efeb`, `#f8f7f4`, `#fafaf8`):** Borders, row separators, subtle surfaces, and the page foundation.
- **Operational amber (`#c47f00`):** The single accent. It signals action or active state; it does not decorate.
- **Semantic colors:** Success/present uses field green, danger/unavailable uses muted red, and info/TDY uses restrained blue. Keep them informational and low-chroma.

Dark mode remaps the same roles rather than changing the product's character. Preserve the field-document feel in both themes: dark mode is subdued paper-and-ink reversal, not a glowing command center.

## Typography

Typography carries most of the brand. Use the established type trio:

- **Barlow Condensed:** Commanding display typography for headings, section titles, buttons, and strong name cells. Use uppercase deliberately and keep letter spacing at `0` for large display text.
- **Source Serif 4:** Body and prose typography. It gives long-form guidance, descriptions, and empty states an authoritative but readable voice.
- **IBM Plex Mono:** Labels, metadata, table headers, status markers, timestamps, and operational detail.

Large headings should feel like a printed order header: condensed, strong, and structured. Body copy should be calm and legible, usually at `16px` with generous leading. Mono labels should be uppercase with `0.10em` to `0.14em` letter spacing, and should stay small enough to behave like instrumentation rather than decoration.

## Layout

Structure is communication. Use grids, dividers, alignment, dense tables, grouped forms, and predictable navigation to help users scan under time pressure.

Use a 4px-based spacing scale with meaningful jumps: `4`, `8`, `12`, `16`, `24`, `32`, `48`, `64`, `96`, and `128px`. Prefer `gap` for sibling rhythm. Use tighter spacing inside a control group and larger spacing between operational sections.

Primary app layouts should stay work-focused:

- Constrain normal content to `1200px`; use `1400px` only for dense roster, table, or reporting views.
- Separate page sections with hairline dividers, not oversized whitespace.
- Use card-like panels only when they frame a real tool, record, modal, or repeated item.
- Keep dashboards dense but ordered. Favor tables, segmented views, summary strips, and scannable rows over marketing-style card spreads.

## Elevation & Depth

TroopToTask is mostly flat. Hierarchy comes from typography, alignment, borders, surface contrast, and information density.

Use shadows only for actual z-axis elevation such as modals, floating menus, and rare preview panels. Do not use drop shadows as a default card style. Border and surface contrast should do the ordinary structural work.

Motion should feel decisive and functional. Page-level reveal animation may use a short fade-up sequence. Interactions should settle quickly, around `120ms` to `180ms`, and should not use decorative hover lifts on cards.

## Shapes

The shape language is restrained and engineered. Corners are small because the product should feel precise, not soft.

- Use `2px` for badges and compact status markers.
- Use `4px` for buttons, inputs, and tags.
- Use `6px` for panels, cards, preview blocks, and modals.
- Avoid pill shapes except where the rounded form semantically communicates a badge or status label.
- Never use large-radius rounded cards as the default container aesthetic.

## Components

Buttons have exactly three core variants:

- **Primary:** Dark ink fill for strong secondary commands, cancel/close actions, and high-contrast structural controls.
- **Accent:** Amber fill for the primary action or confirmation on a screen. Use at most one dominant amber action per major workflow surface.
- **Outline:** Neutral tertiary action, secondary navigation, and low-emphasis tools.

Status markers should use the mono label pattern, compact padding, a small radius, and semantic background tints. Present/current is success green, warning/action is amber, unavailable/overdue is danger red, TDY/informational is muted blue, and neutral/school/profile states use the neutral ink scale.

Data tables are core product surfaces. Headers use uppercase mono labels, cells use compact mono data text, name cells may use Barlow Condensed for scanability, and rows use subtle separators. Do not use alternating row backgrounds unless a specific density or accessibility problem requires it.

Forms should feel like operational paperwork: aligned labels, clear grouping, restrained inputs, visible focus treatment, and direct error copy. Preserve browser focus behavior at minimum; the preferred custom focus is a 2px amber outline with a 2px offset.

## Do's and Don'ts

- Do use grids, rules, labels, and alignment to communicate hierarchy.
- Do make amber rare and meaningful.
- Do preserve WCAG AA contrast for text, status markers, and focus states.
- Do use icons for recognizable tool actions, but keep them subordinate to the operational task.
- Do keep product surfaces dense enough for real leader workflows.
- Don't use gradients, gradient text, glassmorphism, neon glow, or decorative blur.
- Don't default to generic SaaS cards, hero metrics, or marketing-page compositions inside the app.
- Don't use purple, teal, cyan, or blue-purple gradients as brand color.
- Don't use side-stripe card accents with thick `border-left` or `border-right` treatments.
- Don't deepen deprecated demo or sandbox-specific visual patterns.
