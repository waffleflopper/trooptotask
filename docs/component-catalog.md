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

- **Primary**: `--color-primary: #3f51b5` (indigo)
- **Surface**: `--color-bg`, `--color-surface`, `--color-surface-variant`
- **Text**: `--color-text`, `--color-text-secondary`, `--color-text-muted`
- **Border**: `--color-border`, `--color-divider`
- **Status**: `--color-success`, `--color-warning`, `--color-error`, `--color-info`

### Typography

`--font-size-xs: 11px` | `--font-size-sm: 12px` | `--font-size-base: 14px` | `--font-size-lg: 16px`

### Border Radius

`--radius-sm: 4px` | `--radius-md: 8px` | `--radius-lg: 12px` | `--radius-full: 9999px`

### Utility Classes

```css
.spacer        /* flex: 1 — pushes footer actions apart */
.spinner       /* global CSS-only spinner (also Spinner.svelte component) */
.text-primary / .text-muted / .text-error / etc.
.bg-surface / .bg-surface-variant
.rounded-sm / .rounded-md / .rounded-lg
```

### Button Classes

`.btn .btn-primary` | `.btn .btn-secondary` | `.btn .btn-danger` | `.btn .btn-sm`

### Form Classes

`.input` | `.select` | `.label` | `.form-group` | `.form-row`
