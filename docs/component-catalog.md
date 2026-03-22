# Component Catalog & CSS Design System

Shared UI primitives live in `src/lib/components/ui/`. Import via `$lib/components/ui/...`.

---

## `Modal.svelte`

Base modal wrapper. Use for all modals.

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
```

**Modal footer convention**: `[Delete] [spacer] [Cancel] [Save]`

## `ui/Badge.svelte`

Colored label pill. Replaces `.type-badge`, `.status-badge`, `.role-badge`, etc.

```svelte
<Badge label="CPR/BLS" color="var(--color-info)" />
<Badge label="Leave" color={status.color} textColor={status.textColor} />
<Badge label="ADMIN" color="var(--color-info)" bold={true} />
<Badge label="Freeform" variant="outlined" />
```

Props: `label: string`, `color?: string`, `textColor?: string` (default `'white'`), `bold?: boolean`, `variant?: 'filled' | 'outlined'`

## `ui/Spinner.svelte`

Loading spinner for async buttons.

```svelte
<button disabled={saving}>
	{#if saving}<Spinner />{/if}
	{saving ? 'Saving...' : 'Save'}
</button>
```

Props: `size?: number` (px, default 14), `color?: string` (default `'white'`)

## `ui/EmptyState.svelte`

Empty list placeholder.

```svelte
<EmptyState message="No items yet." />
<!-- box variant -->
<EmptyState message="No items defined yet." variant="simple" />
<!-- italic, no bg -->
```

Props: `message: string`, `variant?: 'box' | 'simple'` (default `'box'`)

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

## `ui/data-table/DataTable.svelte`

Visual table component with sorting, search, pagination, grouping, and custom cell rendering.

```svelte
<!-- Simple usage with data + columns -->
<DataTable data={items} columns={columns} ariaLabel="Items table" />

<!-- With cell snippet for custom rendering -->
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

## `ui/data-table/useDataTable`

Headless composable for table logic (sorting, filtering, pagination, grouping). Use directly for matrix/custom table layouts that need DataTable logic without the visual component.

**Reactivity note:** Only `data` is reactive (passed as a closure). All other options (`columns`, `initialSortKey`, `initialSortDirection`, `pageSize`, `groupBy`, `filterFn`) are captured once at initialization. Pagination is automatically hidden when `groupBy` is active.

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

// Use table.rows (sorted/filtered/paged), table.toggleSort('name'), table.setSearch('query')
```

`ColumnDef<T>`: `key: string`, `header: string`, `value: (row: T) => unknown`, `searchValue?: (row: T) => string`, `compare?: (a: T, b: T) => number`, `searchable?: boolean`

`DataTableState<T>` provides: `rows`, `groups`, `totalRows`, `totalPages`, `sortKey`, `sortDirection`, `search`, `page`, `pageSize`, `toggleSort()`, `setSearch()`, `setPage()`, `toggleGroup()`, `expandAll()`, `collapseAll()`

---

## CSS Design System (`app.css`)

### Spacing (8px grid)

`--spacing-xs: 4px` | `--spacing-sm: 8px` | `--spacing-md: 16px` | `--spacing-lg: 24px` | `--spacing-xl: 32px`

### Colors

- **Primary**: `--color-primary: #b8943e` (brass)
- **Surface**: `--color-bg`, `--color-surface`, `--color-surface-variant`
- **Text**: `--color-text`, `--color-text-secondary`, `--color-text-muted`
- **Border**: `--color-border`, `--color-divider`
- **Status**: `--color-success`, `--color-warning`, `--color-error`, `--color-info`

### Chrome / App Shell Tokens

Semantic tokens for the header, nav, and app shell. Dark by default, theme-controllable.

| Token | Light Mode | Purpose |
|-------|-----------|---------|
| `--color-chrome` | `#0f0f0f` | App shell background |
| `--color-chrome-text` | `#f0ede6` | App shell text |
| `--color-chrome-text-muted` | `#8a8780` | App shell secondary text |
| `--color-chrome-border` | `#2a2a2a` | App shell borders |
| `--color-chrome-active` | `var(--color-primary)` | Active nav item |

### Form Field Tokens

Semantic tokens for form fields. Reference these instead of raw color variables.

| Token | Default | Purpose |
|-------|---------|---------|
| `--field-bg` | `var(--color-surface)` | Input background |
| `--field-border` | `var(--color-border)` | Input border |
| `--field-border-focus` | `var(--color-primary)` | Focused input border |
| `--field-label` | `var(--color-text-secondary)` | Label text color |
| `--field-error` | `var(--color-error)` | Error text/border color |
| `--field-help` | `var(--color-text-muted)` | Hint text color |

### Toolbar Tokens

| Token | Default | Purpose |
|-------|---------|---------|
| `--toolbar-bg` | `var(--color-surface)` | Toolbar background |
| `--toolbar-border` | `var(--color-border)` | Toolbar border |

### Opacity Scale

Use instead of hardcoded `rgba()` alpha values.

| Token | Value | Use case |
|-------|-------|----------|
| `--opacity-subtle` | `0.08` | Hover states, tints |
| `--opacity-light` | `0.12` | Chip backgrounds, light overlays |
| `--opacity-medium` | `0.15` | Active states, medium overlays |
| `--opacity-heavy` | `0.45` | Disabled states, heavy overlays |

### Typography

`--font-size-xs: 11px` | `--font-size-sm: 12px` | `--font-size-base: 14px` | `--font-size-lg: 16px`

### Border Radius

`--radius-sm: 4px` | `--radius-md: 8px` | `--radius-lg: 12px` | `--radius-full: 9999px`

### Micro-spacing

`--spacing-2xs: 2px` — for tight gaps (e.g., icon-to-text in compact UI)

### Utility Classes

```css
.spacer        /* flex: 1 — pushes footer actions apart */
.spinner       /* global CSS-only spinner (also Spinner.svelte component) */
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
.field-hint    /* hint text below input (xs size, muted color) */
.field-error   /* error text below input (xs size, error color) */
```

### Button Classes

`.btn .btn-primary` | `.btn .btn-secondary` | `.btn .btn-danger` | `.btn .btn-sm`

### Form Classes

`.input` | `.select` | `.label` | `.form-group` | `.form-row`
