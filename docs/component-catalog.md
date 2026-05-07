# Component Catalog & CSS Design System

Shared UI primitives live in `src/lib/components/ui/`. Import via `$lib/components/ui/...`.
Layout components such as `Modal` live in `src/lib/components/`. Import via `$lib/components/...`.
Public marketing primitives live in `src/lib/components/public/`. Import via `$lib/components/public/...`.

---

## UI Foundation Showroom

Development route: `/ui-showroom`

The showroom is the only approved preview and calibration surface for the shadcn-svelte + Tailwind v4 migration foundation. It is development-only and returns 404 outside `dev` mode.

Use it to review shadcn-svelte primitives at desktop and mobile widths before production route migration work starts. The route renders docs-style examples of the selected foundation set: button, button group, input, input group, sidebar, navigation menu, label, textarea, select, checkbox, switch, radio group, badge, alert, dialog, sheet, popover, dropdown menu, tooltip, command, combobox, tabs, table, pagination, calendar/date picker, chart, skeleton, progress, spinner, empty, and separator.

Replacement previews:

- Production DataTable surfaces use the shadcn-svelte `ui/data-table` foundation shown in this showroom.
- Legacy `toolbar` is represented by the shadcn-composed `ui/workspace-toolbar` example using `input-group`, `select`, `button-group`, `button`, and `dropdown-menu`.
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
- `/ui-showroom` must not import legacy TroopToTask component wrappers such as the old toolbar family, `EmptyState`, `FileUpload`, `SearchSelect`, `MultiTagSelect`, or `Spinner`; show their shadcn replacements only.
- The current dark-mode source remains `documentElement[data-theme]`; Tailwind v4 dark variants also support `.dark` during the transition for shadcn compatibility.

Foundation files:

- `components.json` initializes shadcn-svelte with `ui` pointed at `$lib/components/ui`.
- `src/lib/utils.ts` provides the shadcn `cn` helper and element-ref utility types.
- `src/app.css` imports Tailwind v4 and exposes native shadcn/Tailwind theme variables without mapping them to TroopToTask colors yet.
- `src/lib/components/ui/showroom/showroomInventory.ts` records the selected component set and state coverage.

Implementation note: the current `shadcn-svelte@1.2.7` CLI generated the supported `nova` style. The RFC mentioned `new-york` based on the docs available when written; `components.json` records the implementation-time CLI result so future `shadcn-svelte add` runs stay consistent.

---

## `ui/workspace-toolbar`

`ui/workspace-toolbar` is the shadcn-composed route toolbar target for the UI migration. It is being calibrated in `/ui-showroom` before production routes consume it. It replaces route-local toolbar shells with one shared visual contract built from shadcn-svelte primitives.

```svelte
<script lang="ts">
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as InputGroup from '$lib/components/ui/input-group';
	import { Button } from '$lib/components/ui/button';
</script>

<WorkspaceToolbar.Root ariaLabel="Calendar controls">
	<WorkspaceToolbar.Group label="Calendar view mode">
		<ButtonGroup.Root aria-label="Calendar view mode">
			<Button variant="secondary">Month</Button>
			<Button variant="outline">Long range</Button>
		</ButtonGroup.Root>
	</WorkspaceToolbar.Group>

	<WorkspaceToolbar.Group label="Calendar filters" activeCount={activeFilterCount}>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Filters</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content>Filter controls...</DropdownMenu.Content>
		</DropdownMenu.Root>
	</WorkspaceToolbar.Group>

	<WorkspaceToolbar.Group label="Calendar search" class="min-w-0 shrink">
		<InputGroup.Root class="w-40 sm:w-56">
			<InputGroup.Input type="search" aria-label="Search roster" placeholder="Search..." />
		</InputGroup.Root>
	</WorkspaceToolbar.Group>

	<WorkspaceToolbar.Group label="Calendar actions" zone="actions">
		<Button>Add status</Button>
		<Button variant="outline" size="icon" aria-label="More calendar actions">...</Button>
	</WorkspaceToolbar.Group>
</WorkspaceToolbar.Root>
```

Public components:

- `WorkspaceToolbar.Root`: the shared one-row shell. Props: `ariaLabel: string`, `children?: Snippet`, plus normal `div` attributes. The shell renders `role="toolbar"`, fixed row height, `flex-nowrap`, and horizontal overflow as a last resort. It does not wrap into a second toolbar row.
- `WorkspaceToolbar.Group`: the labeled control/action boundary. Props: `label: string`, `activeCount?: number`, `zone?: 'controls' | 'actions' | 'meta'`, `children?: Snippet`, plus normal `div` attributes. `activeCount` is included in the accessible group label.
- `WorkspaceToolbar.Meta`: compact passive metadata for rare toolbar-safe status. Props: `tone?: 'neutral' | 'warning' | 'success'`, `children?: Snippet`, plus normal `div` attributes. Keep passive route context outside the toolbar unless there is proven room.

Allowed route behavior knobs:

- Labels, placeholders, option data, selected values, search text, active filter counts, disabled/loading state, permissions, and action handlers.
- Which commands stay visible versus move into a `DropdownMenu` overflow.
- Whether a route uses text buttons or icon-only buttons at shared breakpoints.
- Which filters are combined into one filter trigger.

Rules:

- Keep the toolbar as one row. Combine filters early for action-heavy or filter-heavy routes instead of letting controls create a tall two-row toolbar.
- Use shadcn `button-group` for view toggles. Do not build route-local segmented controls for migrated toolbar surfaces.
- Use `DropdownMenu` for command overflow. Commands can overflow; filters and search should stay as stateful controls or combine into a filter trigger.
- Use compact search widths such as `w-40 sm:w-56` unless a route has proven room for wider search.
- Keep disabled actions visible when their presence explains unavailable work. Loading actions should be disabled and show the shared spinner.
- Do not add route-local toolbar spacing, radius, borders, shadows, color, density, typography, or internal selector overrides.
- Do not create a route-specific wrapper to alter toolbar behavior without explicit approval.
- If a route needs behavior this API cannot express, document the design-system gap and extend the shared component/API after proving it in `/ui-showroom`.

Migration guidance:

- Start every migrated route toolbar from `WorkspaceToolbar.Root`, `WorkspaceToolbar.Group`, shadcn `ButtonGroup`, shadcn `Button`, shadcn `DropdownMenu`, and shadcn form primitives.
- Treat the `/ui-showroom` desktop, constrained/mobile, overflow, disabled, loading, selected, filter, search, view-toggle, and icon-only examples as the review baseline.
- Production route migration happens only when explicitly requested. Until then, the showroom is the development ground for this toolbar family.

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

Authenticated production routes now use `ui/workspace-toolbar` plus generated shadcn-svelte primitives. The old `/components/ui/toolbar` family has been removed and must not be reintroduced.

Use `WorkspaceToolbar.Root` as the route toolbar root, `WorkspaceToolbar.Group` for control/action/meta boundaries, shadcn `ButtonGroup` plus `Button` for mutually exclusive view modes, shadcn `Toggle` for independent boolean toolbar state, shadcn `Select`/`InputGroup` through the shared workspace toolbar helpers for filters and search, and `WorkspaceToolbar.Actions` for command buttons plus dropdown overflow.

Routes may pass labels, values, options, permissions, disabled state, and handlers only. Visual changes belong in `src/lib/components/ui/workspace-toolbar/**`, generated shadcn component source, theme tokens, or `/ui-showroom` calibration.

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

Removed. Use `ui/workspace-toolbar` and generated shadcn-svelte primitives instead.

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

## `ui/data-table`

Composable shadcn-svelte DataTable foundation built from the calibrated `ui/table`, `checkbox`, `dropdown-menu`, `skeleton`, `empty`, `button`, and shared toolbar primitives. It is the production DataTable system; the old DataTable implementation and its tests have been removed.

The DataTable API is deliberately modular. Simple tables can render only `DataTable` or `View`; richer tables can opt into search, pagination, row actions, bulk selection, loading, grouping, dense layout, and toolbar controls one piece at a time.

```svelte
<script lang="ts">
    import * as DataTable from '$lib/components/ui/data-table';
    import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
    import type { ColumnDef } from '$lib/components/ui/data-table';

    const columns: ColumnDef<Person>[] = [
        { key: 'name', header: 'Name', value: (row) => row.name },
        { key: 'group', header: 'Group', value: (row) => row.group },
        { key: 'readiness', header: 'Readiness', value: (row) => row.readiness, align: 'right' }
    ];
</script>

<!-- Simple table: no toolbar/search/pagination cost -->
<DataTable.DataTable data={personnel} {columns} ariaLabel="Personnel" />

<!-- Full-featured table -->
<DataTable.DataTable
    data={personnel}
    {columns}
    ariaLabel="Personnel roster"
    showSearch
    pageSize={25}
    onRowClick={(row) => openPerson(row)}
    rowActionLabel={(row) => `Open ${row.name}`}
    compact
    stickyHeader
>
    {#snippet toolbar(table)}
        <WorkspaceToolbar.Root ariaLabel="Personnel table controls">
            <WorkspaceToolbar.Group label="Search" class="min-w-0 shrink">
                <DataTable.Search {table} ariaLabel="Search personnel" />
            </WorkspaceToolbar.Group>
        </WorkspaceToolbar.Root>
    {/snippet}

    {#snippet cell(row, col)}
        {#if col.key === 'status'}
            <Badge variant="secondary">{row.status}</Badge>
        {:else}
            {String(col.value(row) ?? '')}
        {/if}
    {/snippet}
</DataTable.DataTable>
```

Exports:

- `DataTable`: convenience shell that creates an internal `useDataTable` state when `data` and `columns` are passed.
- `Root`: visual table frame for custom composition.
- `View`: renders a `DataTableState<T>` through shared table primitives.
- `Search`: shared search input wired to `DataTableState<T>`.
- `SortableHeader`: header button wired to `toggleSort`.
- `Pagination`: previous/next footer wired to `setPage`.
- `SelectionCheckbox`: row/header checkbox primitive for table selection.
- `BulkActions`: selected-count region for toolbar/bulk commands.
- `RowActions`: shared dropdown-menu row action trigger.
- `Empty`: empty state tuned for table surfaces.
- `Loading`: skeleton row body.
- `useDataTable`: headless sort/filter/pagination/grouping state.
- `useDataTableSelection`: headless row selection and bulk-selection state.

`DataTable` props: `data?: T[]`, `columns?: ColumnDef<T>[]`, `table?: DataTableState<T>`, `initialSortKey?: string`, `initialSortDirection?: SortDirection`, `pageSize?: number`, `groupBy?: GroupDef<T>`, `filterFn?: (row: T, query: string) => boolean`, `ariaLabel?: string`, `emptyMessage?: string`, `showSearch?: boolean`, `searchPlaceholder?: string`, `rowKey?: (row: T, index: number) => string | number`, `onRowClick?: (row: T) => void`, `rowActionLabel?: (row: T) => string`, `disabledRow?: (row: T) => boolean`, `rowDetailVisible?: (row: T) => boolean`, `loading?: boolean`, `loadingRows?: number`, `density?: 'default' | 'dense'`, `compact?: boolean`, `striped?: boolean`, `stickyHeader?: boolean`, `stickyFirstColumn?: boolean`, `maxHeight?: string`

Snippets: `cell?: (row: T, col: ColumnDef<T>)`, `row?: (row: T, cols: ColumnDef<T>[])`, `rowDetail?: (row: T)`, `headerCell?: (col: ColumnDef<T>)`, `groupHeader?: (ctx: GroupHeaderContext)`, `toolbar?: (table: DataTableState<T>)`, `footer?: (table: DataTableState<T>)`

`ColumnDef<T>`: `key`, `header`, `value`, `headerAriaLabel?`, `searchValue?`, `compare?`, `searchable?`, `sortable?`, `align?`, `width?`

`DataTableState<T>` provides: `columns`, `rows`, `allRows`, `groups`, `totalRows`, `totalPages`, `sortKey`, `sortDirection`, `search`, `page`, `pageSize`, `toggleSort()`, `setSearch()`, `setPage()`, `setPageSize()`, `toggleGroup()`, `expandAll()`, `collapseAll()`, `getRowKey()`, `isRowDisabled()`

`useDataTableSelection<T>` provides: `selectedKeys`, `selectedRows`, `selectedCount`, `isSelected()`, `toggleRow()`, `clear()`, `allPageRowsSelected`, `somePageRowsSelected`, `toggleAllPageRows()`

**Reactivity note:** `data` is reactive when passed as a closure. `columns` may be passed as an array or getter, and `groupBy` may be a getter when grouping must track parent state. Initial sort and page size options are captured once at initialization. Pagination is automatically hidden when `groupBy` is active.

```typescript
import { useDataTable, useDataTableSelection } from '$lib/components/ui/data-table';
import type { ColumnDef } from '$lib/components/ui/data-table';

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

Route configuration rules:

- Routes may configure data, columns, cell snippets, labels, row actions, disabled states, expandable row details, filters, search, pagination, grouping, row click handlers, and bulk actions.
- Routes may not override visual appearance through route-local Tailwind classes, CSS selectors, arbitrary spacing/color/radius values, or table-specific wrapper styling.
- If a table needs a new durable visual state or behavior primitive, add it under `src/lib/components/ui/data-table/**`, document it here, and prove it in `/ui-showroom`.
- Use `RowActions` for dropdown row commands and `SelectionCheckbox` plus `useDataTableSelection` for selectable rows.
- Mark action/display-only columns with `sortable: false` and `searchable: false`.
- Provide `rowActionLabel` whenever rows are clickable so keyboard and screen-reader users get a clear action name.
- Use `compact` only for dense operational tables. Use `stickyHeader` and `maxHeight` for constrained workspaces.
- Grouped rows are supported for simple collapsible sections. Operational matrices with sticky axes remain project-specific surfaces, not generic DataTable use.

Migration status:

- Production DataTable routes now use `src/lib/components/ui/data-table`.
- The old DataTable implementation under `src/lib/components/ui/data-table-old` and its tests are removed.
- Operational matrix surfaces with sticky axes or heat-map cells remain project-specific matrix workspaces, not generic DataTable migrations.

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
