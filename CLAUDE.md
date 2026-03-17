# TroopToTask — Claude Code Context

## Project Overview

Military unit management SaaS: personnel tracking, calendar/availability, training records, counseling (leader's book), daily assignments, onboarding workflows, unit management.

**Stack**: SvelteKit 2.5 + Svelte 5 (runes), TypeScript, Supabase (Postgres + Auth), no Tailwind — pure CSS variables, Vercel deployment.

---

## Do Not

- Reset, run migrations on, delete tables, delete entries, or touch the remote production database. I will manually run any migrations or sql code.
- Reset or delete tables from the local development database. If there's something wrong that requires it to be deleted or reset, you must ask for my permission first no matter what.

## File Organization

```
src/
  app.css                    — global design system + utility classes
  features/
    training/                — training types, matrix, reports, bulk import
    personnel/               — personnel CRUD, bulk import, extended info
    calendar/                — calendar views, availability, status, assignments
    counseling/              — counseling records, rating scheme, leaders book
    onboarding/              — onboarding workflows, templates
    duty-roster/             — duty roster generation
    sign-in-rosters/         — sign-in roster generation
    groups/                  — group/member management
  lib/
    components/ui/           — shared primitives (Badge, Spinner, EmptyState, FileUpload)
    components/              — shared layout components (Modal, PageToolbar, TopHeader, etc.)
    server/                  — shared server infra (permissions, validation, rate limiting)
    stores/                  — shared cross-cutting stores (groups, subscription, theme, etc.)
    types.ts                 — shared types (Personnel, permissions, ranks)
    utils/                   — shared utils (dates, csvParser, deletionRequests)
  routes/
    org/[orgId]/             — main app (thin shells importing from features)
    auth/                    — login/callback
    billing/                 — subscription
```

**Path aliases**: `$features/*` → `src/features/*`, `$lib/*` → `src/lib/*`

Each feature module contains its own `components/`, `stores/`, `utils/`, and types file. Import feature code via `$features/feature-name/...`.

---

## Customer Facing Updates

We will keep customers updated via a "What's New" feature by adding information to `/src/lib/data/changelog.ts`. Only keep ~5 entires, old ones can fall off so the user doesn't have a huge scrolling modal to look at.

Use plain language and only update file for new/improved features or bug fixes that affect customers. Humorous quips are okay (e.g. improved the menu systems so it no longer requires a four year degree to figure out how to use it).

Not a technical report. Can group things together before making the plain language statement - e.g. changing four different queries or api calls to improve speed can become "Improved overall site speed and performance" - or - changing how bulk imports functioned becomes "Improved the overall experience of using bulk imports. Users should now find it to be more intuitive and easier to use".

---

## Svelte 5 Runes Conventions

```svelte
<script lang="ts">
  // Props
  let { foo, bar = 'default' }: Props = $props();

  // State
  let count = $state(0);

  // Derived
  const doubled = $derived(count * 2);
  const complex = $derived.by(() => { ... });

  // Side effects
  $effect(() => { ... });
</script>

<!-- Snippets (replacing slots) -->
{#snippet footer()}
	<button>Cancel</button>
{/snippet}
```

---

## Component Catalog

### `Modal.svelte`

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

### `ui/Badge.svelte`

Colored label pill. Replaces `.type-badge`, `.status-badge`, `.role-badge`, etc.

```svelte
<Badge label="CPR/BLS" color="#3b82f6" />
<Badge label="Leave" color={status.color} textColor={status.textColor} />
<Badge label="ADMIN" color="#3b82f6" bold={true} />
<Badge label="Freeform" variant="outlined" />
```

Props: `label: string`, `color?: string`, `textColor?: string` (default `'white'`), `bold?: boolean`, `variant?: 'filled' | 'outlined'`

### `ui/Spinner.svelte`

Loading spinner for async buttons.

```svelte
<button disabled={saving}>
	{#if saving}<Spinner />{/if}
	{saving ? 'Saving...' : 'Save'}
</button>
```

Props: `size?: number` (px, default 14), `color?: string` (default `'white'`)

### `ui/EmptyState.svelte`

Empty list placeholder.

```svelte
<EmptyState message="No items yet." />
<!-- box variant -->
<EmptyState message="No items defined yet." variant="simple" />
<!-- italic, no bg -->
```

Props: `message: string`, `variant?: 'box' | 'simple'` (default `'box'`)

### `ui/FileUpload.svelte`

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

---

## Async Operations Pattern

```typescript
let saving = $state(false);

async function handleSave() {
	if (!canSave || saving) return;
	saving = true;
	try {
		await store.update(id, data);
		onClose();
	} finally {
		saving = false;
	}
}
```

---

## Component Usage Map

| Component                 | Uses Badge   | Uses Spinner | Uses EmptyState | Uses FileUpload |
| ------------------------- | ------------ | ------------ | --------------- | --------------- |
| TrainingTypeManager       | ✓            | —            | ✓ (simple)      | —               |
| StatusTypeManager         | ✓            | —            | ✓ (box)         | —               |
| AssignmentTypeManager     | ✓ (bold)     | —            | ✓ (box)         | —               |
| CounselingTypeManager     | ✓ + outlined | —            | ✓ (simple)      | ✓               |
| PersonStatusModal         | ✓            | ✓            | —               | —               |
| CounselingRecordModal     | —            | ✓            | —               | ✓               |
| TrainingRecordModal       | ✓            | —            | —               | —               |
| AvailabilityModal         | ✓            | —            | —               | —               |
| OrganizationMemberManager | ✓            | —            | —               | —               |
