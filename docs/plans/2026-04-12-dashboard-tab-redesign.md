# Dashboard Tab Redesign

## Problem Statement

The current dashboard uses a drag-and-drop widget grid that fails in two compounding ways. First, the layout fights variable data density — cards in the same row are rarely the same height, which produces either dense, hard-to-read stacks or large chunks of whitespace when one card is significantly taller than its neighbors. Second, the default layout presents everything at once, so no single role finds it immediately useful. The result is a dashboard that tries to serve everyone and ends up serving no one.

The drag-and-drop customization system was meant to give users control over this problem, but it instead pushes the layout burden onto them. Most users do not know what they want from a dashboard until they see a good one — and the current system offers no opinion about what "good" looks like.

## Solution

Replace the customizable widget grid with three fixed, editorially-designed tab views, each representing a distinct operational lens. Users can freely switch between tabs and set a personal default. The tabs are named for what they cover rather than for specific ranks or roles, so the system works regardless of unit structure or title conventions.

**Unit Readiness** — answers "how is the unit doing overall?" Strength, availability breakdown, training currency, and evaluation pipeline at a glance.

**People & Duty** — answers "who do I have and what are they doing?" Who is out today, upcoming duty roster, onboarding pipeline, and upcoming personnel changes.

**Training & Evals** — answers "are we meeting requirements?" Training health by group, individual delinquencies, overdue and upcoming evaluations.

Each tab includes a set of contextual quick-action links filtered by the user's permissions. The only user customization in V1 is the ability to mark a tab as their default, which is stored via the existing dashboard-config endpoint.

---

## Design Direction

### Guiding Constraints

These constraints apply to every element in this redesign. They are hard rules, not suggestions.

1. **No `border-left` or `border-right` accent stripes.** No colored left/right border wider than 1px used as a decorative indicator, regardless of color or token name. Use text color, background tints, or thin horizontal progress bars to communicate status.
2. **No gradient text** (`background-clip: text` with a gradient). All text uses solid `--ink` or semantic token colors.
3. **No cards wrapped in cards.** Sections are separated by hairline rules and typographic hierarchy, not nested surface containers.
4. **Typography carries hierarchy.** Barlow Condensed `800` for display numerics, IBM Plex Mono for operational labels and metadata, Source Serif 4 for names and body content.
5. **Amber is signal, not decoration.** It marks active state, overdue warnings, and quick-action links. Nowhere else.

### Visual Language

The dashboard should read like a well-printed accountability form: structured, dense enough to be useful, with clear hierarchy and no decorative noise. Each tab is an editorial layout — intentional visual choices about what the operator sees first and why — not a uniform grid of equal-weight panels.

Sections are separated by `1px solid var(--ink-15)` horizontal rules and spacing tokens, not rounded card containers. No `box-shadow` on content panels. No `border-radius` beyond `var(--radius-sm)` on interactive controls.

---

## Architecture

### What stays

The workspace query layer is untouched. `DashboardContext`, all Supabase queries, and the `/api/dashboard-config` endpoint remain the data source. The `DashboardConfig` type gains one optional field (`defaultTab`) while preserving the legacy `widgets` field for persisted config compatibility.

### What goes

The dashboard drag-and-drop infrastructure is removed entirely: `DashboardGrid.svelte`, `DashboardWidgetPicker.svelte`, `dashboardLayout.svelte.ts`, widget-shell components, and `DashboardCustomizeModal.svelte`. The shared `svelte-dnd-action` package remains available for planned ordering work outside the dashboard.

### What is built

| File | Purpose |
|------|---------|
| `src/features/dashboard/stores/dashboardTabStore.svelte.ts` | Lightweight store: active tab rune, default tab load/save via API |
| `src/features/dashboard/components/DashboardTabs.svelte` | Tab bar (desktop) + pill switcher (mobile) + quick actions strip |
| `src/features/dashboard/components/tabs/UnitReadinessTab.svelte` | Editorial layout for tab 1 |
| `src/features/dashboard/components/tabs/PeopleDutyTab.svelte` | Editorial layout for tab 2 |
| `src/features/dashboard/components/tabs/TrainingEvalsTab.svelte` | Editorial layout for tab 3 |

---

## Type Changes

Add to `src/features/dashboard/dashboard.types.ts`:

```typescript
export type DashboardTabId = 'unit-readiness' | 'people-duty' | 'training-evals';

// Add to existing DashboardConfig interface:
defaultTab?: DashboardTabId; // undefined = 'unit-readiness'
```

Existing saved `widgets` data remains in the config shape for backward compatibility, but the redesigned dashboard no longer reads widget layout data.

---

## Tab Store

`dashboardTabStore` replaces `dashboardLayout` as the store that communicates with the dashboard-config API. On `init`, it GETs the full config, caches it, and sets `activeTab` to `defaultTab ?? 'unit-readiness'`. On `setDefaultTab`, it merges `{ ...cachedConfig, defaultTab: tab }` before PUT — this is critical to avoid wiping the `widgets` field from configs that still have it.

```typescript
// src/features/dashboard/stores/dashboardTabStore.svelte.ts
import type { DashboardTabId, DashboardConfig } from '../dashboard.types';

const TABS: DashboardTabId[] = ['unit-readiness', 'people-duty', 'training-evals'];

function createDashboardTabStore() {
  let activeTab = $state<DashboardTabId>('unit-readiness');
  let defaultTab = $state<DashboardTabId>('unit-readiness');
  let cachedConfig = $state<DashboardConfig | null>(null);
  let saving = $state(false);

  async function init(orgId: string) {
    const res = await fetch(`/api/dashboard-config?orgId=${orgId}`);
    if (res.ok) {
      const config: DashboardConfig = await res.json();
      cachedConfig = config;
      const tab = config.defaultTab ?? 'unit-readiness';
      activeTab = TABS.includes(tab) ? tab : 'unit-readiness';
      defaultTab = activeTab;
    }
  }

  function setTab(tab: DashboardTabId) {
    activeTab = tab;
  }

  async function setDefaultTab(orgId: string) {
    if (!cachedConfig || saving) return;
    saving = true;
    try {
      await fetch(`/api/dashboard-config?orgId=${orgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cachedConfig, defaultTab: activeTab })
      });
      defaultTab = activeTab;
      if (cachedConfig) cachedConfig = { ...cachedConfig, defaultTab: activeTab };
    } finally {
      saving = false;
    }
  }

  return {
    get activeTab() { return activeTab; },
    get defaultTab() { return defaultTab; },
    get saving() { return saving; },
    get isDefault() { return activeTab === defaultTab; },
    init,
    setTab,
    setDefaultTab
  };
}

export const dashboardTabStore = createDashboardTabStore();
```

---

## DashboardPageView Changes

- Replace `onMount(dashboardLayout.init(...))` with `onMount(dashboardTabStore.init(ctx.data.orgId))`
- Remove: configure mode banner, first-run callout, picker-open state, `padding-right` slide transition
- Replace `<DashboardGrid>` with conditional tab panel rendering
- Replace the "Customize" toolbar button with a "Set as default" affordance rendered inside `DashboardTabs.svelte`, shown only when `!dashboardTabStore.isDefault`

---

## Tab Chrome Visual Spec

### `DashboardTabs.svelte`

This component renders two distinct layouts depending on viewport width.

**Desktop (> 720px):** A horizontal tab bar in the `below` snippet slot of `PageToolbar`, flush to its bottom edge, with the active tab using amber underline. A "Set as default" button appears at the trailing end of the bar only when the active tab differs from the stored default. Quick actions render in a separate strip immediately below the tab bar.

**Mobile (≤ 720px):** A three-segment pill control renders as the first element in the main content area (not in the toolbar). Quick actions appear below it as a horizontally scrollable strip.

#### Desktop Tab Bar

```svelte
<!-- inside PageToolbar's {#snippet below()} -->
<nav class="dashboard-tab-bar" aria-label="Dashboard views">
  {#each TABS as tab}
    <button
      type="button"
      class="dash-tab"
      class:active={store.activeTab === tab.id}
      aria-current={store.activeTab === tab.id ? 'page' : undefined}
      onclick={() => store.setTab(tab.id)}
    >
      {tab.label}
    </button>
  {/each}

  {#if !store.isDefault}
    <button
      type="button"
      class="set-default-btn"
      disabled={store.saving}
      onclick={() => store.setDefaultTab(orgId)}
    >
      {store.saving ? 'Saving…' : 'Set as default'}
    </button>
  {/if}
</nav>
```

```css
.dashboard-tab-bar {
  display: flex;
  align-items: center;
  gap: 0;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--border-default);
}

.dash-tab {
  display: inline-flex;
  align-items: center;
  padding: 10px 14px 11px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  background: none;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    color var(--transition-fast),
    border-color var(--transition-fast),
    background var(--transition-fast);
}

.dash-tab:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-subtle) 70%, transparent);
}

.dash-tab.active {
  color: var(--amber-dark);
  border-bottom-color: var(--amber);
}

.dash-tab:focus-visible {
  outline: var(--focus-outline);
  outline-offset: var(--focus-outline-offset);
}

.set-default-btn {
  margin-left: auto;
  padding: 4px 10px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-medium);
  letter-spacing: var(--letter-spacing-mono);
  text-transform: uppercase;
  color: var(--text-tertiary);
  background: none;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    border-color var(--transition-fast);
}

.set-default-btn:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--ink-35);
}

.set-default-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
```

#### Mobile Pill Switcher

Renders as the first element inside the tab panel container, not inside `PageToolbar`.

```css
@media (max-width: 720px) {
  .pill-switcher {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background: var(--surface-subtle);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: 3px;
    gap: 3px;
    margin-bottom: var(--sp-4);
  }

  .pill {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-2) var(--sp-3);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: calc(var(--radius-md) - 2px);
    cursor: pointer;
    text-align: center;
    white-space: nowrap;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .pill.active {
    background: var(--amber);
    color: var(--accent-contrast); /* #0e0e0d — dark ink on amber, not white */
  }
}
```

Note: `--accent-contrast` is `#0e0e0d`. Use this, not `white`, for text on amber backgrounds. Dark-on-amber is the correct, accessible contrast pairing for this palette.

#### Quick Actions Strip

Appears below the tab bar (desktop) or pill switcher (mobile). Text links only — not buttons. Hidden entirely if no permissioned actions exist for the active tab.

```css
.quick-actions {
  display: flex;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: none;
  padding: var(--sp-2) 0;
  border-bottom: 1px solid var(--border-rule);
}

.quick-action {
  display: inline-flex;
  align-items: center;
  padding: var(--sp-1) var(--sp-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-medium);
  letter-spacing: var(--letter-spacing-mono);
  text-transform: uppercase;
  color: var(--amber-dark);
  text-decoration: none;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  flex-shrink: 0;
  transition: background var(--transition-fast);
}

.quick-action:hover {
  background: var(--amber-light);
}

/* Hairline separators between links */
.quick-action + .quick-action {
  position: relative;
}

.quick-action + .quick-action::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 10px;
  background: var(--ink-15);
}
```

---

## Tab Panel Visual Specs

Each tab is a single `<section>` with direct child sections separated by hairline rules. No wrapping `<div class="card">` containers. Background is `var(--surface-default)` throughout.

### Tab 1 — Unit Readiness (`UnitReadinessTab.svelte`)

#### Section 1 — Strength Hero (full width)

```
STRENGTH TODAY
──────────────────────────────────────────────────────────────

  183  / 210                                            87%
                                                     AVAILABLE

  ████████████████████████████████████░░░░░░░░░░░░░░

  PRESENT 183 · TDY 8 · LEAVE 12 · SICK 4 · OTHER 3
```

The large count `183` uses `var(--font-display)` at `--text-5xl`, `font-weight: 800`. The `/ 210` uses the same font at `--text-2xl`, `--ink-60`. The availability percentage is Barlow Condensed `--text-3xl`, `font-weight: 800`, colored by threshold. No border-left accent — the typographic scale communicates primacy.

```css
.hero {
  padding: var(--sp-8) 0 var(--sp-6);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.hero-numbers {
  display: flex;
  align-items: baseline;
  gap: var(--sp-6);
}

.hero-count {
  font-family: var(--font-display);
  font-size: var(--text-5xl);
  font-weight: var(--font-weight-display);
  line-height: var(--line-height-display);
  color: var(--ink);
}

.hero-total {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: var(--font-weight-regular);
  color: var(--ink-60);
}

.hero-availability {
  margin-left: auto;
  text-align: right;
}

.hero-availability-pct {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--font-weight-display);
  line-height: 1;
  /* color set inline: >=90% → var(--success), 75–89% → var(--amber), <75% → var(--danger) */
}

.hero-availability-label {
  display: block;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-mono);
  color: var(--text-tertiary);
  margin-top: 2px;
}

/* Thin horizontal fill bar — NOT a border-left stripe */
.strength-bar-track {
  width: 100%;
  height: 3px;
  background: var(--ink-15);
  overflow: hidden;
}

.strength-bar-fill {
  height: 100%;
  transition: width 0.4s ease-out;
  /* color set inline by availability threshold */
}

/* Status chip row: inline text, separators via middot */
.status-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1);
}

.status-entry {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-mono);
  color: var(--text-secondary);
}

.status-entry strong {
  color: var(--ink);
  font-weight: var(--font-weight-semibold);
}

.status-entry + .status-entry::before {
  content: '·';
  margin-right: var(--sp-1);
  color: var(--ink-35);
}
```

Color thresholds (add to tab component):

```typescript
function availabilityColor(pct: number): string {
  if (pct >= 0.9) return 'var(--success)';
  if (pct >= 0.75) return 'var(--amber)';
  return 'var(--danger)';
}
```

#### Section 2 — Supporting Three-Column Grid

```css
.supporting-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-6);
  padding: var(--sp-8) 0;
  border-top: 1px solid var(--ink-15);
}

@media (max-width: 720px) {
  .supporting-grid { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 480px) {
  .supporting-grid { grid-template-columns: 1fr; }
}
```

**Column A — Training Currency**

```
TRAINING CURRENCY
─────────────────

  87%
  of personnel current

  12 expired · 6 expiring soon
```

- Kicker: mono `--text-xs` uppercase `--text-tertiary`
- Large percentage: Barlow Condensed `--text-4xl` `800`, color by `availabilityColor(currencyPct)`
- Sub-label: Source Serif 4 `--text-sm` `--text-secondary`
- Below: expired count in `--danger`, expiring-30 count in `--amber-dark`, both mono `--text-xs` uppercase

**Column B — Evaluation Pipeline**

```
EVALUATIONS
───────────

  4         11
  OVERDUE   DUE IN 30
```

Two metric pairs, each: count (Barlow Condensed `--text-3xl`, colored) + label (mono `--text-xs` uppercase `--text-tertiary`).

- Overdue count: `color: var(--danger)`
- Due-30 count: `color: var(--amber-dark)`

No background fills or border accents on either cell.

**Column C — Group Readiness**

```
BY GROUP
────────

  ALPHA  ████████░░  92%
  BRAVO  ██████░░░░  73%
  HHC    █████████░  88%
```

```css
.group-row {
  display: grid;
  grid-template-columns: 72px 1fr 36px;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) 0;
}

.group-name {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-mono);
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Full-width horizontal bar track — structural fill indicator, not a side stripe */
.group-bar-track {
  height: 2px;
  background: var(--ink-15);
  overflow: hidden;
}

.group-bar-fill {
  height: 100%;
  /* color set inline by threshold */
}

.group-pct {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-align: right;
  /* color set inline by threshold */
}
```

#### Section 3 — Upcoming Changes (conditional)

Rendered only when `ctx.upcomingChanges.length > 0`. Hairline above, kicker, flat list.

```css
.upcoming-changes {
  padding: var(--sp-6) 0;
  border-top: 1px solid var(--ink-15);
}

.upcoming-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: var(--sp-4);
  padding: var(--sp-2) 0;
  border-top: 1px solid var(--ink-06);
}

.upcoming-row:first-of-type { border-top: none; }

.upcoming-name {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.upcoming-meta {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-mono);
  color: var(--text-tertiary);
  white-space: nowrap;
}
```

---

### Tab 2 — People & Duty (`PeopleDutyTab.svelte`)

#### Primary Two-Column Split

```css
.people-duty-primary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-8);
  align-items: start;
  padding: var(--sp-6) 0;
}

@media (max-width: 720px) {
  .people-duty-primary {
    grid-template-columns: 1fr;
    gap: var(--sp-6);
  }
}
```

**Column A — Out Today**

```
OUT TODAY  [4]
──────────────────────────────────────

  SPC Ramirez, J.              LEAVE
  SGT Kim, D.                  TDY
  PV2 Torres, A.               SICK
  CPL Washington, M.           PROFILE
```

Section kicker + count badge (reuse the existing `.section-count` pattern from `Badge.svelte` styling):

```css
.section-header {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-mono);
  color: var(--text-tertiary);
  margin-bottom: var(--sp-3);
}

.section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  border: 1px solid color-mix(in srgb, var(--border-default) 70%, var(--amber) 30%);
  background: color-mix(in srgb, var(--amber-light) 72%, var(--surface-panel) 28%);
  color: var(--amber-dark);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-semibold);
  border-radius: var(--radius-sm);
  line-height: 1;
}
```

Person list:

```css
.out-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) 0;
  border-top: 1px solid var(--ink-06);
}

.out-row:first-child { border-top: none; }

.person-identity {
  display: flex;
  align-items: baseline;
  gap: var(--sp-1);
  min-width: 0;
}

.person-rank {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.person-name {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Empty state:

```html
<p class="empty-mono">All personnel accounted for.</p>
```

```css
.empty-mono {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-mono);
  color: var(--text-tertiary);
  padding: var(--sp-4) 0;
}
```

No icon, no decorative container.

**Column B — Duty Roster**

```
DUTY — TODAY
────────────────────────────────────

  STAFF DUTY NCO       SGT Flores, C.
  STAFF DUTY OFFICER   LT Patel, A.

DUTY — TOMORROW
────────────────────────────────────

  STAFF DUTY NCO       SFC Johnson, R.
```

```css
.duty-section + .duty-section {
  margin-top: var(--sp-5);
  padding-top: var(--sp-5);
  border-top: 1px solid var(--ink-15);
}

.duty-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: baseline;
  gap: var(--sp-3);
  padding: var(--sp-2) 0;
  border-top: 1px solid var(--ink-06);
}

.duty-row:first-child { border-top: none; }

.duty-assignment-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-mono);
  color: var(--text-tertiary);
}

.duty-assignee {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-primary);
}
```

#### Secondary Two-Column Row

Separated from the primary split by a hairline and `var(--sp-8)` top padding.

```css
.people-duty-secondary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-8);
  align-items: start;
  padding: var(--sp-8) 0 var(--sp-6);
  border-top: 1px solid var(--ink-15);
}

@media (max-width: 720px) {
  .people-duty-secondary {
    grid-template-columns: 1fr;
    gap: var(--sp-6);
  }
}
```

**Column A — Onboarding Pipeline**

Kicker + count, then one row per in-progress soldier: name + thin 2px horizontal bar + percentage.

```css
.onboarding-row {
  display: grid;
  grid-template-columns: 1fr 80px 32px;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) 0;
  border-top: 1px solid var(--ink-06);
}

.onboarding-row:first-child { border-top: none; }

.onboarding-bar-track {
  height: 2px;
  background: var(--ink-15);
  overflow: hidden;
}

.onboarding-bar-fill {
  height: 100%;
  /* <50% → var(--amber), >=50% → var(--success) */
}

.onboarding-pct {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-align: right;
  color: var(--text-tertiary);
}
```

**Column B — Upcoming Losses / Returns**

Same structure as the Upcoming Changes section from Unit Readiness: kicker + count badge, flat list of name / date / reason rows.

---

### Tab 3 — Training & Evals (`TrainingEvalsTab.svelte`)

#### Section 1 — Status Summary (conditional)

Shown only when `ctx.trainingStats` is non-null and has issues. Three metric cells with vertical hairline dividers between them. This is not a banner — there is no side stripe, no background fill, no colored container.

```
EXPIRED        EXPIRING IN 30     CURRENCY
─────────────────────────────────────────
  12              8                 81%
  personnel       personnel         current
```

```css
.training-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  padding: var(--sp-6) 0;
}

.summary-cell {
  padding: 0 var(--sp-4);
}

.summary-cell:first-child { padding-left: 0; }

/*
 * Structural column divider — 1px neutral ink, applied uniformly to all
 * cells. This is a table-style grid separator, not a status accent stripe.
 * It does not violate the no-border-left-accent constraint.
 */
.summary-cell + .summary-cell {
  border-left: 1px solid var(--ink-15);
}

.summary-kicker {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-mono);
  color: var(--text-tertiary);
  margin-bottom: var(--sp-2);
}

.summary-count {
  font-family: var(--font-display);
  font-size: var(--text-4xl);
  font-weight: var(--font-weight-display);
  line-height: 1;
  /* expired: var(--danger), expiring: var(--amber-dark), currency: availabilityColor() */
}

.summary-sub {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-top: var(--sp-1);
}
```

Skeleton state while `trainingStats` is null:

```svelte
{#if !stats}
  <div class="training-summary-skeleton">
    {#each [0, 1, 2] as _}
      <div class="summary-cell">
        <div class="skeleton" style="height: 12px; width: 80px; margin-bottom: 8px;" />
        <div class="skeleton" style="height: 40px; width: 56px;" />
      </div>
    {/each}
  </div>
{:else}
  <!-- summary cells -->
{/if}
```

#### Section 2 — Two-Column Training Split

```css
.training-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-8);
  padding: var(--sp-8) 0;
  border-top: 1px solid var(--ink-15);
}

@media (max-width: 720px) {
  .training-split { grid-template-columns: 1fr; gap: var(--sp-6); }
}
```

**Column A — Group Delinquencies**

Same `group-row` grid pattern as Unit Readiness Column C. Bar fill: `--danger` if count > 0, `--success` if clean.

**Column B — Individual Issues**

Scrollable list (max-height `320px`, `overflow-y: auto`).

```
INDIVIDUALS
───────────────────────────────────────────

  SPC Adams, T.   BASIC RIFLE        OVERDUE 14d
  SGT Lee, K.     FIRST AID           DUE 8d
  PV2 Murphy, S.  CBRN AWARENESS      DUE 22d
```

```css
.individual-list {
  max-height: 320px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--ink-15) transparent;
}

.individual-row {
  display: grid;
  grid-template-columns: 130px 1fr auto;
  align-items: baseline;
  gap: var(--sp-2);
  padding: var(--sp-2) 0;
  border-top: 1px solid var(--ink-06);
}

.individual-row:first-child { border-top: none; }

.individual-name {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.individual-task {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-mono);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.individual-status {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-mono);
  white-space: nowrap;
  /* overdue: var(--danger); due <30d: var(--amber-dark); due >=30d: var(--text-tertiary) */
}
```

#### Section 3 — Evaluation Pipeline

```css
.eval-section {
  padding: var(--sp-8) 0;
  border-top: 1px solid var(--ink-15);
}

.eval-section-heading {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: var(--font-weight-display);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ink);
  margin-bottom: var(--sp-5);
}
```

Uses the same evaluation pipeline data already exposed by `DashboardContext`, rendered directly in the tab panel without widget shell chrome.

#### Section 4 — ICTL Placeholder

```html
<div class="ictl-placeholder">
  <span class="ictl-kicker">ICTL Status</span>
  <span class="ictl-note">Individual critical task data — coming soon</span>
</div>
```

```css
.ictl-placeholder {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-4) 0;
  border-top: 1px solid var(--border-rule);
  opacity: 0.5;
}

.ictl-kicker {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-mono);
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.ictl-note {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
```

---

## Quick Actions

Rendered below the tab bar (or pill switcher on mobile) in `DashboardTabs.svelte`. Tab-specific, permission-filtered via `hasDashboardPermission`. The strip is hidden entirely if the active tab has no permissioned actions for this user.

| Tab | Label | Route |
|-----|-------|-------|
| Unit Readiness | Add Calendar Entry | `/org/{orgId}/calendar` |
| People & Duty | Onboard Soldier | `/org/{orgId}/onboarding` |
| People & Duty | Duty Roster | `/org/{orgId}/calendar/duty-roster` |
| People & Duty | Add Leave | `/org/{orgId}/calendar` |
| Training & Evals | Record Training | `/org/{orgId}/training` |
| Training & Evals | Add Eval | `/org/{orgId}/leaders-book` |

---

## Responsive Behavior

| Viewport | Tab chrome | Layouts |
|----------|-----------|---------|
| > 720px | Horizontal tab bar in `PageToolbar` below slot | 3-col / 2-col grids active |
| ≤ 720px | Pill switcher in content area | All grids collapse to 1 col |
| ≤ 480px | Pill switcher (labels may abbreviate) | 1 col, tighter `--sp-4` page padding |

**`BottomTabBar.svelte` is completely untouched.** The pill switcher lives inside the main content scroll. It does not overlap with or replace the bottom navigation layer.

**Quick actions on mobile:** The strip scrolls horizontally via `overflow-x: auto`. No wrapping.

---

## Implementation Order

1. **Types and store** — add `DashboardTabId` and `defaultTab` to `dashboard.types.ts`; create `dashboardTabStore.svelte.ts`; update `index.ts` to export `dashboardTabStore` in place of `dashboardLayout`
2. **Tab panel components** — build `UnitReadinessTab`, `PeopleDutyTab`, `TrainingEvalsTab` wired to existing context data
3. **DashboardTabs chrome** — tab bar, pill switcher, quick actions strip, responsive styles
4. **Rebuild DashboardPageView** — wire new components, remove old imports and configure-mode logic
5. **Cleanup** — remove `DashboardModals.svelte`; delete `DashboardGrid.svelte`, `DashboardWidgetPicker.svelte`, `dashboardLayout.svelte.ts`, widget-shell components, and `DashboardCustomizeModal.svelte`; keep `svelte-dnd-action` installed for planned ordering work outside the dashboard

---

## Gotchas

- **`setDefaultTab` save** — must PUT `{ ...cachedConfig, defaultTab: tab }` not just `{ defaultTab: tab }`, or the `widgets` field gets wiped for users who still have a v1/v2 config.
- **`ctx.trainingStats` is async** — comes from a deferred stream; `TrainingEvalsTab` must handle `null` gracefully with skeleton placeholders.
- **`index.ts` barrel** — grep for all imports of `dashboardLayout` outside the dashboard feature before deleting the store file.
- **No colored side-border accents** — text color, thin horizontal fill bars, and background tints carry all status signaling. The only `border-left` present in the new code is the 1px neutral `var(--ink-15)` structural divider between Training summary metric cells (documented in that section). All other `border-left`/`border-right` on content elements should be flagged and rejected.

---

## Verification

1. `npm run test` — dashboard context, tab store, and dashboard types tests pass
2. Dev server — all three tabs render with correct data, no console errors
3. Tab switching — active tab indicator updates; quick actions change per tab; restricted actions are hidden for users without permissions
4. "Set as default" affordance — visible only when `activeTab !== defaultTab`; clicking it persists the preference; reload starts on the correct tab
5. Mobile (≤ 720px) — pill switcher renders with `var(--accent-contrast)` text on active amber pill; bottom nav is intact and unaffected; quick actions scroll horizontally if needed
6. Dashboard-specific drag-and-drop code absent after cleanup; `svelte-dnd-action` remains in `package.json` for planned non-dashboard ordering work
7. Visual audit — grep new component files for `border-left` and `border-right`; only the 1px neutral structural divider in the Training summary should appear
