# Component Catalog & CSS Design System

Shared UI primitives live in `src/lib/components/ui/`. Import via `$lib/components/ui/...`.
Layout components (Modal, PageToolbar, FloatingPageToolbar) live in `src/lib/components/`. Import via `$lib/components/...`.
Public marketing primitives live in `src/lib/components/public/`. Import via `$lib/components/public/...`.

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

## `FloatingPageToolbar.svelte`

Compact command surface for primary app routes after the app shell breadcrumb/title has already identified the page. It renders as an aria-labelled toolbar; use it inside the route content area for filters, view toggles, stats, and page actions.

```svelte
<FloatingPageToolbar ariaLabel="Personnel controls" leadingMin="24rem" collapse="medium">
    {#snippet leading()}
        <RosterFilters />
    {/snippet}

    <ProgressiveToolbarActions
        items={toolbarActionItems}
        overflowAriaLabel="More personnel actions"
    />
</FloatingPageToolbar>
```

Props: `ariaLabel: string`, `leadingMin?: string` (default `'18rem'`), `collapse?: 'wide' | 'medium' | 'narrow'` (default `'wide'`), `leading?: Snippet`, `children?: Snippet` (right-side actions), `overflow?: Snippet` (shown at the collapse breakpoint when actions should move into a menu)

Toolbar guidance:

- Use this for the floating page toolbar pattern on Calendar, Personnel, Evals, Onboarding, and similar dense route pages.
- Put filters, toggles, small stat ledgers, or navigation affordances in `leading`.
- Put page actions in the default children slot. When an action set can run out of room, prefer `ProgressiveToolbarActions` so lower-priority actions collapse into `ToolbarOverflowMenu` one by one before the toolbar wraps.
- Choose `collapse="wide"` for complex toolbars, `medium` for roster-style toolbars, and `narrow` when the toolbar only needs to stack on mobile.

Authenticated route anatomy:

- The app shell owns the route label through breadcrumbs, normally `Organization Name > Page`. Do not repeat the same page name as a large in-body route title.
- The route content should start with `FloatingPageToolbar` when it has filters, modes, page navigation, or page actions. Static explanatory text belongs in empty states, notices, or task-specific panels instead.
- Avoid decorative stat boxes that simply repeat visible table/list counts. Keep compact stats only when they drive action, like overdue/60d/30d on Evals.
- Keep primary workflow controls visible when there is room: common filters, search, view modes, and the main create/manage action. Use overflow for secondary, destructive, configuration, or lower-frequency actions.
- Icon-only toolbar actions are allowed only when the icon is familiar for the action and the control has an accessible label plus hover/focus title or tooltip. Prefer text labels for domain-specific actions.

Shared toolbar primitives:

- Use `ui/ToolbarSearch.svelte` for toolbar search inputs. Props: `ariaLabel: string`, `value?: string`, `placeholder?: string`, `testId?: string`, `width?: 'default' | 'wide' | 'full'`, `onValueChange?: (value: string) => void`.
- Use `ui/ToolbarSelect.svelte` for compact toolbar selects. Props: `ariaLabel: string`, `options: { value: string; label: string; disabled?: boolean }[]`, `value?: string`, `width?: 'default' | 'wide'`, `onValueChange?: (value: string) => void`.
- Use `ui/SegmentedControl.svelte` for binary or small mode switches like A-Z/By Group or Grouped/Table. Props: `ariaLabel: string`, `options: { value: string; label: string; disabled?: boolean; title?: string }[]`, `value?: string`, `onValueChange?: (value: string) => void`.
- Use `ui/ProgressiveToolbarActions.svelte` for action sets that should stay on one row as long as possible. Pass items from lowest priority to highest priority; lower-priority leading items move into overflow first while trailing items remain visible longest. Props: `items: { id: string; label: string; href?: string; onclick?: () => void; disabled?: boolean; className?: string }[]`, `overflowAriaLabel: string`, `overflowLabel?: string`, `overflowIconOnly?: boolean`.
- Use `ui/ToolbarOverflowMenu.svelte` when a toolbar needs a standard More button around `OverflowMenu`, or `iconOnly` for compact three-dot overflow when horizontal space is tight. Props: `items: OverflowItem[]`, `ariaLabel: string`, `label?: string`, `iconOnly?: boolean`, `align?: 'left' | 'right'`, `side?: 'bottom' | 'top'`.
- Use `ui/ToolbarIconButton.svelte` for icon-only controls. Props: `label: string`, `title?: string`, `href?: string`, `disabled?: boolean`, `onclick?: () => void`, `children?: Snippet`. The visible child should be an icon; the label is required for assistive technology.

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

## `ui/SubNav.svelte`

Secondary tab navigation with badge counts. Styling is underline-driven and product-dense so sub-page mode switches do not drift back into pill-heavy treatment.

```svelte
<SubNav
    tabs={[
        { label: 'Approvals', value: 'approvals', badge: pendingCount },
        { label: 'Archived', value: 'archived' }
    ]}
    active={currentTab}
    onChange={(tab) => goto(`/org/${orgId}/admin/${tab}`)}
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

| Field       | Type                                                    | Description                                                         |
| ----------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| `type`      | `'button' \| 'dropdown' \| 'icon-button' \| 'overflow'` | Render style                                                        |
| `label`     | `string`                                                | Button text or aria-label for icon-buttons                          |
| `id?`       | `string`                                                | Key for dropdown open/close tracking (defaults to label)            |
| `icon?`     | `string`                                                | SVG markup (use `{@html}` internally — must be trusted app content) |
| `href?`     | `string`                                                | Renders as `<a>` instead of `<button>`                              |
| `onclick?`  | `() => void`                                            | Click handler                                                       |
| `disabled?` | `boolean`                                               |                                                                     |
| `items?`    | `DropdownItem[]`                                        | Sub-items for `type: 'dropdown'`                                    |

`type: 'overflow'` items always appear in the "More" dropdown. In `narrow` mode, all non-overflow items also collapse into it.

Import types: `import type { SmartToolbarItem, DropdownItem } from '$lib/components/ui/SmartToolbar.svelte'`

---

## `ui/toolbar`

Typed floating-toolbar action package for page-level command zones. Use it for action groups that need deterministic full, compact, and overflow states without mixing visual style with layout priority.

```svelte
<script lang="ts">
    import {
        ToolbarActions,
        ToolbarFilterSelect,
        ToolbarGroup,
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

<ToolbarActions
    {actions}
    ariaLabel="Critical Tasks actions"
    overflowAriaLabel="More Critical Tasks actions"
/>

<ToolbarSearchItem
    mode="compact"
    ariaLabel="Search personnel"
    placeholder="Search name, rank, or MOS..."
    bind:value={personnelSearch}
/>

<ToolbarGroup
    label="Critical Tasks filters"
    activeCount={activeFilterCount}
    compactStrategy="items-first"
>
    {#snippet full()}
        <ToolbarFilterSelect
            ariaLabel="Critical Tasks group filter"
            options={groupFilterOptions}
            defaultValue=""
            mode="full"
            bind:value={selectedGroupId}
        />
        <ToolbarViewToggle
            ariaLabel="Critical Tasks matrix view mode"
            options={matrixViewOptions}
            mode="full"
            bind:value={viewMode}
        />
    {/snippet}
</ToolbarGroup>
```

Public components:

| Component                  | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `ToolbarActions.svelte`    | Measures and renders the action zone with generated overflow.              |
| `ToolbarAction.svelte`     | Renders one anchor or button action in full or compact mode.                |
| `ToolbarSearchItem.svelte` | Renders page-owned search as a full input or compact trigger with an inline panel. |
| `ToolbarGroup.svelte`      | Renders a stateful-control group boundary, active count, compact trigger, and panel. |
| `ToolbarFilterSelect.svelte` | Renders a select filter as a full select or compact trigger/panel.        |
| `ToolbarViewToggle.svelte` | Renders a segmented mode switch as a full control or compact trigger/panel. |
| `toolbarLayout.ts`         | Pure deterministic layout utility for full/compact/overflow states.         |

Policy fields:

| Field            | Type                                         | Notes                                                              |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `priority?`      | `'low' \| 'normal' \| 'high' \| 'critical'`  | Layout yield order only; it does not change color or emphasis.     |
| `displayMode?`   | `'auto' \| 'full' \| 'compact'`              | `auto` allows icon-capable actions to compact before overflowing.   |
| `overflow?`      | `'auto' \| 'never'`                          | `never` keeps protected actions visible and warns if impossible.    |
| `variant?`       | `'default' \| 'primary' \| 'secondary' \| 'danger'` | Visual style only; keep this separate from priority.        |
| `disabledReason?` | `string`                                    | Rendered through full, compact, and overflow paths for assistive tech and menu context. |

`ToolbarAction` accepts either `href` or `onclick`. In development it warns when both are supplied, or when neither is supplied. Compact icon actions keep their accessible name through `aria-label` and `title`.

`ToolbarSearchItem` keeps search state page-owned through `bind:value`. Use `mode="full"` when the search should render directly and `mode="compact"` when constrained toolbar space should show a search trigger. Compact mode opens an inline panel by default, keeps the same search binding, exposes active trigger hooks through `data-search-active` and `toolbar-search-item__trigger--active`, and closes with Escape.

`ToolbarGroup` keeps stateful controls out of command overflow. Use it for filter and view groups that should collapse into a trigger plus panel instead of moving into `ToolbarOverflowMenu`. `compactStrategy` supports `items-first`, `group-trigger`, and `never`; `items-first` is the Critical Tasks default. `activeCount` should count active filters in the group, while search activity stays visually separate through `ToolbarSearchItem`.

`ToolbarFilterSelect` preserves ordinary select behavior in full mode and exposes active state in compact mode when `value !== defaultValue`. `ToolbarViewToggle` preserves segmented-control behavior and keeps the current mode in the compact trigger label, `aria-label`, and `title`.

Icon names are intentionally small in Phase 1 and map to lucide icons: `download`, `upload`, `book-open`, `chart`, and `clipboard-check`. Add new names in `ToolbarIcon.svelte` when a migration needs them.

Migration notes:

- Keep existing leading controls in place until they are migrated deliberately. For mixed toolbars, wrap `ToolbarActions` and `ToolbarGroup` inside the existing `FloatingPageToolbar` zones.
- Prefer `ToolbarActions` over `ProgressiveToolbarActions` when actions need priorities, protected visibility, compact icon rendering, disabled reasons, or deterministic overflow tests.
- Prefer `ToolbarSearchItem`, `ToolbarFilterSelect`, and `ToolbarViewToggle` for leading stateful controls that need compact trigger/panel behavior. Keep older `ToolbarSelect`, `SegmentedControl`, and `ToolbarIconButton` where a page has not migrated yet.
- Deferred: true sheet-mode compact panels and a shared tooltip primitive.

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
