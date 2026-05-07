# Component Catalog & CSS Design System

Shared UI primitives live in `src/lib/components/ui/`. Import via `$lib/components/ui/...`.
Layout components (Modal and legacy page toolbar shells) live in `src/lib/components/`. Import via `$lib/components/...`.
Public marketing primitives live in `src/lib/components/public/`. Import via `$lib/components/public/...`.

---

## UI Foundation Showroom

Development route: `/ui-showroom`

The showroom is the only approved preview and calibration surface for the shadcn-svelte + Tailwind v4 migration foundation. It is development-only and returns 404 outside `dev` mode.

Use it to review shadcn-svelte primitives at desktop and mobile widths before production route migration work starts. The route renders docs-style examples of the selected foundation set: button, button group, input, input group, sidebar, navigation menu, label, textarea, select, checkbox, switch, radio group, badge, alert, dialog, sheet, popover, dropdown menu, tooltip, command, combobox, tabs, table, pagination, calendar/date picker, chart, skeleton, progress, spinner, empty, and separator.

Replacement previews:

- Legacy `DataTable` is represented by native shadcn `table` and `pagination` examples.
- Legacy `toolbar` is represented by native shadcn `input-group`, `select`, `button-group`, `button`, and `dropdown-menu` examples.
- Legacy `EmptyState` is represented by the shadcn `empty` component.
- Legacy `FileUpload` is represented by the native shadcn `input type="file"` example.
- Legacy `SearchSelect` is represented by the shadcn `command` component.
- Legacy `MultiTagSelect` is represented by the shadcn-style `combobox` multi-select with chips.
- Legacy `Spinner` is represented by the shadcn `spinner` component.

Rules:

- Shared components are visually authoritative. Production routes consume shared component appearance as-is.
- Visual styling comes from `src/app.css`, `components.json`, theme variables, or shared component source files under `src/lib/components/**`.
- `/ui-showroom` should stay docs-like: no route-local component skinning, no custom variants, and no visual tuning of generated components.
- Production routes may configure behavior, labels, data, validation, permissions, filters, columns, and actions.
- Production routes must not visually retune shared components with route-local spacing, radius, borders, shadows, typography, color, animation, density, or internal selectors unless Robert explicitly approves the specific visual exception.
- Route-level variation is behavioral only. Behavioral changes must not affect other consumers of the shared component.
- Stop and ask permission before creating a route-specific wrapper around a shared component to change behavior.
- If a durable visual need appears, add it centrally, document it here, and show it in `/ui-showroom` before any route consumes it.
- If a shared component does not fit a route, report the design-system gap and propose a shared component/API extension instead of patching the route locally.
- `/ui-showroom` must not import legacy TroopToTask component wrappers such as `DataTable`, the `toolbar` family, `EmptyState`, `FileUpload`, `SearchSelect`, `MultiTagSelect`, or `Spinner`; show their shadcn replacements only.
- The current dark-mode source remains `documentElement[data-theme]`; Tailwind v4 dark variants also support `.dark` during the transition for shadcn compatibility.

Foundation files:

- `components.json` initializes shadcn-svelte with `ui` pointed at `$lib/components/ui`.
- `src/lib/utils.ts` provides the shadcn `cn` helper and element-ref utility types.
- `src/app.css` imports Tailwind v4 and exposes native shadcn/Tailwind theme variables without mapping them to TroopToTask colors yet.
- `src/lib/components/ui/showroom/showroomInventory.ts` records the selected component set and state coverage.

Implementation note: the current `shadcn-svelte@1.2.7` CLI generated the supported `nova` style. The RFC mentioned `new-york` based on the docs available when written; `components.json` records the implementation-time CLI result so future `shadcn-svelte add` runs stay consistent.

---

## Public Marketing Shell

Use these for any top-level marketing, legal, or trust page so the public site keeps one shared shell and one navigation/footer contract.

```svelte
<PublicShell user={data.user} active="pricing" bodyClass="pricing-page" roadmapHref="/#roadmap">
    <PublicPageHeader label="Pricing">
        {#snippet title()}Simple, transparent <em>pricing.</em>{/snippet}
        <p>No feature gating. Every plan gets the full platform.</p>
    </PublicPageHeader>

    <PublicContentSection label="01 // Tiering" alternate>
        {#snippet title()}Sized for the formation.{/snippet}
        <p>Section body...</p>
    </PublicContentSection>
</PublicShell>
```

### `public/PublicShell.svelte`

Shared public wrapper that renders the classification bar, site nav, optional CTA, and footer around page content.

Props: `user?: unknown`, `active?: 'features' | 'pricing' | 'security'`, `bodyClass?: string`, `roadmapHref?: string`, `faqHref?: string`, `showFaqLink?: boolean`, `showCta?: boolean`, `ctaTitleBefore?: string`, `ctaEmphasis?: string`, `ctaSubtitle?: string`, `children: Snippet`, `cta?: Snippet`

Guidance:

- Prefer this over duplicating nav/footer/CTA markup in public routes.
- Use `roadmapHref="#roadmap"` and `faqHref="#faq"` on the landing page; use `/#roadmap` for inner pages.
- Pass a custom `cta` snippet only when the default shared CTA is not enough.

### `public/PublicPageHeader.svelte`

Shared inner-page hero/header for marketing, legal, pricing, and trust pages.

Props: `label: string`, `title: Snippet`, `children?: Snippet`

Guidance:

- Keep `label` short, mono, and structural.
- Put supporting copy and metadata like effective dates in `children`; use `.page-meta` for low-emphasis header metadata.

### `public/PublicContentSection.svelte`

Shared section framing for legal/trust/public longform pages.

Props: `label: string`, `alternate?: boolean`, `title?: Snippet`, `children: Snippet`

Guidance:

- Alternate sections with `alternate` when you need rhythm across long-form pages.
- Use `.contact-card` inside section content for disclosure/support email callouts.

### `public/PublicSiteNav.svelte`, `public/PublicCta.svelte`, `public/PublicFooter.svelte`

Lower-level shell primitives used internally by `PublicShell`. Reach for these directly only if you have a compelling reason to diverge from the standard public page wrapper.

---

## `PageToolbar.svelte`

Page header toolbar with title, actions, breadcrumbs, and optional below-content. The refreshed toolbar uses a field-document hierarchy: mono breadcrumbs, condensed uppercase title, serif-supporting subtitle, and restrained action framing.

```svelte
<!-- Basic usage -->
<PageToolbar title="Personnel">
    <button class="btn btn-primary" onclick={handleAdd}>Add</button>
</PageToolbar>

<!-- With breadcrumbs and subtitle -->
<PageToolbar
    title="Training Records"
    subtitle="42 total"
    breadcrumbs={[{ label: 'Personnel', href: '/personnel' }, { label: 'John Smith' }]}
/>

<!-- Compact variant, sticky -->
<PageToolbar title="Detail View" variant="compact" sticky />

<!-- With below slot for filters/sub-nav -->
<PageToolbar title="Calendar">
    {#snippet below()}
        <SubNav tabs={tabs} active={currentTab} onChange={handleTab} />
    {/snippet}
</PageToolbar>

<!-- Leading snippet replaces title area -->
<PageToolbar title="Dashboard">
    {#snippet leading()}
        <CustomHeader />
    {/snippet}
</PageToolbar>
```

Props: `title: string`, `helpTopic?: string`, `overflowItems?: OverflowItem[]`, `variant?: 'default' | 'compact'`, `sticky?: boolean`, `breadcrumbs?: { label: string; href?: string }[]`, `subtitle?: string`, `children?: Snippet` (actions), `leading?: Snippet`, `below?: Snippet`

Toolbar guidance:

- Use `variant="default"` for normal product pages and `variant="compact"` for denser detail views.
- Keep breadcrumbs short and structural; they render as mono navigation labels.
- Prefer `subtitle` for context or counts rather than adding decorative badges beside the title.

---

## Shared Route Toolbar

Use the shared route toolbar for dense authenticated workspaces after the app shell has already identified the page through breadcrumbs. The toolbar should stay a single resting row, compact stateful controls before it overflows commands, and keep filters, search, view modes, toggles, nav, and passive metadata out of command overflow.

Import the shell and items from `$lib/components/ui/toolbar`. Authenticated route-level toolbars use `Toolbar` as the shared measurement shell.

```svelte
<script lang="ts">
    import {
        Toolbar,
        ToolbarActions,
        ToolbarFilterSelect,
        ToolbarGroup,
        ToolbarSearchItem,
        ToolbarToggle,
        ToolbarViewToggle
    } from '$lib/components/ui/toolbar';
    import type { ToolbarActionConfig } from '$lib/components/ui/toolbar';

    const actions: ToolbarActionConfig[] = [
        { id: 'export', label: 'Export CSV', href: exportHref, icon: 'download', priority: 'low' },
        {
            id: 'record',
            label: 'Record Training',
            onclick: openRecordTraining,
            icon: 'clipboard-check',
            priority: 'critical',
            variant: 'primary',
            overflow: 'never',
            disabled: !canRecord,
            disabledReason: 'Add personnel and active tasks first.'
        }
    ];
</script>

<Toolbar ariaLabel="Critical Tasks controls" collapse="medium" leadingMin="34rem" searchCompactAt={1180}>
    {#snippet leading()}
        <ToolbarGroup label="Critical Tasks filters" activeCount={activeFilterCount} testId="critical-tasks-filter-group">
            {#snippet full()}
                <ToolbarViewToggle ariaLabel="Critical Tasks matrix view mode" options={viewOptions} bind:value={viewMode} />
                <ToolbarFilterSelect ariaLabel="Critical Tasks group filter" options={groupOptions} bind:value={groupId} width="wide" />
                <ToolbarToggle label="Show gaps only" bind:pressed={gapsOnly} />
                <ToolbarSearchItem ariaLabel="Search by name, rank, or MOS" width="wide" bind:value={personnelSearch} />
            {/snippet}
            {#snippet panel()}
                <ToolbarViewToggle ariaLabel="Critical Tasks matrix view mode" options={viewOptions} bind:value={viewMode} mode="full" />
                <ToolbarFilterSelect ariaLabel="Critical Tasks group filter" options={groupOptions} bind:value={groupId} width="wide" mode="full" />
                <ToolbarToggle label="Show gaps only" bind:pressed={gapsOnly} />
                <ToolbarSearchItem ariaLabel="Search by name, rank, or MOS" width="wide" mode="full" bind:value={personnelSearch} />
            {/snippet}
        </ToolbarGroup>
    {/snippet}

    <ToolbarActions actions={actions} ariaLabel="Critical Tasks actions" overflowAriaLabel="More Critical Tasks actions" />
</Toolbar>
```

### Correct Route Shape

The shared toolbar measures the `leading` slot and `ToolbarActions` slot to decide exactly when controls compact. Keep route markup close to this shape:

```svelte
<Toolbar ariaLabel="Training controls" collapse="medium" leadingMin="34rem" searchCompactAt={1180}>
    {#snippet leading()}
        <ToolbarGroup label="Training filters" activeCount={activeFilterCount}>
            {#snippet full()}
                <ToolbarViewToggle ... />
                <ToolbarFilterSelect ... />
                <ToolbarSearchItem ... />
            {/snippet}
            {#snippet panel()}
                <ToolbarViewToggle mode="full" ... />
                <ToolbarFilterSelect mode="full" ... />
                <ToolbarSearchItem mode="full" ... />
            {/snippet}
        </ToolbarGroup>
    {/snippet}

    <ToolbarActions actions={toolbarActions} ariaLabel="Training actions" overflowAriaLabel="More training actions" />
</Toolbar>
```

Shape rules:

- Put the route shell, leading content, and actions inside the same `<Toolbar>` component. The toolbar coordinator (shared context that tells child controls when to compact) only works for descendants.
- Put related filters, view toggles, boolean toggles, and same-workflow search inside a `ToolbarGroup` when they should collapse together into one filter trigger.
- Put `ToolbarActions` as the direct child action slot of `Toolbar`, not inside `leading` and not inside a route-local wrapper.
- Use default `ToolbarSearchItem` mode in the `full` snippet when the search should collapse into its own magnifying-glass trigger during the `search` phase.
- Add an explicit `panel` snippet with `ToolbarSearchItem mode="full"` when the same search also lives inside a compacting `ToolbarGroup`; the opened filter panel should contain a real search input, not another search trigger.
- Use `searchCompactAt` to make text search compact before the whole filter group collapses. Use `compactLeadingWhenCrowded` only for routes where measured leading content should force the whole leading group into its filter trigger.
- Count active filters accurately in `activeCount`, including search text when search lives inside the filter group.
- Keep passive context, record identity, and page breadcrumbs outside the toolbar unless they are compact toolbar metadata (`ToolbarMetaItem` / `ToolbarMetricGroup`).

Broken shapes to avoid:

- Do not define a reusable route snippet outside the toolbar and render it into both `full` and `panel` unless there is a specific shared component need. Prefer snippets inside `ToolbarGroup`; if search is auto in `full`, provide a `panel` snippet that makes panel controls full mode.
- Do not wrap `ToolbarGroup` and `ToolbarSearchItem` in route-local flex containers just to force one row. Extra wrappers change what the toolbar measures and make collapse behavior harder to reason about.
- Do not put filters, search, view toggles, or toggles into `ToolbarActions` or command overflow. Commands overflow; stateful controls compact.
- Do not force route-level action `displayMode="compact"` to solve crowding. Let `ToolbarActions` calculate full, compact, and overflow states from measured width.
- Do not preserve route-local toolbar shells or wrapper components around a migrated toolbar surface.

### Public Components

- `Toolbar`: shared shell, measurement boundary, and compact-panel coordinator. Props: `ariaLabel: string`, `leadingMin?: string`, `collapse?: 'wide' | 'medium' | 'narrow'`, `containerWidth?: number`, `searchCompactAt?: number`, `groupCompactAt?: number`, `compactLeadingWhenCrowded?: boolean`, `leading?: Snippet`, `children?: Snippet`, `overflow?: Snippet`.
- `ToolbarActions`: measured action group that renders `ToolbarAction` items and generated command overflow. Props: `actions: ToolbarActionConfig[]`, `ariaLabel: string`, `overflowAriaLabel: string`, `overflowLabel?: string`, `overflowIconOnly?: boolean`, `containerWidth?: number`, `actionMeasurements?: Record<string, ToolbarActionMeasurement>`.
- `ToolbarAction`: low-level action renderer for `ToolbarActions`. Prefer `ToolbarActions` at route level.
- `ToolbarGroup`: first-class group boundary for related stateful controls. Props: `label: string`, `activeCount?: number`, `mode?: 'auto' | 'full' | 'compact'`, `compactBreakpoint?: number`, `panelMode?: 'inline'`, `testId?: string`, `full?: Snippet`, `panel?: Snippet`.
- `ToolbarSearchItem`: search input that renders full width when possible and compacts to a viewport-safe trigger/panel when constrained.
- `ToolbarFilterSelect`: select-style filter primitive for stateful filters.
- `ToolbarViewToggle`: segmented view-mode control with compact trigger/panel behavior.
- `ToolbarToggle`: icon toggle for boolean toolbar state such as "Show gaps only".
- `ToolbarOverflowMenu`: still used by `ToolbarActions` for generated command overflow.

### Policies

Toolbar actions use explicit layout policy fields:

```ts
type ToolbarActionPriority = 'low' | 'normal' | 'high' | 'critical';
type ToolbarActionDisplayMode = 'auto' | 'full' | 'compact';
type ToolbarActionOverflowPolicy = 'auto' | 'always' | 'never';
type ToolbarActionVariant = 'default' | 'primary' | 'secondary' | 'danger';
type ToolbarActionIcon =
    | 'book-open'
    | 'calendar-days'
    | 'chart'
    | 'clipboard-check'
    | 'clipboard-list'
    | 'download'
    | 'printer'
    | 'settings'
    | 'upload';
```

Defaults are `priority: 'normal'`, `displayMode: 'auto'`, `overflow: 'auto'`, and `variant: 'default'`.

- `priority` controls yield order. Lower-priority actions compact and overflow before higher-priority actions.
- `displayMode="auto"` renders full when space allows and compact when needed, if the action has an icon. `displayMode="full"` skips compact rendering. `displayMode="compact"` prefers compact rendering.
- `overflow="auto"` allows command overflow. `overflow="always"` keeps low-frequency commands in generated overflow. `overflow="never"` keeps the action visible and emits a development warning if the protected action cannot fit.
- `variant` is visual only. Do not use `variant="primary"` to imply layout priority.
- Overflow menu entries preserve author order, even when yield order is determined by priority.

### Action Guidance

`ToolbarActionConfig` supports link and button actions:

```ts
{
    id: string;
    label: string;
    href?: string;
    onclick?: () => void;
    menuItems?: OverflowItem[];
    toggle?: boolean;
    active?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    icon?: ToolbarActionIcon;
    priority?: ToolbarActionPriority;
    displayMode?: ToolbarActionDisplayMode;
    overflow?: ToolbarActionOverflowPolicy;
    variant?: ToolbarActionVariant;
}
```

- Provide one of `href`, `onclick`, or `menuItems`.
- Use `menuItems` for grouped toolbar commands that need their own dropdown while still flattening into command overflow when constrained.
- Use `toggle` plus `active` for overflow commands that represent visible page state.
- Use `disabledReason` whenever a disabled action depends on page state. The reason is preserved for compact and overflow render paths.
- Use `overflow="never"` only for the main workflow action that must remain reachable, such as Critical Tasks `Record Training`.
- Use the built-in toolbar icon names instead of route-local SVGs. The family owns lucide sizing, `aria-hidden`, labels, and compact rendering.

### Stateful Controls

Use stateful primitives for page state, not command overflow:

- `ToolbarSearchItem`: controlled search text. The compact trigger is active when the value is non-empty and opens a viewport-safe search panel.
- `ToolbarFilterSelect`: single-select filter. The compact trigger is active when value differs from `defaultValue`.
- `ToolbarViewToggle`: small segmented view switch like `A-Z` / `By Group`.
- `ToolbarToggle`: boolean state. Use for on/off filters that are not semantically dropdowns.
- `ToolbarGroup`: related stateful controls, active count, group trigger, and panel.

Search, filter, toggle, and view state belong to the page. Compact panels render against the same controlled state instead of moving live DOM instances between containers.

### Accessibility

- Every toolbar shell must have a concrete `ariaLabel`, such as `Critical Tasks controls`.
- Icon-only actions and triggers must keep an accessible name through `aria-label` and a native `title` or visible text.
- Compact search/filter/group/view triggers must expose `aria-expanded`.
- Boolean toggles must expose `aria-pressed`.
- Disabled actions must preserve `disabled` or `aria-disabled` and surface `disabledReason`.
- Escape closes compact panels without clearing search, filter, toggle, or view state.
- Only one compact panel should be open per toolbar at a time; opening search closes filters, opening filters closes search, and opening command overflow closes compact panels.

### Authenticated Route Anatomy

- The app shell owns the route label through breadcrumbs, normally `Organization Name > Page`. Do not repeat the same page name as a large in-body route title.
- Start dense workspace content with `Toolbar` when the page has filters, modes, page navigation, or page actions.
- Keep primary workflow controls visible when there is room: common filters, search, view modes, and the main create/manage action.
- Use command overflow for secondary, lower-frequency, or configuration actions. Do not put stateful filters/search/view controls into command overflow.
- Avoid decorative stat boxes that repeat visible table/list counts. Keep compact stats only when they drive action.

### Final Route API

The shared toolbar family is the target API for dense authenticated routes.

- Use `Toolbar` as the route-level shell.
- Use `ToolbarActions` for command actions and generated command overflow.
- Use `ToolbarSearchItem`, `ToolbarFilterSelect`, `ToolbarViewToggle`, `ToolbarToggle`, `ToolbarMultiSelectFilter`, and `ToolbarGroup` for leading stateful controls.
- Use `ToolbarNavGroup`, `ToolbarMetaItem`, and `ToolbarMetricGroup` for non-command toolbar content.
- Keep `ToolbarSearch` and `ToolbarSelect` as low-level implementation building blocks behind the shared family, not as route-level imports.
- Keep `ToolbarOverflowMenu` as the command overflow surface behind `ToolbarActions` and `ToolbarAction` menu items.
- If a route toolbar does not fit these primitives cleanly, design a reusable toolbar primitive or policy extension. Do not force route-local hacks into the toolbar.

Known deferred work: true mobile sheet panel mode and a shared tooltip primitive.

---

## `Modal.svelte`

Base modal wrapper. Use for all modals. Default width is `480px`. The refreshed modal shell uses a structured document-style header/footer, dark close affordance, and shared focus treatment.

```svelte
<Modal title="Edit Foo" {onClose} width="500px" titleId="foo-title">
    <!-- body content -->
    {#snippet footer()}
        <button class="btn btn-danger" onclick={handleDelete}>Delete</button>
        <div class="spacer"></div>
        <button class="btn btn-secondary" onclick={onClose}>Cancel</button>
        <button class="btn btn-primary" onclick={handleSave}>Save</button>
    {/snippet}
</Modal>

<!-- Locked during async operation -->
<Modal title="Processing" {onClose} canClose={!saving} showCloseButton={false}>
    ...
</Modal>

<!-- With header actions (e.g. a status badge next to the title) -->
<Modal title="Review" {onClose}>
    {#snippet headerActions()}
        <Badge label="Pending" color="var(--color-warning)" />
    {/snippet}
    ...
</Modal>
```

**Modal footer convention**: `[Delete] [spacer] [Cancel/Close] [Primary or amber confirm]`

Props: `title: string`, `onClose: () => void`, `width?: string` (default `'480px'`), `titleId?: string`, `canClose?: boolean` (default `true` — set to `false` during async ops to block Escape/backdrop), `showCloseButton?: boolean` (default `true`), `headerActions?: Snippet`, `children: Snippet`, `footer?: Snippet`

---

## `ui/ConfirmDialog.svelte`

Pre-wired confirmation modal. Handles its own loading state during async `onConfirm`.

```svelte
{#if showConfirm}
    <ConfirmDialog
        title="Delete Item"
        message="This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => (showConfirm = false)}
    />
{/if}
```

Props: `title: string`, `message: string`, `confirmLabel?: string` (default `'Confirm'`), `cancelLabel?: string` (default `'Cancel'`), `variant?: 'danger' | 'warning'` (default `'danger'`), `onConfirm: () => void | Promise<void>`, `onCancel: () => void`

The confirm button shows a spinner and both buttons are disabled while `onConfirm` is awaited.

---

## `ui/Badge.svelte`

Compact metadata or status label. Badges are now intentionally mono and uppercase so they read like labels instead of decorative pills.

```svelte
<Badge label="TDY" color="var(--color-info)" />
<Badge label="Leave" color={status.color} textColor={status.textColor} />
<Badge label="Admin" color="var(--color-info)" bold={true} />
<Badge label="Draft" variant="outlined" />
```

Props: `label: string`, `color?: string`, `textColor?: string` (default `'white'` when a custom filled color is passed), `bold?: boolean`, `variant?: 'filled' | 'outlined'`

Badge guidance:

- Reserve filled badges for real state or metadata labels.
- Use `variant="outlined"` for neutral, low-emphasis labels.
- Prefer shared semantic tokens (`--color-success`, `--color-warning`, `--color-error`, `--color-info`) over arbitrary decorative colors when possible.

---

## `ui/Spinner.svelte`

Loading spinner for async buttons.

```svelte
<button disabled={saving}>
    {#if saving}<Spinner />{/if}
    {saving ? 'Saving...' : 'Save'}
</button>
```

Props: `size?: number` (px, default `14`), `color?: string` (default `'white'`)

---

## `ui/Stepper.svelte`

Linear stage indicator for multi-step workflows. Shows stages as connected dots with labels. Clickable when not disabled.

```svelte
<Stepper
    stages={['with soldier', 'submitted', 'approved']}
    currentStage="submitted"
    onStageClick={(stage) => handleStageClick(step, stage)}
/>

<!-- Read-only -->
<Stepper stages={['draft', 'review', 'done']} currentStage="review" disabled />
```

Props: `stages: string[]`, `currentStage: string`, `onStageClick?: (stage: string) => void`, `disabled?: boolean`

Stage states: `completed` (before current — filled dot, primary connector), `current` (highlighted dot with glow ring, primary label), `upcoming` (hollow dot, muted label).

---

## `ui/FormField.svelte`

Labeled form field with mono label treatment, error/hint states, and accessibility wiring.

```svelte
<!-- Simple text input -->
<FormField label="First Name" id="first-name" required bind:value={firstName} />

<!-- Select -->
<FormField label="Status" id="status" inputElement="select" options={statusOptions} bind:value={status} />

<!-- Textarea -->
<FormField label="Notes" id="notes" inputElement="textarea" rows={3} bind:value={notes} />

<!-- With error / hint -->
<FormField label="Email" id="email" type="email" error={emailError} bind:value={email} />
<FormField label="MOS" id="mos" hint="e.g., 68W, 68C, RN" bind:value={mos} />

<!-- Escape hatch: custom children (e.g. optgroups) -->
<FormField label="Rank" id="rank">
    <select id="rank" class="input" bind:value={rank}>
        <optgroup label="NCO"><option value="SGT">SGT</option></optgroup>
    </select>
</FormField>
```

Props: `label: string`, `id: string`, `inputElement?: 'input' | 'select' | 'textarea'`, `name?: string`, `type?: string`, `placeholder?: string`, `value?: string` (bindable), `required?: boolean`, `error?: string`, `hint?: string`, `disabled?: boolean`, `options?: { value: string; label: string }[]`, `rows?: number`, `children?: Snippet`

Accessibility: `label[for]` wired to `id`, `aria-describedby` for error/hint, `aria-invalid` when error, `required` forwarded to native element.

Field guidance:

- Labels render as mono utility labels by default; keep them short and specific.
- Hints and errors occupy a reserved support row so layouts do not jump as much when validation appears.

**Children escape hatch**: When using `children`, manually wire `aria-describedby="{id}-error"` or `"{id}-hint"` on your custom input — FormField renders those spans but can't auto-apply them to custom children.

---

## `ui/SearchSelect.svelte`

Searchable single-select with keyboard navigation and clear button. Use when `<select>` is too limiting but you still want a shared field treatment.

```svelte
<SearchSelect
    options={personnel.map((p) => ({ value: p.id, label: p.name }))}
    bind:value={selectedId}
    placeholder="Search personnel..."
    onchange={(v) => console.log(v)}
/>
```

Props: `options: { value: string; label: string }[]`, `value: string` (bindable), `placeholder?: string` (default `'Search...'`), `disabled?: boolean`, `clearable?: boolean`, `onchange?: (value: string) => void`, `id?: string`, `ariaLabel?: string`, `compact?: boolean`

- Typing filters the dropdown; keyboard arrows + Enter to navigate; Escape to close
- Shows a × clear button when a value is selected
- Clears to `''` when cleared
- Use `compact` inside dense grids or tables where the default field height is too tall
- The control reuses shared field density/focus treatment, so prefer it over custom searchable listboxes

---

## `ui/MultiTagSelect.svelte`

Searchable multi-select that renders selected values as removable badges inside the input area. Use this instead of native `multiple` selects when users need to pick several items from a long list.

New shadcn-svelte migration work should prefer `ui/combobox` for chip-based multi-selects. `MultiTagSelect` remains documented for existing route usage until those routes migrate.

```svelte
<MultiTagSelect
    options={mosValues.map((mos) => ({ value: mos, label: mos }))}
    value={selectedMos}
    placeholder="All MOS"
    ariaLabel="Filter by MOS"
    onChange={(values) => (selectedMos = values)}
/>
```

Props: `options: { value: string; label: string }[]`, `value: string[]`, `placeholder?: string` (default `'Select...'`), `ariaLabel?: string`, `disabled?: boolean`, `onChange: (values: string[]) => void`

- Typing filters the dropdown; keyboard arrows + Enter toggle the highlighted option; Backspace removes the last selected value when the input is empty
- Selected values render as mono badges with remove buttons
- The dropdown stays open while selecting multiple options and repositions on scroll/resize
- Prefer concise `ariaLabel` text that describes the field, such as `"Filter by MOS"` or `"Template scope groups"`

---

## `ui/combobox`

Compound shadcn-style combobox primitives for searchable multi-selects with removable chips. The API mirrors the React shadcn combobox multiple pattern while using Svelte snippets.

```svelte
<script lang="ts">
    import * as Combobox from '$lib/components/ui/combobox/index.js';

    const frameworks = ['Next.js', 'SvelteKit', 'Nuxt.js', 'Remix', 'Astro'];
    let selectedFrameworks = $state<string[]>(['Next.js']);
</script>

<Combobox.Root items={frameworks} multiple autoHighlight bind:value={selectedFrameworks}>
    <Combobox.Chips>
        <Combobox.Value>
            {#snippet children(values)}
                {#each values as value (value)}
                    <Combobox.Chip value={value}>{value}</Combobox.Chip>
                {/each}
                <Combobox.ChipsInput placeholder="Add framework" aria-label="Add framework" />
            {/snippet}
        </Combobox.Value>
    </Combobox.Chips>
    <Combobox.Content>
        <Combobox.Empty>No items found.</Combobox.Empty>
        <Combobox.List>
            {#snippet children(item)}
                <Combobox.Item value={item}>{item}</Combobox.Item>
            {/snippet}
        </Combobox.List>
    </Combobox.Content>
</Combobox.Root>
```

Props: `Root` accepts `items: readonly string[]`, `value?: string | string[]` (bindable), `defaultValue?: string | string[]`, `multiple?: boolean`, `autoHighlight?: boolean`, `disabled?: boolean`, `open?: boolean` (bindable), `label?: string`, `onValueChange?: (value) => void`. `Chip` and `Item` require `value: string`.

- Multi-select stays open while selecting, filters through the command primitive, and removes the last chip with Backspace when the input is empty.
- `Combobox.Content` anchors to `Combobox.Chips`, so the popup width follows the chip input surface.
- Visual changes belong in the shared combobox source and must be proven in `/ui-showroom` before route usage.

---

## `ui/SubNav.svelte`

Secondary tab navigation with badge counts. Styling is underline-driven and product-dense so sub-page mode switches do not drift back into pill-heavy treatment.

```svelte
<SubNav
    tabs={[
        { label: 'Approvals', value: 'approvals', badge: pendingCount },
        { label: 'Archived', value: 'archived' }
    ]}
    active={currentTab}
    onChange={(tab) => goto(`/org/${orgId}/settings/${tab}`)}
/>
```

Props: `tabs: { label: string; value: string; badge?: number }[]`, `active: string`, `onChange: (value: string) => void`

Sub-nav guidance:

- Use this for page-level mode switches and sibling sub-routes.
- Badge counts are mono status counts, not decorative accents.

---

## `ui/EmptyState.svelte`

Empty list placeholder with optional action button.

```svelte
<EmptyState message="No items yet." />

<!-- With action button -->
<EmptyState message="No types defined." actionLabel="Add Type" onAction={handleAdd} />
<EmptyState message="No results." actionLabel="Browse All" actionHref="/all" />

<!-- Simple variant (italic, no bg) -->
<EmptyState message="Nothing to show." variant="simple" />
```

Props: `message: string`, `variant?: 'box' | 'simple'` (default `'box'`), `actionLabel?: string`, `onAction?: () => void`, `actionHref?: string`

`actionLabel` requires either `onAction` or `actionHref` to render the button.

---

## `ui/FileUpload.svelte`

File upload/download with drag-and-drop. Uses application endpoints for upload, signed download, and removal.

```svelte
<FileUpload
    {filePath}
    uploadUrl={`/org/${orgId}/api/sign-in-rosters/${rosterId}/upload`}
    downloadUrl={`/org/${orgId}/api/sign-in-rosters/${rosterId}/upload`}
    removeUrl={`/org/${orgId}/api/sign-in-rosters/${rosterId}/upload`}
    onUpload={(path) => (filePath = path)}
    onRemove={() => (filePath = null)}
    label="PDF Document"
/>
```

Props: `filePath: string | null`, `uploadUrl: string`, `downloadUrl: string`, `removeUrl: string`, `onUpload: (path: string) => void`, `onRemove: () => void`, `accept?: string` (default `'application/pdf'`), `label?: string` (default `'PDF Document'`), `disabled?: boolean`

**States**: empty (dashed drop zone + "Choose PDF" button), uploading (Spinner + filename), file exists (download link + "Remove" button).
**Endpoint contract**:

- `POST uploadUrl` with `FormData(file)` returns `{ filePath: string }`
- `GET downloadUrl` returns `{ url: string }`
- `DELETE removeUrl` returns `200 OK`

**Storage path convention**: `{orgId}/{scope}/{recordId}/{sanitized-filename}.pdf`

---

## `ui/toolbar`

Typed shared-toolbar package for page-level control and command zones. Use it when a route needs deterministic full, compact, and overflow states without mixing visual style with layout priority.

```svelte
<script lang="ts">
    import {
        Toolbar,
        ToolbarActions,
        ToolbarFilterSelect,
        ToolbarGroup,
        ToolbarMultiSelectFilter,
        ToolbarSearchItem,
        ToolbarViewToggle,
        type ToolbarActionConfig
    } from '$lib/components/ui/toolbar';

    const actions: ToolbarActionConfig[] = [
        {
            id: 'export-csv',
            label: 'Export CSV',
            href: exportHref,
            icon: 'download',
            priority: 'low'
        },
        {
            id: 'record-training',
            label: 'Record Training',
            onclick: openRecordTraining,
            icon: 'clipboard-check',
            priority: 'critical',
            overflow: 'never',
            variant: 'primary',
            disabled: !canRecord,
            disabledReason: !canRecord ? 'Add personnel and active tasks before recording training.' : undefined
        }
    ];
</script>

<Toolbar ariaLabel="Critical Tasks controls" collapse="medium" leadingMin="34rem" compactLeadingWhenCrowded>
    {#snippet leading()}
        <ToolbarGroup label="Critical Tasks filters" activeCount={activeFilterCount}>
            {#snippet full()}
                <ToolbarViewToggle
                    ariaLabel="Critical Tasks matrix view mode"
                    options={matrixViewOptions}
                    mode="full"
                    bind:value={viewMode}
                />
                <ToolbarFilterSelect
                    ariaLabel="Critical Tasks group filter"
                    options={groupFilterOptions}
                    defaultValue=""
                    mode="full"
                    bind:value={selectedGroupId}
                />
                <ToolbarSearchItem
                    mode="full"
                    ariaLabel="Search personnel"
                    placeholder="Search name, rank, or MOS..."
                    bind:value={personnelSearch}
                />
                <ToolbarMultiSelectFilter
                    ariaLabel="Filter by training type"
                    label="Training types"
                    options={trainingTypeOptions}
                    value={selectedTrainingTypeIds}
                    mode="full"
                    onChange={setSelectedTrainingTypeIds}
                />
            {/snippet}
        </ToolbarGroup>
    {/snippet}

    <ToolbarActions
        {actions}
        ariaLabel="Critical Tasks actions"
        overflowAriaLabel="More Critical Tasks actions"
    />
</Toolbar>
```

Public components:

| Component                  | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `Toolbar.svelte`           | Provides the route toolbar shell, measurement boundary, and compact-panel coordination. |
| `ToolbarActions.svelte`    | Measures and renders the action zone with generated overflow.              |
| `ToolbarAction.svelte`     | Renders one anchor or button action in full or compact mode.                |
| `ToolbarSearchItem.svelte` | Renders page-owned search as a full input or compact trigger with an inline panel. |
| `ToolbarGroup.svelte`      | Renders a stateful-control group boundary, active count, compact trigger, and panel. |
| `ToolbarNavGroup.svelte`   | Renders related navigation links, including active state, without command overflow. |
| `ToolbarMetaItem.svelte`   | Renders passive status/count/date text as non-command toolbar content.      |
| `ToolbarMetricGroup.svelte` | Renders passive compact metric summaries as non-command toolbar content.   |
| `ToolbarFilterSelect.svelte` | Renders a select filter as a full select or compact trigger/panel.        |
| `ToolbarMultiSelectFilter.svelte` | Renders a multi-select filter as tag input or compact active-count panel. |
| `ToolbarViewToggle.svelte` | Renders a segmented mode switch as a full control or compact trigger/panel. |
| `ToolbarToggle.svelte`     | Renders a boolean state toggle for compact toolbar filter groups.          |
| `toolbarLayout.ts`         | Pure deterministic layout utility for full/compact/overflow states.         |

Policy fields:

| Field            | Type                                         | Notes                                                              |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `priority?`      | `'low' \| 'normal' \| 'high' \| 'critical'`  | Layout yield order only; it does not change color or emphasis.     |
| `displayMode?`   | `'auto' \| 'full' \| 'compact'`              | `auto` allows icon-capable actions to compact before overflowing.   |
| `overflow?`      | `'auto' \| 'always' \| 'never'`              | `always` keeps commands in generated overflow; `never` keeps protected actions visible and warns if impossible. |
| `variant?`       | `'default' \| 'primary' \| 'secondary' \| 'danger'` | Visual style only; keep this separate from priority.        |
| `disabledReason?` | `string`                                    | Rendered through full, compact, and overflow paths for assistive tech and menu context. |

`ToolbarAction` accepts `href`, `onclick`, or `menuItems`. In development it warns when both `href` and `onclick` are supplied, or when none of those command targets are supplied. Compact icon actions keep their accessible name through `aria-label` and `title`.

`Toolbar` owns the measurement boundary. Keep stateful controls in its `leading` snippet and route actions in its child action slot. Use `searchCompactAt` when search should become an icon before the entire filter group collapses. Use `compactLeadingWhenCrowded` for single-row workspaces where the leading group should collapse based on measured width before actions overlap.

`ToolbarSearchItem` keeps search state page-owned through `bind:value`. Use default `mode="auto"` in a toolbar row when search should become its own compact search trigger, and use `mode="full"` in a `ToolbarGroup` panel so the opened panel contains an editable input. Compact mode opens an inline panel by default, keeps the same search binding, exposes active trigger hooks through `data-search-active` and `toolbar-search-item__trigger--active`, and closes with Escape.

`ToolbarGroup` keeps stateful controls out of command overflow. Use it for filter, search, toggle, and view groups that should collapse into a trigger plus panel instead of moving into `ToolbarOverflowMenu`. `activeCount` should count active state inside the group, including search text when search lives in the group.

`ToolbarNavGroup` keeps tab, back, and related-page navigation as links. Use it for route navigation that should remain keyboard-accessible and should not collapse into command overflow. Mark the current item with `active`; the component renders `aria-current="page"`.

`ToolbarMetaItem` keeps passive toolbar content from masquerading as a command. Use it for counts, dates, retention notes, pending state, and read-only notices. It renders as status text, not a button or link.

`ToolbarMetricGroup` keeps compact status ledgers out of command overflow. Use it for small read-only metric clusters such as overdue/due-soon evaluation counts where each metric needs a value, label, and optional semantic color.

`ToolbarFilterSelect` preserves ordinary select behavior in full mode and exposes active state in compact mode when `value !== defaultValue`. `ToolbarMultiSelectFilter` wraps `MultiTagSelect` for toolbar-owned filter clusters; compact mode shows an active selected-count trigger and opens the same tag selector in an inline panel. `ToolbarViewToggle` preserves segmented-control behavior and keeps the current mode in the compact trigger label, `aria-label`, and `title`.

Use `ToolbarMultiSelectFilter maxWidth` when a tag input should grow inside the toolbar but stop before crowding the action zone. In full mode, the control flexes up to that width and keeps selected tags on one line so the toolbar row stays stable.

Icon names are intentionally small and map to lucide icons: `download`, `upload`, `settings`, `calendar-days`, `book-open`, `chart`, `clipboard-check`, `clipboard-list`, and `printer`. Add new names in `ToolbarIcon.svelte` when a migration needs them.

Final route API:

- Route-level toolbars use the shared `Toolbar` shell.
- Route commands use `ToolbarActions`; action overflow is generated by the shared family.
- Leading route state uses `ToolbarSearchItem`, `ToolbarFilterSelect`, `ToolbarViewToggle`, `ToolbarToggle`, `ToolbarMultiSelectFilter`, and `ToolbarGroup`.
- Navigation, status, and metrics use `ToolbarNavGroup`, `ToolbarMetaItem`, and `ToolbarMetricGroup`.
- `ToolbarSearch` and `ToolbarSelect` remain low-level implementation building blocks for the shared family.
- Deferred: true sheet-mode compact panels and a shared tooltip primitive.

---

## `ui/OverflowMenu.svelte`

Controlled dropdown menu. Used as an escape hatch for per-row menus and other local menu surfaces. The parent manages `open` state.

```svelte
<script>
    let menuOpen = $state(false);
</script>

<div style="position: relative">
    <button onclick={() => (menuOpen = !menuOpen)}>⋮</button>
    <OverflowMenu
        {items}
        open={menuOpen}
        onClose={() => (menuOpen = false)}
        align="right"
    />
</div>
```

Props: `items: OverflowItem[]`, `open: boolean`, `onClose: () => void`, `align?: 'left' | 'right'` (default `'right'`)

`OverflowItem` shape: `label: string`, `onclick?: () => void`, `href?: string`, `toggle?: boolean`, `active?: boolean` (shows checkmark when `toggle && active`), `divider?: boolean` (renders a separator line above this item), `group?: string` (renders a group label above), `danger?: boolean` (red text), `disabled?: boolean`, `disabledReason?: string`

Import type: `import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte'`

---

## `ui/InlineNotes.svelte`

Collapsible inline notes thread with add-note input. Used for per-record notes within a form or detail view.

```svelte
<InlineNotes
    {notes}
    resolveAuthor={(userId) => personnelMap[userId]?.name ?? 'Unknown'}
    onAddNote={(text) => addNote(recordId, text)}
/>

<!-- Read-only -->
<InlineNotes {notes} resolveAuthor={resolveAuthor} disabled />
```

Props: `notes: { text: string; timestamp: string; userId: string }[]`, `resolveAuthor: (userId: string) => string`, `onAddNote?: (text: string) => void`, `disabled?: boolean` (default `false`)

- Collapsed by default; shows note count in toggle
- Enter submits (Shift+Enter for newline)
- Omit `onAddNote` for read-only display

---

## Skeleton Components

Use for loading states in pages that use `defer: true` streaming loads.

```svelte
import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
import SkeletonLine from '$lib/components/ui/SkeletonLine.svelte';
import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';

<!-- Block: card, image, hero area -->
<SkeletonBlock width="100%" height="120px" borderRadius="8px" />

<!-- Line: text, labels -->
<SkeletonLine width="60%" height="1em" />

<!-- Grid: table/matrix skeleton -->
<SkeletonGrid rows={5} columns={4} cellWidth="120px" cellHeight="38px" />
```

**SkeletonBlock** props: `width?: string` (default `'100%'`), `height?: string` (default `'80px'`), `borderRadius?: string`

**SkeletonLine** props: `width?: string` (default `'100%'`), `height?: string` (default `'1em'`)

**SkeletonGrid** props: `rows?: number` (default `3`), `columns?: number` (default `5`), `cellWidth?: string` (default `'100px'`), `cellHeight?: string` (default `'38px'`), `gap?: string` (default `var(--spacing-sm)`)

All three use the `.skeleton-pulse` animation class and are `aria-hidden`.

---

## `ui/data-table/DataTable.svelte`

Visual table component with sorting, search, pagination, grouping, and custom cell rendering. The refreshed table uses mono headers, restrained row rules, keyboard-reachable sort buttons, and document-style group toggles.

```svelte
<!-- Simple usage -->
<DataTable data={items} columns={columns} ariaLabel="Items table" />

<!-- With custom cell rendering -->
<DataTable data={entries} {columns} onRowClick={(row) => edit(row)} compact striped>
    {#snippet cell(row, col)}
        {#if col.key === 'status'}
            <Badge label={row.status} color={statusColor(row)} />
        {:else}
            {String(col.value(row) ?? '')}
        {/if}
    {/snippet}
</DataTable>

<!-- With external useDataTable instance -->
<DataTable table={myTable} ariaLabel="Custom table" />
```

Props: `data?: T[]`, `columns?: ColumnDef<T>[]` (required when `data` is used; omit when `table` is provided), `table?: DataTableState<T>`, `initialSortKey?: string`, `initialSortDirection?: SortDirection`, `pageSize?: number`, `groupBy?: GroupDef<T>`, `filterFn?: (row: T, query: string) => boolean`, `ariaLabel?: string`, `emptyMessage?: string`, `showSearch?: boolean`, `searchPlaceholder?: string`, `rowKey?: (row: T, index: number) => string | number`, `onRowClick?: (row: T) => void`, `rowActionLabel?: (row: T) => string`, `compact?: boolean`, `striped?: boolean`, `stickyHeader?: boolean`, `stickyFirstColumn?: boolean`, `maxHeight?: string`

Snippets: `cell?: (row: T, col: ColumnDef<T>)`, `row?: (row: T, cols: ColumnDef<T>[])`, `headerCell?: (col: ColumnDef<T>)`, `groupHeader?: (ctx: GroupHeaderContext)`, `toolbar?: (table: DataTableState<T>)`, `footer?: (table: DataTableState<T>)`

Import: `import { DataTable } from '$lib/components/ui/data-table';`

Table guidance:

- Use the built-in header sort buttons instead of rolling your own sortable chrome.
- Prefer custom `cell` snippets for semantic emphasis such as person-name columns, badges, or actions.
- Provide `rowKey` when rows do not have a unique `id`, or when repeated row references need stable identity.
- Mark action/display-only columns with `sortable: false`; provide `rowActionLabel` when rows can be opened with click or keyboard.
- Reserve `striped` for especially dense matrix-like views; default tables now intentionally rely on rules and hover states instead.

---

## `ui/data-table/useDataTable`

Headless composable for table logic (sorting, filtering, pagination, grouping). Use directly for matrix/custom table layouts that need DataTable logic without the visual component.

**Reactivity note:** `data` is reactive when passed as a closure. `columns` may be passed as an array or getter, and `groupBy` may be a getter when grouping must track parent state. Initial sort and page size options are captured once at initialization. Pagination is automatically hidden when `groupBy` is active.

```typescript
import { useDataTable } from '$lib/components/ui/data-table/useDataTable.svelte';
import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';

const columns: ColumnDef<MyRow>[] = [
    { key: 'name', header: 'Name', value: (r) => r.name, compare: (a, b) => a.name.localeCompare(b.name) },
    { key: 'count', header: 'Count', value: (r) => r.count }
];

const table = useDataTable({
    data: () => myReactiveData,
    columns,
    initialSortKey: 'name',
    groupBy: { key: (r) => r.category, label: (k) => k }
});

// table.rows, table.toggleSort('name'), table.setSearch('query')
```

`ColumnDef<T>`: `key: string`, `header: string`, `value: (row: T) => unknown`, `headerAriaLabel?: string`, `searchValue?: (row: T) => string`, `compare?: (a: T, b: T) => number`, `searchable?: boolean`, `sortable?: boolean`

`DataTableState<T>` provides: `rows`, `groups`, `totalRows`, `totalPages`, `sortKey`, `sortDirection`, `search`, `page`, `pageSize`, `toggleSort()`, `setSearch()`, `setPage()`, `toggleGroup()`, `expandAll()`, `collapseAll()`

---

## CSS Design System (`app.css`)

### Canonical Tokens

New work should use the canonical design-system tokens from `src/app.css`. Additional design system information can be found in `/trooptotask-design-system.md`

### Palette

Light mode:
`--ink` | `--ink-60` | `--ink-35` | `--ink-15` | `--ink-06` | `--ink-03` | `--paper` | `--white`

Dark mode remaps the same token names through `:root[data-theme='dark']`.

Accent + semantic states:
`--amber` | `--amber-light` | `--amber-dark` | `--amber-vivid` | `--success` / `--success-bg` | `--danger` / `--danger-bg` | `--info` / `--info-bg`

### Typography

`--font-display: 'Barlow Condensed'`
`--font-body: 'Source Serif 4'`
`--font-mono: 'IBM Plex Mono'`

Primary scale:
`--text-xs` | `--text-sm` | `--text-base` | `--text-lg` | `--text-xl` | `--text-2xl` | `--text-3xl`

### Spacing / Border / Elevation

Spacing:
`--sp-1: 4px` | `--sp-2: 8px` | `--sp-3: 12px` | `--sp-4: 16px` | `--sp-6: 24px` | `--sp-8: 32px` | `--sp-12: 48px`

Borders and radius:
`--border-thin` | `--border-rule` | `--radius-sm: 2px` | `--radius-md: 4px` | `--radius-lg: 6px`

Elevation:
`--shadow-sm` | `--shadow-md` | `--shadow-lg`

Focus:
`--focus-outline` | `--focus-ring`

### Cleanup Status

The migration alias bridge has been removed from `src/app.css`. New work should use canonical tokens directly instead of older `--color-*`, `--spacing-*`, `--font-size-*`, or `--shadow-*` compatibility names.

### Chrome / App Shell Tokens

Semantic tokens for the header, nav, and app shell. Dark by default, theme-controllable.

| Token                       | Purpose                          |
| --------------------------- | -------------------------------- |
| `--color-chrome`            | App shell background             |
| `--color-chrome-text`       | App shell text                   |
| `--color-chrome-text-muted` | App shell secondary text         |
| `--color-chrome-border`     | App shell borders                |
| `--color-chrome-active`     | Active nav item (`var(--amber)`) |

### Form Field Tokens

| Token                  | Purpose                 |
| ---------------------- | ----------------------- |
| `--field-bg`           | Input background        |
| `--field-border`       | Input border            |
| `--field-border-focus` | Focused input border    |
| `--field-label`        | Label text color        |
| `--field-error`        | Error text/border color |
| `--field-help`         | Hint text color         |

### Toolbar Tokens

`--toolbar-bg` | `--toolbar-border`

### Compact UI Tokens

These are canonical density helpers retained after the cleanup because they express product-specific sizing, not migration scaffolding.

`--text-ui-sm: 0.75rem` | `--text-ui-base: 1rem` | `--text-ui-xl: 1.25rem`
`--radius-pill: 9999px`
`--divider-color`
`--danger-tint`

### Opacity Scale

| Token              | Value  | Use case                         |
| ------------------ | ------ | -------------------------------- |
| `--opacity-subtle` | `0.08` | Hover states, tints              |
| `--opacity-light`  | `0.12` | Chip backgrounds, light overlays |
| `--opacity-medium` | `0.15` | Active states                    |
| `--opacity-heavy`  | `0.45` | Disabled states                  |

### #454 Grep Allowlist

If you run the hard-exit grep from issue `#454`, the expected matches are canonical tokens only:

- `--color-chrome*`
- `--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-pill`
- `--shadow-sm` / `--shadow-md` / `--shadow-lg`
- `--text-ui-sm` / `--text-ui-base` / `--text-ui-xl`
- `--divider-color`
- `--danger-tint`

Reason for retention:
These tokens are part of the current design system and still have active consumers across the authenticated shell, dense reporting surfaces, toast/menu primitives, and compact utility layouts.

Current consumer groups:
Public shell chrome, authenticated app chrome, dense calendar/duty-roster reports, shared utility components, and notification/toast surfaces.

Follow-up removal issue:
None. These are canonical tokens, not temporary aliases.

### Utility Classes

```css
.spacer        /* flex: 1 — pushes footer actions apart */
.text-primary / .text-muted / .text-error / etc.
.bg-surface / .bg-surface-variant
.rounded-sm / .rounded-md / .rounded-lg
.section-card  /* padded vertical stack for card/section content */
```

### Page Layout Utilities

```css
.app-page      /* height: 100%; flex column; page root */
.page-scroll   /* flex: 1; overflow-y: auto; padded — scrollable content area */
.page-fill     /* flex: 1; overflow: hidden — non-scrolling content (Calendar, matrix views) */
```

`.page-scroll` padding reduces to `--spacing-sm` on mobile.

### Form Field Utilities

```css
.input-error   /* border-color: var(--field-error) — apply to .input when validation fails */
.field-hint    /* hint text below input */
.field-error   /* error text below input */
.field-support /* inline support row for hint/chip/meta beneath a field */
.field-stack   /* vertical stack for control + support text/chip */
```

### Button Classes

`.btn .btn-primary` | `.btn .btn-secondary` | `.btn .btn-amber` / `.btn .btn-warning` | `.btn .btn-danger` | `.btn .btn-sm`

Button guidance:

- `btn-primary`: dark filled action for the default strong action on product surfaces.
- `btn-amber` / `btn-warning`: reserved signal action for confirms, requests, exports, or actions that need deliberate emphasis.
- `btn-secondary`: restrained outline action for cancel, back, close, and secondary utility actions.
- `btn-danger`: destructive action only.

### Form Classes

`.input` | `.select` | `.label` | `.form-group` | `.form-row` | `.field-stack`

### Section Card Tokens

`--section-card-padding` | `--section-card-gap`
