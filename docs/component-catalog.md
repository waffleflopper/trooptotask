# Component Catalog & CSS Design System

Shared UI primitives live in `src/lib/components/ui/`. Import via `$lib/components/ui/...`.
Layout components (Modal, PageToolbar) live in `src/lib/components/`. Import via `$lib/components/...`.

---

## `PageToolbar.svelte`

Page header toolbar with title, actions, breadcrumbs, and variant support.

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

Props: `title: string`, `helpTopic?: string`, `overflowItems?: OverflowItem[]`, `variant?: 'default' | 'compact' | 'transparent'`, `sticky?: boolean`, `breadcrumbs?: { label: string; href?: string }[]`, `subtitle?: string`, `children?: Snippet` (actions), `leading?: Snippet`, `below?: Snippet`

---

## `Modal.svelte`

Base modal wrapper. Use for all modals. Default width is `480px`.

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

**Modal footer convention**: `[Delete] [spacer] [Cancel] [Save]`

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

Colored label pill.

```svelte
<Badge label="CPR/BLS" color="var(--color-info)" />
<Badge label="Leave" color={status.color} textColor={status.textColor} />
<Badge label="ADMIN" color="var(--color-info)" bold={true} />
<Badge label="Freeform" variant="outlined" />
```

Props: `label: string`, `color?: string`, `textColor?: string` (default `'white'`), `bold?: boolean`, `variant?: 'filled' | 'outlined'`

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

Labeled form field with error/hint states and accessibility wiring.

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

**Children escape hatch**: When using `children`, manually wire `aria-describedby="{id}-error"` or `"{id}-hint"` on your custom input — FormField renders those spans but can't auto-apply them to custom children.

---

## `ui/SearchSelect.svelte`

Searchable single-select with keyboard navigation and clear button. Use when `<select>` is too limiting.

```svelte
<SearchSelect
	options={personnel.map((p) => ({ value: p.id, label: p.name }))}
	bind:value={selectedId}
	placeholder="Search personnel..."
	onchange={(v) => console.log(v)}
/>
```

Props: `options: { value: string; label: string }[]`, `value: string` (bindable), `placeholder?: string` (default `'Search...'`), `disabled?: boolean`, `onchange?: (value: string) => void`, `id?: string`

- Typing filters the dropdown; keyboard arrows + Enter to navigate; Escape to close
- Shows a × clear button when a value is selected
- Clears to `''` when cleared

---

## `ui/SubNav.svelte`

Secondary tab navigation with badge counts.

```svelte
<SubNav
	tabs={[
		{ label: 'Approvals', value: 'approvals', badge: pendingCount },
		{ label: 'Archived', value: 'archived' }
	]}
	active={currentTab}
	onChange={(tab) => goto(`/org/${orgId}/admin/${tab}`)}
	variant="underline"
/>
```

Props: `tabs: { label: string; value: string; badge?: number }[]`, `active: string`, `onChange: (value: string) => void`, `variant?: 'underline' | 'pill'` (default `'underline'`)

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

File upload/download with drag-and-drop. Uses Supabase storage (`counseling-files` bucket).

```svelte
<FileUpload
	{filePath}
	{orgId}
	storagePath={uploadId}
	onUpload={(path) => (filePath = path)}
	onRemove={() => (filePath = null)}
	label="PDF Document"
/>
```

Props: `filePath: string | null`, `orgId: string`, `storagePath: string`, `onUpload: (path: string) => void`, `onRemove: () => void`, `accept?: string` (default `'application/pdf'`), `label?: string` (default `'PDF Document'`), `disabled?: boolean`

**States**: empty (dashed drop zone + "Choose PDF" button), uploading (Spinner + filename), file exists (download link + "Remove" button).
**Storage path convention**: `{orgId}/{storagePath}/{sanitized-filename}`

---

## `ui/SmartToolbar.svelte`

Declarative action toolbar that renders buttons, icon-buttons, dropdown menus, and an overflow "More" menu. In `narrow` mode all items collapse into the overflow menu.

```svelte
<SmartToolbar
	items={[
		{ type: 'button', label: 'Export', onclick: handleExport },
		{ type: 'icon-button', label: 'Settings', icon: settingsIconSvg, onclick: openSettings },
		{
			type: 'dropdown',
			label: 'Add',
			items: [
				{ label: 'Single', onclick: addOne },
				{ label: 'Bulk Import', href: '/import' }
			]
		},
		{ type: 'overflow', label: 'Archive', onclick: handleArchive }
	]}
	narrow={isMobile}
/>
```

Props: `items: SmartToolbarItem[]`, `narrow?: boolean` (default `false`)

`SmartToolbarItem` shape:

| Field | Type | Description |
|---|---|---|
| `type` | `'button' \| 'dropdown' \| 'icon-button' \| 'overflow'` | Render style |
| `label` | `string` | Button text or aria-label for icon-buttons |
| `id?` | `string` | Key for dropdown open/close tracking (defaults to label) |
| `icon?` | `string` | SVG markup (use `{@html}` internally — must be trusted app content) |
| `href?` | `string` | Renders as `<a>` instead of `<button>` |
| `onclick?` | `() => void` | Click handler |
| `disabled?` | `boolean` | |
| `items?` | `DropdownItem[]` | Sub-items for `type: 'dropdown'` |

`type: 'overflow'` items always appear in the "More" dropdown. In `narrow` mode, all non-overflow items also collapse into it.

Import types: `import type { SmartToolbarItem, DropdownItem } from '$lib/components/ui/SmartToolbar.svelte'`

---

## `ui/OverflowMenu.svelte`

Controlled dropdown menu. Used as an escape hatch when SmartToolbar doesn't fit (e.g. per-row menus in a table). The parent manages `open` state.

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

`OverflowItem` shape: `label: string`, `onclick?: () => void`, `href?: string`, `toggle?: boolean`, `active?: boolean` (shows checkmark when `toggle && active`), `divider?: boolean` (renders a separator line above this item), `group?: string` (renders a group label above), `danger?: boolean` (red text), `disabled?: boolean`

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

Visual table component with sorting, search, pagination, grouping, and custom cell rendering.

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

Props: `data?: T[]`, `columns: ColumnDef<T>[]`, `table?: DataTableState<T>`, `initialSortKey?: string`, `initialSortDirection?: SortDirection`, `pageSize?: number`, `groupBy?: GroupDef<T>`, `filterFn?: (row: T, query: string) => boolean`, `ariaLabel?: string`, `emptyMessage?: string`, `showSearch?: boolean`, `searchPlaceholder?: string`, `onRowClick?: (row: T) => void`, `compact?: boolean`, `striped?: boolean`, `stickyHeader?: boolean`, `stickyFirstColumn?: boolean`, `maxHeight?: string`

Snippets: `cell?: (row: T, col: ColumnDef<T>)`, `row?: (row: T, cols: ColumnDef<T>[])`, `headerCell?: (col: ColumnDef<T>)`, `groupHeader?: (ctx: GroupHeaderContext)`, `toolbar?: (table: DataTableState<T>)`, `footer?: (table: DataTableState<T>)`

Import: `import { DataTable } from '$lib/components/ui/data-table';`

---

## `ui/data-table/useDataTable`

Headless composable for table logic (sorting, filtering, pagination, grouping). Use directly for matrix/custom table layouts that need DataTable logic without the visual component.

**Reactivity note:** Only `data` is reactive (passed as a closure). All other options are captured once at initialization. Pagination is automatically hidden when `groupBy` is active.

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

`ColumnDef<T>`: `key: string`, `header: string`, `value: (row: T) => unknown`, `searchValue?: (row: T) => string`, `compare?: (a: T, b: T) => number`, `searchable?: boolean`

`DataTableState<T>` provides: `rows`, `groups`, `totalRows`, `totalPages`, `sortKey`, `sortDirection`, `search`, `page`, `pageSize`, `toggleSort()`, `setSearch()`, `setPage()`, `toggleGroup()`, `expandAll()`, `collapseAll()`

---

## CSS Design System (`app.css`)

### Spacing (8px grid)

`--spacing-2xs: 2px` | `--spacing-xs: 4px` | `--spacing-sm: 8px` | `--spacing-md: 16px` | `--spacing-lg: 24px` | `--spacing-xl: 32px`

### Colors

- **Primary**: `--color-primary: #b8943e` (brass)
- **Surface**: `--color-bg`, `--color-surface`, `--color-surface-variant`
- **Text**: `--color-text`, `--color-text-secondary`, `--color-text-muted`
- **Border**: `--color-border`, `--color-divider`
- **Status**: `--color-success`, `--color-warning`, `--color-error`, `--color-info`

### Chrome / App Shell Tokens

Semantic tokens for the header, nav, and app shell. Dark by default, theme-controllable.

| Token | Purpose |
|-------|---------|
| `--color-chrome` | App shell background |
| `--color-chrome-text` | App shell text |
| `--color-chrome-text-muted` | App shell secondary text |
| `--color-chrome-border` | App shell borders |
| `--color-chrome-active` | Active nav item (`var(--color-primary)`) |

### Form Field Tokens

| Token | Purpose |
|-------|---------|
| `--field-bg` | Input background |
| `--field-border` | Input border |
| `--field-border-focus` | Focused input border |
| `--field-label` | Label text color |
| `--field-error` | Error text/border color |
| `--field-help` | Hint text color |

### Toolbar Tokens

`--toolbar-bg` | `--toolbar-border`

### Opacity Scale

| Token | Value | Use case |
|-------|-------|----------|
| `--opacity-subtle` | `0.08` | Hover states, tints |
| `--opacity-light` | `0.12` | Chip backgrounds, light overlays |
| `--opacity-medium` | `0.15` | Active states |
| `--opacity-heavy` | `0.45` | Disabled states |

### Typography

`--font-size-xs: 11px` | `--font-size-sm: 12px` | `--font-size-base: 14px` | `--font-size-lg: 16px`

### Border Radius

`--radius-sm: 4px` | `--radius-md: 8px` | `--radius-lg: 12px` | `--radius-full: 9999px`

### Utility Classes

```css
.spacer        /* flex: 1 — pushes footer actions apart */
.text-primary / .text-muted / .text-error / etc.
.bg-surface / .bg-surface-variant
.rounded-sm / .rounded-md / .rounded-lg
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

`.btn .btn-primary` | `.btn .btn-secondary` | `.btn .btn-danger` | `.btn .btn-sm`

### Form Classes

`.input` | `.select` | `.label` | `.form-group` | `.form-row` | `.field-stack`
