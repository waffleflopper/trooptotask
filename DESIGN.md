---
name: TroopToTask
description: Military unit management SaaS for personnel readiness and operations
colors:
  command-charcoal: "oklch(14.7% 0.004 49.25)"
  formation-ivory: "oklch(98.5% 0.001 106.423)"
  ops-amber: "oklch(66.6% 0.179 58.318)"
  ops-amber-dark: "oklch(76.9% 0.188 70.08)"
  muster-ash: "oklch(97% 0.001 106.424)"
  standing-stone: "oklch(44.4% 0.011 73.639)"
  parade-line: "oklch(92.3% 0.003 48.717)"
  alert-red: "oklch(57.7% 0.245 27.325)"
  readiness-green: "oklch(62.7% 0.194 149.214)"
  intel-blue: "oklch(58.8% 0.158 241.966)"
  bunker-black: "#12110f"
  bunker-text: "#f0efe9"
  bunker-muted: "#b0afa8"
  bunker-border: "#2a2825"
typography:
  display:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontWeight: 700
    lineHeight: 1.1
  body:
    fontFamily: "'Source Serif 4', serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'IBM Plex Mono', monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.08em"
rounded:
  sm: "2px"
  md: "4px"
  lg: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.command-charcoal}"
    textColor: "{colors.formation-ivory}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
  button-outline:
    backgroundColor: "{colors.formation-ivory}"
    textColor: "{colors.command-charcoal}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.command-charcoal}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
  button-destructive:
    backgroundColor: "oklch(57.7% 0.245 27.325 / 0.1)"
    textColor: "{colors.alert-red}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.command-charcoal}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
  card-default:
    backgroundColor: "{colors.formation-ivory}"
    textColor: "{colors.command-charcoal}"
    rounded: "{rounded.md}"
  chip-default:
    backgroundColor: "{colors.muster-ash}"
    textColor: "{colors.standing-stone}"
    rounded: "9999px"
    padding: "4px 12px"
  chip-primary:
    backgroundColor: "oklch(66.6% 0.179 58.318 / 0.12)"
    textColor: "{colors.ops-amber}"
    rounded: "9999px"
    padding: "4px 12px"
---

# Design System: TroopToTask

## 1. Overview

**Creative North Star: "The Operations Center"**

TroopToTask looks like the best briefing room you've ever walked into: clean sight lines, information-dense displays, everything exactly where you expect it. No decoration for its own sake. Every pixel either communicates status or enables action.

The system is restrained by conviction, not by timidity. Color is deployed with purpose: warm amber marks what needs attention, red marks what's wrong, and the rest stays out of the way. Typography pairs a condensed military-grade heading face with a legible serif body, reinforced by monospace for data and labels. The effect is authoritative without being cold, dense without being cluttered.

This is not consumer software dressed up in olive drab. It does not borrow startup aesthetics (pastel gradients, playful illustrations, bouncy micro-interactions) or repeat the mistakes of legacy military systems (green-on-gray brutalism, 12px system fonts, modal-driven workflows). It occupies its own lane: modern professional tooling built for people who manage formations, not features.

**Key Characteristics:**
- Restrained color palette with a single warm accent
- Tight radii and flat surfaces; depth comes from borders and background tints, not shadows
- Condensed headings for density; serif body for sustained reading; mono for data
- Transitions are fast and purposeful (120-240ms, exponential ease-out)
- Information density is a feature, not a problem to solve

## 2. Colors: The Formation Palette

A restrained palette: tinted neutrals carry the interface, with a single warm accent deployed sparingly to draw the eye to active states, warnings, and interactive elements.

### Primary

- **Command Charcoal** (`oklch(14.7% 0.004 49.25)`): Primary text, button fills, and foreground elements. Not true black; warm-tinted toward the amber hue family (chroma 0.004 at hue 49). Used for all body text and primary interactive surfaces.

### Tertiary

- **Ops Amber** (`oklch(66.6% 0.179 58.318)`, dark mode: `oklch(76.9% 0.188 70.08)`): The single accent color. Focus rings, active sidebar items, links, warning indicators, chart-1, and the ring token. High chroma at a warm hue (58). Brightens in dark mode to maintain contrast against dark surfaces.

### Neutral

- **Formation Ivory** (`oklch(98.5% 0.001 106.423)`): Page background, card surfaces, popover backgrounds. Warm-tinted off-white, not pure white.
- **Muster Ash** (`oklch(97% 0.001 106.424)`): Secondary backgrounds, muted surfaces, hover states. A half-step darker than Formation Ivory.
- **Parade Line** (`oklch(92.3% 0.003 48.717)`): Borders, input outlines, dividers, sidebar borders. Warm gray at low chroma.
- **Standing Stone** (`oklch(44.4% 0.011 73.639)`): Muted foreground text, secondary labels, placeholder text. Mid-tone with a slight warm cast.

### Status Colors

- **Alert Red** (`oklch(57.7% 0.245 27.325)`): Destructive actions, error states, expired training, overdue items. Always used at 10-20% opacity for backgrounds, full saturation for text.
- **Readiness Green** (`oklch(62.7% 0.194 149.214)`): Success states, current training, active status. Chart-2.
- **Intel Blue** (`oklch(58.8% 0.158 241.966)`): Informational states, info badges. Chart-3.

### Chrome (App Shell)

Fixed across light and dark modes. The sidebar and top navigation use a permanent dark shell:

- **Bunker Black** (`#12110f`): Chrome background.
- **Bunker Text** (`#f0efe9`): Chrome foreground text.
- **Bunker Muted** (`#b0afa8`): Chrome secondary text.
- **Bunker Border** (`#2a2825`): Chrome dividers.

### Named Rules

**The One Accent Rule.** Ops Amber is the only saturated color in the interface outside of status indicators. Its rarity is the point. If more than 10% of a screen surface is amber, reduce usage until it reads as signal, not decoration.

**The Tinted Neutral Rule.** Every neutral in the palette carries a warm hue tint (chroma 0.001-0.011, hue 48-106). Never use pure gray (`oklch(X% 0 0)`), `#000`, or `#fff`. The warmth is subtle but essential to the system's cohesion.

## 3. Typography

**Display Font:** Barlow Condensed (with sans-serif fallback)
**Body Font:** Source Serif 4 (with serif fallback)
**Label/Mono Font:** IBM Plex Mono (with monospace fallback)

**Character:** Military brevity meets editorial legibility. Barlow Condensed packs dense information into headers without shouting; Source Serif 4 provides the sustained readability that NCOs need when scanning rosters and training records. IBM Plex Mono anchors data displays and chip labels with technical precision.

### Hierarchy

- **Display** (Barlow Condensed 800, clamp-scaled, line-height 1.1): Page titles on public/marketing pages. Reserved for high-impact, single-line use.
- **Headline** (Barlow Condensed 700, line-height 1.1): Section headers within authenticated views. The workhorse heading weight.
- **Title** (Barlow Condensed 600, line-height 1.2): Sub-section headers, card titles, dialog headers.
- **Body** (Source Serif 4 400, 1rem/1.5, max-width 65-75ch): Running text, descriptions, form help text. Use 300 weight for lighter secondary body text; 600 for inline emphasis.
- **Label** (IBM Plex Mono 500, 0.6875rem, letter-spacing 0.08em, uppercase): Chips, tags, status badges, table column headers, metadata. The system's data voice.

### Named Rules

**The Three Voices Rule.** Every text element uses exactly one of the three font families. Barlow Condensed for structure. Source Serif 4 for content. IBM Plex Mono for data. Mixing within a single element is forbidden.

## 4. Elevation

Flat by default. Surfaces are distinguished through background tint shifts (Formation Ivory to Muster Ash) and thin borders (Parade Line at 1px), not through shadows. This keeps the interface dense and scannable without visual noise.

### Shadow Vocabulary

Shadows are reserved for elements that float above the page plane:

- **Popover/Dropdown** (`box-shadow: 0 4px 12px oklch(0% 0 0 / 0.08)`): Menus, popovers, command palette. Light enough to read as "floating" without drama.
- **Dialog** (`box-shadow: 0 8px 24px oklch(0% 0 0 / 0.12)`): Modal dialogs and sheets. Slightly heavier to establish the overlay relationship.

No other elements use shadows. Cards, buttons, inputs, navigation items: all flat.

### Named Rules

**The Flat Formation Rule.** If an element is in the page flow, it is flat. Shadows are exclusively for elements that break the page plane (popovers, dialogs, dropdowns). A card with a shadow is a bug.

## 5. Components

### Buttons

Clean and restrained. Tight dimensions with a 1px translate-down on active press for tactile feedback.

- **Shape:** Gently curved edges (6px radius, `rounded-lg` via `--radius` scale). 1px transparent border for consistent sizing across variants.
- **Primary:** Command Charcoal fill, Formation Ivory text, height 32px (`h-8`), horizontal padding 10px. The default workhorse.
- **Outline:** Formation Ivory fill, 1px Parade Line border, darkens on hover. Used for secondary actions.
- **Ghost:** Transparent, Muster Ash background on hover. Used for toolbar actions and icon buttons.
- **Destructive:** Alert Red at 10% opacity background, Alert Red text. Never a solid red fill; the tinted-background treatment keeps destructive actions visible but not alarming until confirmed.
- **Hover / Focus:** Background shifts by opacity. Focus ring is 3px Ops Amber at 24% opacity (`--focus-ring`), with 2px solid Ops Amber outline offset 2px.
- **Sizes:** xs (24px), sm (28px), default (32px), lg (36px), icon (32px square).

### Chips

The data voice of the interface. Always monospace, always uppercase.

- **Style:** Full-radius pill (9999px), IBM Plex Mono at 0.6875rem, 500 weight, 0.08em letter-spacing, uppercase. Padding 4px 12px.
- **Default:** Muster Ash background, Standing Stone text.
- **Primary:** Ops Amber at 12% opacity background, Ops Amber text.
- **Warning:** Warning-muted background (amber at 16% mixed into card surface), amber text.
- **State:** Single state only (no hover/toggle on chips). They are labels, not controls.

### Cards / Containers

- **Corner Style:** Moderate curve (4px radius, `--radius-md`).
- **Background:** Formation Ivory (matches page background in light mode), Card token in dark mode.
- **Border:** 1px Parade Line. No shadow.
- **Internal Padding:** Defined by card-header (24px horizontal, 24px top) and card-content (24px horizontal, no top padding). Footer mirrors header.

### Inputs / Fields

- **Style:** Transparent background (dark mode: `input/30` tinted), 1px Parade Line border, 6px radius, height 32px, horizontal padding 10px.
- **Focus:** Border shifts to Ops Amber (`--ring`), 3px ring at 50% opacity. Clean, visible, consistent with button focus.
- **Error:** Border shifts to Alert Red, 3px ring at 20% opacity. Ring intensifies to 40% in dark mode for visibility.
- **Disabled:** 50% opacity, `pointer-events: none`, slightly tinted background.

### Navigation

- **Sidebar:** Permanent dark chrome shell (Bunker Black background). Active items highlighted with Ops Amber text. Hover uses Muster Ash-equivalent dark tint.
- **Breadcrumbs:** Horizontal trail below the page header. Source Serif 4 at body size. Slash separators.
- **Command Palette:** Full-width dialog with search input. Keyboard-first navigation.
- **Mobile:** Collapsed sidebar via drawer, bottom tab bar for primary navigation.

### Page Shell

The authenticated page layout compound. Not a single component but a repeating structure:

- Header band with title (Barlow Condensed 700), optional subtitle, action buttons right-aligned.
- Optional tab bar below header for view switching.
- Optional fact grid / summary rail for dashboard-style metrics.
- Sticky bottom action bar for save/discard on form pages.

## 6. Do's and Don'ts

### Do:

- **Do** use OKLCH for all color definitions. Every neutral carries a warm hue tint (chroma 0.001-0.011). Verify with the Tinted Neutral Rule before adding any new color.
- **Do** use the three-font system consistently: Barlow Condensed for structure, Source Serif 4 for content, IBM Plex Mono for data. No exceptions.
- **Do** keep all transitions between 120-240ms using `cubic-bezier(0.2, 0, 0, 1)`. The three speed tokens (`--transition-fast`, `--transition-normal`, `--transition-slow`) cover every case.
- **Do** respect `prefers-reduced-motion` with the existing media query that collapses all animation durations to near-zero.
- **Do** use tinted-background treatments for status colors (Alert Red at 10-20%, Readiness Green at 14%, Intel Blue at 14%). Solid saturated fills are reserved for chart elements only.
- **Do** cap body text line length at 65-75ch.

### Don't:

- **Don't** use pastel gradients, playful illustrations, or bouncy animations. This is not consumer SaaS. If it could belong on a Notion or Linear marketing page, it does not belong here.
- **Don't** use green-on-gray color schemes, 12px system fonts, or modal-first workflows. This is not legacy military software (DTMS, DTS, or any .mil system from 2004).
- **Don't** add shadows to in-flow elements. Cards, buttons, inputs, table rows: all flat. If you're reaching for `box-shadow` on something that isn't a popover or dialog, stop.
- **Don't** use `#000`, `#fff`, or any achromatic neutral. Every value must carry the warm tint.
- **Don't** introduce a second accent color. The One Accent Rule: Ops Amber only. Status colors (red, green, blue) serve functional roles, not decorative ones.
- **Don't** use border-left or border-right greater than 1px as a colored accent stripe on any element.
- **Don't** use gradient text (`background-clip: text` with a gradient background).
- **Don't** use glassmorphism (blur + transparency as decoration).
- **Don't** build hero-metric templates (big number, small label, gradient accent). Dense fact grids are fine; SaaS dashboard cliches are not.
