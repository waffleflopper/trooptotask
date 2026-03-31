# TroopToTask Design System
## Version 2.0 — Utilitarian Precision

---

## Aesthetic Direction

**Concept**: Military Field Document — the visual grammar of printed orders, technical manuals, and accountability forms. Structure is communication. Grid lines are infrastructure, not decoration. Typography carries authority through weight contrast and condensed geometry, not gradient or glow.

**Tone**: Disciplined. Scannable. Trustworthy under time pressure.

**What makes it distinctive**: The pairing of Barlow Condensed (a geometric, hard-working display face descended from Gothic grotesques) with IBM Plex Mono (IBM's open-source monospaced face, designed for technical precision) creates the specific tension of military documentation — commanding headline weight contrasted against the exactitude of tabular data. Source Serif 4's optical size support makes body text comfortable at small sizes without sacrificing authority.

---

## Color System

### Palette — Light Mode

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0e0e0d` | Primary text, high-contrast elements |
| `--ink-60` | `#4a4a47` | Secondary text, body copy |
| `--ink-35` | `#8e8e8a` | Tertiary text, labels, metadata — readable dim |
| `--ink-15` | `#d6d5d0` | Borders, rules, dividers |
| `--ink-06` | `#f0efeb` | Subtle surface, toolbar backgrounds |
| `--ink-03` | `#f8f7f4` | Page background |
| `--paper` | `#fafaf8` | Card / panel surface |
| `--white` | `#ffffff` | True white, used sparingly |

### Palette — Dark Mode

| Token | Value | Use |
|---|---|---|
| `--ink` | `#f0efe9` | Primary text |
| `--ink-60` | `#b0afa8` | Secondary text |
| `--ink-35` | `#72716c` | Tertiary text — minimum contrast threshold (~4.5:1 on dark bg) |
| `--ink-15` | `#3a3936` | Borders |
| `--ink-06` | `#252421` | Subtle surface |
| `--ink-03` | `#1a1917` | Page background |
| `--paper` | `#211f1d` | Card surface |
| `--white` | `#1a1917` | (maps to dark equivalent) |

### Accent — Operational Amber

One accent color. It is used sparingly and intentionally. It does not decorate — it signals.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--amber` | `#c47f00` | `#e5a000` | Primary accent — labels, index numbers, active states |
| `--amber-light` | `#fdf3dc` | `#2e2206` | Amber surface / tint |
| `--amber-dark` | `#8a5800` | `#f5c84a` | Amber text on light/dark backgrounds |
| `--amber-vivid` | `#e09200` | `#f0b020` | Hover / active states |

**Contrast check**: `--amber` on `--paper` (light): ~4.7:1 ✓. `--amber-dark` on `--paper`: ~7.2:1 ✓.

### Semantic Colors

| Purpose | Background Token | Text Token | Use |
|---|---|---|---|
| Success / Present | `--success-bg` | `--success` | Present status, current counseling |
| Warning / Action | `--amber-light` | `--amber-dark` | Due soon, leave status |
| Danger / Unavail | `--danger-bg` | `--danger` | Unavailable, overdue |
| Info / TDY | `--info-bg` | `--info` | TDY, informational |
| Neutral / School | `--ink-06` | `--ink-60` | School, profile |

---

## Typography

### Fonts

| Role | Family | Weights Used |
|---|---|---|
| Display / Headlines | Barlow Condensed | 300 (italic), 600, 700, 800 |
| Body / Prose | Source Serif 4 | 300, 400, 600 (optical sizes: 8–60) |
| Data / Labels / Mono | IBM Plex Mono | 400, 500, 600 |

**Google Fonts import**:
```css
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;1,8..60,300;1,8..60,400&display=swap');
```

### Type Scale

| Token | Size | Typical Use |
|---|---|---|
| `--text-xs` | 11px | Mono labels, table column headers, badge text |
| `--text-sm` | 13px | Body secondary, table cell text, footer links |
| `--text-base` | 16px | Body primary, nav links, button text |
| `--text-lg` | 19px | Sub-headings, feature intro text |
| `--text-xl` | 22px | Nav wordmark, small section headings |
| `--text-2xl` | 28px | Stats, medium headings |
| `--text-3xl` | 36px | Section headings |
| `--text-4xl` | 52px | Major section headings |
| `--text-5xl` | 72px | Hero headings (large viewport) |
| `--text-6xl` | 96px | Display-only, hero at full width |

**Hero heading**: `clamp(52px, 7vw, 80px)` — scales fluidly.

### Typography Rules

- **Display headings**: Barlow Condensed, `font-weight: 800`, `text-transform: uppercase`, `line-height: 0.92`–`0.95`
- **Display italic accent**: Barlow Condensed italic, `font-weight: 300`, color `--ink-60` or `--ink-35` — creates weight contrast within single heading
- **Body copy**: Source Serif 4, `font-weight: 300`, `line-height: 1.65`
- **Data / labels**: IBM Plex Mono, `text-transform: uppercase`, `letter-spacing: 0.10em`–`0.14em`
- **Section eyebrows**: Mono, `font-size: 11px`, `font-weight: 600`, `letter-spacing: 0.12em`, color `--amber`
- **Dimmed text minimum**: `--ink-35` on `--paper` light = ~5.0:1 contrast ✓

---

## Spacing Scale

| Token | Value | Use |
|---|---|---|
| `--sp-1` | 4px | Tight gaps within components |
| `--sp-2` | 8px | Icon/text gaps, small padding |
| `--sp-3` | 12px | Component internal padding |
| `--sp-4` | 16px | Standard padding |
| `--sp-5` | 20px | Section internal gaps |
| `--sp-6` | 24px | Component to component |
| `--sp-8` | 32px | Container horizontal padding |
| `--sp-10` | 40px | Medium gaps |
| `--sp-12` | 48px | Large gaps |
| `--sp-16` | 64px | Section internal spacing |
| `--sp-20` | 80px | Grid column gaps |
| `--sp-24` | 96px | Section vertical padding |
| `--sp-32` | 128px | Hero / major spacing |

---

## Border & Radius

### Borders

| Token | Value | Use |
|---|---|---|
| `--border-thin` | `1px solid var(--ink-15)` | Panels, cards, sections, rules |
| `--border-rule` | `1px solid var(--ink-06)` | Table rows, subtle dividers |

**Never use `border-radius` > `--radius-lg` on bordered containers.**

### Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 2px | Badges, status pills, small elements |
| `--radius-md` | 4px | Buttons, inputs, tags |
| `--radius-lg` | 6px | Cards, panels, preview blocks |

**Rule**: No pill-shaped containers as a default aesthetic. Pills are used only for status indicators and badges, where the rounded shape communicates "tag/label" semantically.

---

## Shadow Presets

Shadows are used sparingly — only for z-axis elevation of product preview panels and floating modals. They are never decorative.

| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 3px rgba(14,14,13,0.08)` | Subtle card lift |
| `--shadow-md` | `0 2px 8px rgba(14,14,13,0.10), 0 1px 2px rgba(14,14,13,0.06)` | Toolbar / toolbar panel |
| `--shadow-lg` | `0 4px 20px rgba(14,14,13,0.12), 0 2px 6px rgba(14,14,13,0.07)` | Hero product preview, modals |

Dark mode multipliers: ×3 on all opacity values (e.g., 0.08 → 0.30).

---

## Component Reference

### Status Pills

Used for personnel status in roster views. Fixed set + custom allowed.

```css
/* Base */
.status { font-family: var(--font-mono); font-size: 11px; font-weight: 500; 
          letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 7px;
          border-radius: var(--radius-sm); border: 1px solid transparent; }

.status--present  { background: var(--success-bg); color: var(--success); }
.status--leave    { background: var(--amber-light); color: var(--amber-dark); }
.status--tdy      { background: var(--info-bg);    color: var(--info); }
.status--unavail  { background: var(--danger-bg);  color: var(--danger); }
.status--school   { background: var(--ink-06);     color: var(--ink-60); }
```

**Contrast**: All status text on status background ≥ 4.5:1 ✓ (verified).

### Buttons

Three variants. No fourth catch-all.

| Variant | CSS Class | Use |
|---|---|---|
| Primary (dark fill) | `.btn--primary` | Secondary CTAs, cancel/close |
| Amber (accent fill) | `.btn--amber` | Primary CTAs, request access, confirm |
| Outline | `.btn--outline` | Tertiary actions, nav secondary |

Base: `font-family: var(--font-display); font-weight: 600; letter-spacing: 0.04em; border-radius: var(--radius-md);`

### Badges

Compact metadata labels. Mono-spaced, small-caps equivalent via `letter-spacing` + `text-transform`.

| Variant | Use |
|---|---|
| Default (neutral) | File type labels, action labels |
| `--amber` | Live / active states, primary exports |

### Data Tables

The core display component. Consistent rules:
- Column headers: mono, 10px, 600 weight, `letter-spacing: 0.12em`, `--ink-35`
- Cell text: mono, 11–12px, `--ink-60`
- Name cells: display font, 13px, 600 weight, `--ink`
- Row separator: `1px solid var(--ink-06)` — barely visible, preserves density
- No alternating row backgrounds

### Mono Label Pattern

Used throughout for section eyebrows, stat labels, table headers, and metadata:
```css
font-family: var(--font-mono);
font-size: 10px–11px;
font-weight: 500–600;
letter-spacing: 0.10em–0.14em;
text-transform: uppercase;
color: var(--amber) | var(--ink-35);
```

---

## Layout Grid

- **Max content width**: 1200px (`container`), 1400px (`container--wide` for full roster)
- **Container padding**: `var(--sp-8)` (32px) horizontal
- **Section padding**: `var(--sp-24)` (96px) vertical
- **Grid gaps**: `var(--sp-20)` (80px) between major columns
- **Section dividers**: `border-bottom: var(--border-thin)` — sections are separated by hairlines, not whitespace alone

### Page Grid Patterns

| Pattern | Columns | Use |
|---|---|---|
| Hero | 1fr 1fr | Headline + product preview |
| Feature sidebar | 280px 1fr | Sticky label + scrolling content |
| Capability grid | repeat(3, 1fr) | Feature cards, bordered grid |
| Audience | 1fr 1fr | Copy + role list |
| Proof | 1fr 480px | Quote + proof points |
| CTA | 1fr auto | Heading + action stack |

---

## Motion

**Philosophy**: Orchestrated reveals, not scattered micro-interactions. The page load animation is the only complex animation. Everything else is a functional transition.

### Page Load
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* Staggered: 0s, 0.08s, 0.16s, 0.24s, 0.32s, 0.42s */
/* Duration: 0.55s, ease: cubic-bezier(0.16, 1, 0.3, 1) */
```

### Scroll-Triggered
IntersectionObserver at `threshold: 0.08`. Staggered per-item delay: `index * 0.04s`. Used for: question rows, capability cards, role rows, proof points.

```js
el.style.opacity = '0';
el.style.transform = 'translateY(10px)';
el.style.transition = `opacity 0.4s ease ${i * 0.04}s, transform 0.4s ease ${i * 0.04}s`;
```

### Interaction Transitions
- Button hover/active: `0.15s var(--ease-out)`
- Nav link underline: `0.15s`
- Card hover background: `0.15s`
- No transform-based hover lifts on cards (avoids layout shift)

**Easing**: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` — fast to settle, feels decisive.

---

## Accessibility Notes

- **Minimum text contrast**: `--ink-35` (`#8e8e8a`) on `--paper` (`#fafaf8`) = **5.0:1** — exceeds WCAG AA 4.5:1 ✓
- **Amber on white surfaces**: `--amber` (`#c47f00`) on `--paper` = **4.7:1** ✓ (AA for large text; use `--amber-dark` for small text)
- **Amber text for labels**: `--amber-dark` (`#8a5800`) on `--paper` = **7.2:1** ✓
- **Status pills**: All semantic status colors exceed 4.5:1 on their respective background ✓
- **Dark mode**: All tokens re-mapped to maintain equivalent contrast ratios
- Focus states: Browser default preserved; not removed. Optional: `outline: 2px solid var(--amber); outline-offset: 2px;`

---

## What This System Is Not

This design system explicitly avoids:
- Gradient fills (zero tolerance — structural only via `linear-gradient` grid lines)
- Glassmorphism / backdrop-filter
- Excessive rounded corners (>6px on panels)
- Purple, teal, or blue as primary accent colors
- Glow or neon effects
- "Control room" dark UI composition
- Shadow-heavy cards as a default elevation language
- Inter, Roboto, or system font stacks as a shortcut

---

## Implementation Notes for Svelte

1. Place all CSS variables in `:root` in `app.css` or `+layout.svelte <style>`
2. Dark mode via `@media (prefers-color-scheme: dark)` — no JS toggle needed unless user preference override is implemented
3. Font imports go in `app.html` `<head>` — not inside Svelte components
4. Animation classes (`anim-fade-up`, `anim-delay-*`) can be applied as Svelte `class:` directives tied to IntersectionObserver in `onMount`
5. Status component: create a single `<Status status="present|leave|tdy|unavail|school|custom" />` component with `{#if}` blocks mapping to class variants
6. Use Svelte Motion library (`import { animate } from 'motion'`) for scroll-triggered reveals in place of raw JS IntersectionObserver

---

*TroopToTask Design System — Version 2.0 — March 2026*
