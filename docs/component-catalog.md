# Component Catalog & CSS Design System

Shared UI primitives and central variants live in `src/lib/components/ui/`; shared neutral compositions live in `src/lib/components/patterns/`. Import through each family's barrel. The [foundation provenance and family contract](ui-foundation-provenance.md) records the current APIs, deviations and target layers.
Layout components such as dialogs, sheets, and cards live under `src/lib/components/ui/`. Import the shadcn-backed primitives or compound namespaces directly.
Public marketing primitives live in `src/lib/components/public/`. Import via `$lib/components/public/...`.

---

## Find the relevant component

Read the [UI foundation](#ui-foundation), then the section for the component being changed:

- Page and shell composition: [page shell](#patternspage-shell), [workspace toolbar](#patternsworkspace-toolbar), [public shell](#public-marketing-shell).
- Input and selection: [form controls](#shared-form-controls), [command](#uicommand), [combobox](#uicombobox), [date picker](#uidate-picker), [file upload](#file-upload-pattern).
- Reports and records: [report workspace](#patternsreport-workspace), [charts](#patternsreport-chart), [data table](#uidata-table), [operational matrix](#uioperational-matrix), [bulk import](#patternsbulk-import-workspace).
- Feedback and interaction: [dialogs](#uiapp-dialog), [confirmation](#uiconfirm-dialog), [transient feedback](#transient-feedback), [empty states](#uiempty), [skeletons](#uiskeleton), [readiness](#patternsreadiness-band).
- Shared appearance: [CSS tokens and design system](#css-design-system-appcss).

## UI Foundation

This catalog is the active reference for TroopToTask's shadcn-svelte + Tailwind v4 UI foundation. It records the selected shared primitives, compound project wrappers, expected usage, and replacement decisions for older local wrappers.

Use it as the current component reference for accordion, collapsible, button, button group, input, input group, sidebar, label, textarea, select, checkbox, radio group, badge, alert, dialog, sheet, popover, dropdown menu, tooltip, command, combobox, tabs, table, calendar/date picker, chart, skeleton, progress, spinner, empty, and separator.

The [family contract](ui-foundation-provenance.md) governs retention, moves and removals. Domain UI lives with its feature: Calendar owns its date cells and status badge, and Onboarding owns its kanban board and paperwork stage display. Those components are documented by their feature code, not here.

Use the replacement notes here to map older TroopToTask building blocks to the current shadcn-svelte/shared UI foundation. Missing target guidance means the project has not selected a shadcn-svelte equivalent yet and needs a shared-component decision before new work relies on that pattern.

Replacement previews:

- Production DataTable surfaces use the shadcn-svelte `ui/data-table` foundation documented in this catalog.
- Legacy `toolbar` is represented by the shadcn-composed `patterns/workspace-toolbar` example using `input-group`, `select`, `button-group`, `button`, and `dropdown-menu`.
- Legacy `EmptyState` is represented by the shadcn `empty` component.
- Legacy `FileUpload` is represented by the native shadcn `input type="file"` example.
- Legacy `FormField` is replaced by the shadcn-backed `ui/field` compound primitives plus `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup` and `Combobox`, including its `multiple` mode.
- Legacy `SearchSelect` is replaced by the shadcn-style `ui/combobox` compound API.
- Legacy `Spinner` is represented by the shadcn `spinner` component.
- Platform admin no longer has a custom `admin-*` CSS layer. `/admin/**` composes the shared sidebar, page-shell, card, field, command, tabs, alert, empty, badge, button, input/select/textarea, and table primitives with Tailwind layout utilities.

Composition and visual ownership follow the [UI system](agents/ui-system.md#default-ui-rules). Within authorized UI work, extend shared APIs or add centrally owned variants and update affected consumers and this catalog. Preserve existing consumer behavior; route-local visual exceptions require Robert's explicit approval. Replacement notes below identify obsolete APIs, not permission to create compatibility wrappers.

Foundation files:

- `components.json` initializes shadcn-svelte with `ui` pointed at `$lib/components/ui`.
- `src/lib/utils.ts` provides the shadcn `cn` helper and element-ref utility types.
- `src/app.css` imports Tailwind v4 and maps shared semantic tokens to the product palette; see the [current token API](#current-token-api) and [palette](#palette).
- `src/app.css` defines the `below-banner` utility: the app frame fills the viewport under the fixed `BannerStack`, which publishes its measured height as `--banner-height` on `<html>`. Apply the utility instead of writing the variable; `ui/sidebar` reads it for its fixed container.
- `src/app.css` names the fixed layers with the `z-banner` and `z-sheet` utilities. From lowest to highest the layers are: the desktop sidebar (`z-10`), `BannerStack` (`z-banner`), `ui/sheet` and its overlay (`z-sheet`), then dialogs, alert dialogs and floating content (menus, selects, popovers, tooltips) at shadcn's `z-50`, then the Toaster. Bits portals join `<body>` when the component mounts, not when it opens. Overlays on the same layer therefore paint in mount order, and a drawer that mounted after a resize would cover a dialog opened from it. A sheet sits below the dialogs it can open, and the banner sits above the page and desktop sidebar but below every modal layer. Use these layers instead of new z-values.
- `src/app.css` no longer owns admin-specific selectors. Global `.btn`, `.input`, `.select`, `.label`, and related legacy selectors have been removed after route consumers migrated to shared primitives.

The catalog records `shadcn-svelte@1.2.7` as its generation-time CLI reference. No CLI is installed. `components.json` selects `nova` and `stone`, but does not pin a registry. The [provenance comparison](ui-foundation-provenance.md#source-and-comparison-method) uses the immutable 1.2.7 registry tag and records adaptations rather than treating every local family as stock generated source.

---

## `ui/command`

Command input and result items must share one `Command.Root`. For server-filtered search, set `shouldFilter={false}` and supply the root `label` for the input name. `Command.Viewport` exposes the Bits viewport without a second state owner; compose it through `Command.List`'s `child` snippet with the supplied props when list and viewport share one element, so `aria-controls` targets the listbox and `aria-activedescendant` identifies its selected option. `Command.Input` preserves an explicit `aria-expanded` value for conditional popups; always-open menus retain the primitive default.

## Transient feedback

The Web UI Foundation's public [`toastStore`](../src/lib/stores/toast.svelte.ts) wraps Sonner for `success`, `error`, `warning`, `info` and `dismiss`. The root layout mounts the shared `ui/sonner` Toaster once. Feature views can report a failed save through this interface while keeping their draft or unsaved record visible for retry. A toast does not decide whether an operation succeeded or own saved feature state; the response and the feature's operation remain authoritative. No feature-specific message or recipient policy belongs in the shared adapter. The Toaster keeps toasts clickable above modal layers: a modal sets `pointer-events: none` on `<body>`, so the Toaster restores it for its own list and stops `pointerdown` from reaching the open dialog or drawer, which would otherwise treat a touch on the toast as an outside press and close itself. While a modal's focus scope is active, keyboard focus stays in the modal; the toast is still announced through the Toaster's live region and dismisses itself.

## Password MFA continuation

[`PasswordMfaChallenge`](../src/features/identity/PasswordMfaChallenge.svelte), exported by Identity’s web seam, composes the shared auth field/notice and button primitives for Account Security, recovery and invite password flows. It owns serialized code submission, explicit-success admission, retry errors and code focus; `onverified` returns to the parent's retained password draft or pending activation step. Optional `hint` explains which action is awaiting MFA; the invite consumer uses it after password completion. It never submits or stores passwords. Recovery's prior route-local challenge has been replaced by this shared behavior.

## Password completion continuation

[`PasswordCompletion`](../src/features/identity/PasswordCompletion.svelte), exported by Identity’s web seam, composes the shared auth primitives for Account Security, recovery and invite reconciliation. Loaders expose only the server-persisted attempt state. Unknown outcomes offer a serialized status check; confirmed changes retry revocation alone; fenced failures permit explicit restart. Transport errors and reload never automatically resubmit a password. Fresh MFA uses `PasswordMfaChallenge`, with focus restored to the next action. Confirmed completion advances recovery or invite activation; Account Security offers explicit restart. Unavailable persistence offers status retry. Expired attempts require a fresh session after their original expiry before restart. Password drafts are discarded on confirmation or an unknown mutation outcome.

## `patterns/page-shell`

`patterns/page-shell` is the shared authenticated-page shell primitive family for route workspaces. It standardizes page padding, route body overflow, page headers, route tabs, dense fact displays, right summary rails, and bottom sticky action bars without owning route-specific business rules.

```svelte
<script lang="ts">
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';

	let tab = $state('overview');
	const tabs = [
		{ label: 'Overview', value: 'overview' },
		{ label: 'History', value: 'history', badge: 48 },
		{ label: 'Settings', value: 'settings' }
	];
</script>

<PageShell.Root>
	<PageShell.Header title="Training Readiness" subtitle="Review training completion and upcoming requirements.">
		{#snippet meta()}
			<Badge variant="success">Active</Badge>
		{/snippet}
		{#snippet actions()}
			<Button>Record Training</Button>
			<Button variant="outline">View History</Button>
		{/snippet}
	</PageShell.Header>

	<PageShell.Tabs items={tabs} value={tab} onValueChange={(value) => (tab = value)} />

	<section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<div class="rounded-lg border bg-card p-4 text-card-foreground">
			<PageShell.FactGrid layout="three">
				<PageShell.Metric label="Personnel" value="22" />
				<PageShell.Metric label="Complete" value="6" />
				<PageShell.Metric label="Due" value="16" />
			</PageShell.FactGrid>
		</div>

		<PageShell.SummaryRail title="Training Summary">
			<PageShell.FactRow label="Personnel" value="22" />
			<PageShell.FactRow label="Training Types" value="4" />
		</PageShell.SummaryRail>
	</section>

	<PageShell.StickyActionBar title="Unsaved changes" description="Review changes before saving.">
		{#snippet primary()}
			<Button variant="outline">Discard</Button>
			<Button>Save Changes</Button>
		{/snippet}
	</PageShell.StickyActionBar>
</PageShell.Root>
```

Public components:

- `Root`: authenticated page content scroller. Props: `density?: 'default' | 'compact'`, `width?: 'full' | 'content' | 'wide'`, `bodyClass?`, `children?`.
- `Header`: page header. Props: `title`, `subtitle?`, snippets `back`, `meta`, `actions`, and `overflow`.
- `Tabs`: route-level navigation. Props: `items?`, `label?`, `value?`, `onValueChange?`, `children?`. Items support `label`, `href`, `value`, `active`, `badge`, `badgeVariant`, and `disabled`.
- `FactGrid`: dense fact layout. Props: `layout?: 'stack' | 'two' | 'three' | 'rail'`, `children?`.
- `FactRow`: label/value row. Props: `label`, `value?`, `tone?`, `layout?: 'inline' | 'stack'`, `icon?`, `badge?`, `badgeVariant?`, `children?`. Use `layout="stack"` inside multi-column fact grids so labels and long values do not compress.
- `Metric`: compact bordered metric tile. Props: `label`, `value`, `detail?`, `tone?`, `children?`.
- `SummaryRail`: right-side rail container. Props: `title`, `children?`.
- `RailSection`: optional titled/divided section inside a rail. Props: `title?`, `divided?`, `children?`.
- `StickyActionBar`: bottom sticky action surface. Props: `title?`, `description?`, snippets `context`, `secondary`, and `primary`.

Rules:

- Use `Root` inside the authenticated shell/sidebar inset so page content scrolls inside the shell and the app breadcrumb/header remains outside the route scroller.
- Use `Header` for route-local title, subtitle, meta, and actions. Do not duplicate the authenticated app breadcrumb bar inside route content.
- Use `Tabs` for route-level Overview/History/Settings style navigation. Do not restore legacy `SubNav`.
- Use `SummaryRail`, `FactGrid`, `FactRow`, and `Metric` for dense operational summaries instead of route-local summary wrappers.
- Use `StickyActionBar` for dirty-state and grouped action surfaces.
- Routes may configure labels, values, actions, links, disabled/loading state, status badges, and snippets. Routes must not visually retune these primitives with local spacing, radius, color, border, density, or typography overrides unless explicitly approved.

---

## `ui/date-picker`

Shared shadcn-svelte date picker composed from `button`, `popover`, and `calendar`. Use this instead of route-local `input type="date"` controls when a production form needs the component catalog date picker appearance.

```svelte
<script lang="ts">
	import { DatePicker } from '$lib/components/ui/date-picker';

	let ets = $state('2027-05-01');
</script>

<DatePicker id="ets" bind:value={ets} placeholder="Select ETS" />
```

Props: `id?: string`, `value?: string` (bindable ISO `YYYY-MM-DD`), `placeholder?: string`, `disabled?: boolean`, `aria-label?: string`, `onValueChange?: (value: string) => void`

- Values are stored as ISO date strings so route payloads stay data-oriented.
- The visual contract comes from the shared component. Routes may provide field labels, placeholders, disabled state, and bound values only.
- Changes to calendar or popover appearance follow the [UI system](agents/ui-system.md); verify the shared result and update this reference when its API changes.

---

## `patterns/workspace-toolbar`

`patterns/workspace-toolbar` is the shared toolbar used by authenticated production routes. It replaces route-local toolbar shells with one visual contract built from shadcn-svelte primitives; the old `ui/toolbar` family is retired.

```svelte
<script lang="ts">
	import * as WorkspaceToolbar from '$lib/components/patterns/workspace-toolbar';
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

- `WorkspaceToolbar.Root`: the shared toolbar shell. Props: `ariaLabel: string`, `wrap?: boolean`, `children?: Snippet`, plus normal `div` attributes. The shell renders `role="toolbar"`. By default it is one fixed-height `flex-nowrap` row with hidden horizontal overflow as a last resort. `wrap` lets groups and their controls flow onto further rows when the container is too narrow, so no control is ever scrolled out of view; use it for filter-heavy report toolbars whose controls cannot fit one row at medium widths.
- `WorkspaceToolbar.Group`: the labeled control/action boundary. Props: `label: string`, `activeCount?: number`, `zone?: 'controls' | 'actions' | 'meta'`, `children?: Snippet`, plus normal `div` attributes. `activeCount` is included in the accessible group label. The `actions` zone aligns to the toolbar's right edge.
- `WorkspaceToolbar.Select` truncates a long selected label inside its trigger and exposes the full label as the trigger title. `WorkspaceToolbar.Actions` names every action button by its label, so compact icon-only buttons keep their accessible name.
- `WorkspaceToolbar.Meta`: compact passive metadata for rare toolbar-safe status. Props: `tone?: 'neutral' | 'warning' | 'success'`, `children?: Snippet`, plus normal `div` attributes. Keep passive route context outside the toolbar unless there is proven room.

Allowed route behavior knobs:

- Labels, placeholders, option data, selected values, search text, active filter counts, disabled/loading state, permissions, and action handlers.
- Which commands stay visible versus move into a `DropdownMenu` overflow.
- Whether a route uses text buttons or icon-only buttons at shared breakpoints.
- Which filters are combined into one filter trigger.

Rules:

- Keep the toolbar as one row where it fits. Combine filters early for action-heavy routes; move page-level commands such as exports to the page header. A filter-heavy report toolbar that still cannot fit uses `wrap` rather than hiding controls behind sideways scrolling.
- Use shadcn `button-group` for view toggles and [`ui/toggle-group`](#uitoggle-group) for a single-choice segmented value such as a forecast horizon. Do not build route-local segmented controls for migrated toolbar surfaces.
- Use `DropdownMenu` for command overflow. Commands can overflow; filters and search should stay as stateful controls or combine into a filter trigger.
- Use compact search widths such as `w-40 sm:w-56` unless a route has proven room for wider search.
- Keep disabled actions visible when their presence explains unavailable work. Loading actions should be disabled and show the shared spinner.
- Do not add route-local toolbar spacing, radius, borders, shadows, color, density, typography, or internal selector overrides.
- Compose route-specific behavior under the [shared UI composition rules](agents/ui-system.md#default-ui-rules); keep toolbar appearance and reusable APIs owned by the shared component.
- If an authorized route change needs behavior this API cannot express, implement and verify the smallest shared API extension, update affected consumers and document its usage here.

Migration guidance:

- Start every migrated route toolbar from `WorkspaceToolbar.Root`, `WorkspaceToolbar.Group`, shadcn `ButtonGroup`, shadcn `Button`, shadcn `DropdownMenu`, and shadcn form primitives.
- Treat the `docs/component-catalog.md` desktop, constrained/mobile, overflow, disabled, loading, selected, filter, search, view-toggle, and icon-only examples as the review baseline.
- Production route migration happens only when explicitly requested. Until then, the component catalog is the development ground for this toolbar family.

---

## `ui/toggle-group`

`ui/toggle-group` wraps bits-ui `ToggleGroup` with the shared `toggle` variants as a segmented control: a muted track with the pressed item raised. Arrow keys move between items.

```svelte
<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
</script>

<ToggleGroup.Root
	type="single"
	size="sm"
	value="90"
	onValueChange={(value) => value && setHorizon(value)}
	aria-label="Forecast horizon"
>
	<ToggleGroup.Item value="30" aria-label="30 days">30 D</ToggleGroup.Item>
	<ToggleGroup.Item value="90" aria-label="90 days">90 D</ToggleGroup.Item>
</ToggleGroup.Root>
```

- Use it for a small, always-visible single choice whose options fit inline. Use `WorkspaceToolbar.Select` when the options are many or data-driven.
- A `single` group emits an empty value when the pressed item is clicked again; ignore it so one option stays selected.
- Give the group an `aria-label` and give abbreviated items a full `aria-label`.

---

## `patterns/report-workspace`

`patterns/report-workspace` is the shared shadcn-svelte-backed foundation for operational report pages and report sections. It standardizes report structure, toolbar placement, filter/configuration panels, chart/table sections, report states, and export actions without owning feature calculations.

```svelte
<script lang="ts">
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace';
	import * as WorkspaceToolbar from '$lib/components/patterns/workspace-toolbar';
</script>

<ReportWorkspace.Root ariaLabel="Readiness report workspace">
	<ReportWorkspace.Header
		title="Readiness report"
		description="Completion by group and date range."
		meta={[{ label: 'Window', value: '30 days' }]}
	/>

	<ReportWorkspace.Toolbar ariaLabel="Readiness report controls">
		<WorkspaceToolbar.Group label="Readiness report filters" activeCount={activeFilterCount}>
			<!-- route-owned filter controls -->
		</WorkspaceToolbar.Group>
		<WorkspaceToolbar.Group label="Readiness report exports" zone="actions">
			<ReportWorkspace.ExportActions>
				<ReportWorkspace.ExportAction
					label="Export workbook"
					href={exportHref}
					state={exportState}
					disabledReason={exportDisabledReason}
				/>
			</ReportWorkspace.ExportActions>
		</WorkspaceToolbar.Group>
	</ReportWorkspace.Toolbar>

	<ReportWorkspace.Filters title="Report configuration">
		<!-- route-owned filters -->
		{#snippet dateRange()}
			<!-- date range controls -->
		{/snippet}
	</ReportWorkspace.Filters>

	<ReportWorkspace.Content layout="split">
		<ReportWorkspace.Chart title="Readiness trend" ariaLabel="Readiness trend chart">
			<!-- feature-owned chart content -->
		</ReportWorkspace.Chart>
		<ReportWorkspace.Table title="Detail rows" data={rows} {columns} ariaLabel="Readiness detail rows">
			{#snippet summary()}
				<ReportWorkspace.SummaryStrip
					topRisk="Alpha · 68% ready"
					population="126 personnel"
					parameters="Past 30 days"
					findings={['3 groups below 80% readiness.', 'HQ has the lowest current availability.']}
					riskTone="warning"
				/>
			{/snippet}
		</ReportWorkspace.Table>
	</ReportWorkspace.Content>
</ReportWorkspace.Root>
```

Public components:

- `Root`: report workspace shell. Props: `ariaLabel?: string`, `children?: Snippet`.
- `Header`: report title, description, and metadata. Props: `title`, `description?`, `meta?`, `actions?`.
- `Toolbar`: thin wrapper around `WorkspaceToolbar.Root`. Props: `ariaLabel`, `children`.
- `Filters`: configuration panel with optional date-range and actions regions. Renders a header band, a responsive config grid (children and `dateRange` flow together), and a bordered action footer. Props: `title?`, `description?`, `dateRange?`, `actions?`.
- `OptionChips`: shadcn `Toggle`-backed multi-select rendered as chips, each with an optional color identity dot. Use for status-type and assignment-type filters instead of route-local toggle buttons. Props: `options: { id; label; color? }[]`, `selectedIds`, `onToggle`, `label?`, `ariaLabel?`, `onToggleAll?`, `allSelected?`. Color is shown as a small dot only; selection uses the standard toggle state, never a flood of the raw color.
- `OptionList`: scrollable shadcn `Checkbox` + `Label` list for personnel, group, MOS, and role selection. Use instead of raw `<input type="checkbox">` lists. Props: `options: { id; label }[]`, `selectedIds`, `onToggle`, `ariaLabel?`, `emptyMessage?`.
- `Content`: report section layout. Props: `layout?: 'stack' | 'split'`.
- `Section`: generic bounded report section. Props: `title`, `description?`, `meta?`, `actions?`, `summary?`, `variant?: 'card' | 'briefing'`, `eyebrow?`. The default `card` is a bordered card. `briefing` is an open section under a 2px foreground rule with a small-caps `eyebrow`, a heading-font title and a description capped at 560px; its `actions` stack at the top right. Each briefing column is its own section so stacked columns keep their rules.
- `SummaryStrip`: compact operational summary band for completed report results. Props: `topRisk`, `population`, `parameters`, `findings`, `riskTone?: 'default' | 'warning' | 'danger' | 'success'`, `ariaLabel?`. Use inside the `summary` snippet so the strip sits between the section header and result body, not as a nested card.
- `Chart`: chart section with accessible chart region. Props: `title`, `description?`, `meta?`, `ariaLabel?`.
- `Table`: DataTable-backed report table section. Props include `data`, `columns`, `table`, `ariaLabel`, `emptyMessage`, `loading`, `showSearch`, `searchPlaceholder`, `pageSize`, and cell/header/summary snippets.
- `State`: shared `loading`, `no-data`, and `error` report states.
- `ExportActions`: grouped export region.
- `ExportAction`: shared export command. Props: `label`, `state?: 'ready' | 'loading' | 'disabled' | 'error'`, `disabledReason?`, `errorReason?`, `loading?`, `loadingLabel?`, plus button props such as `href`.

Shared components own:

- Report page/section structure, spacing, borders, responsive wrapping, state presentation, disabled export affordance, and DataTable section framing.
- Composition with `patterns/workspace-toolbar`, `ui/data-table`, shadcn `button`, `empty`, `alert`, and `spinner`.

Routes configure:

- Report data, filters, date-range values, chart content, table columns, export URLs, disabled reasons, loading/error booleans, permissions, and handlers.

Report/export state guidance:

- Keep disabled export actions visible when their presence explains unavailable work. Use `disabledReason` for the user-facing reason.
- Prefer `state` for durable export state. Use `state="ready"` for available exports, `state="loading"` while a file is being prepared, `state="disabled"` with `disabledReason` when user input is missing, and `state="error"` with `errorReason` when export infrastructure failed.
- Use `State state="no-data"` for valid reports with no matching rows, not for permission errors.
- Use `State state="error"` for load or refresh failures. Feature code owns retry behavior.
- Do not move report calculations, filtering, authorization, export generation, or date semantics into shared UI.

Route-level visual override ban:

- Routes must not pass route-local visual classes that change report component color, radius, border, typography, density, shadow, or internal spacing.
- If a report needs a reusable new section shape, add it to `patterns/report-workspace`, show it in `docs/component-catalog.md`, and document it here before route usage.

Migration notes:

- Calendar reports should migrate first because they already have multiple report subtypes and date-oriented filters.
- Critical Tasks reports should follow because they already use the shared toolbar but still carry route-local report grids, states, and chart/table shells.
- Training Reports uses a wrapping toolbar for filters and the forecast horizon, page-header actions (secondary Export Excel, primary Print brief), `State`, and `briefing` sections throughout. Its Affected soldiers drill-down puts `DataTable` with a server-backed `table` state (rows, page, page size and total pages from the detail API; sorting off) inside a briefing section, so the table's own Previous/Next pagination drives server pages without client sorting or a scroll box. Type risk renders stacked HTML bars in a semantic table rather than a chart primitive. The normal screen uses shared `ReportWorkspace` composition inside a `print:hidden` wrapper. The feature-owned `TrainingPrintBrief` separately renders the captured loaded report and optional loaded-detail page. Its `data-print-report="training"` root exists only during a print cycle. Scoped rules in `src/app.css` hide app chrome and the sidebar, release shell height and overflow, and select the `training-brief` landscape named page with white margins. Print tables repeat context and headings through `thead` and the matrix key through `tfoot`. The appendix includes only the currently loaded detail page with its exact range and scope; Excel exports all filtered affected requirements. This approved training print composition does not change the shared platform UI architecture.
- Personnel report-like flows should migrate after bulk import/merge surfaces are separated from the current combined manager.

---

## `patterns/report-chart`

`patterns/report-chart` is the shared shadcn-svelte chart target for operational reports. It composes the generated `ui/chart` container with LayerChart simplified charts so production report routes do not each own axis, grid, legend, and series setup.

Current chart inventory:

- Critical Tasks readiness trend maps to `ReportLineChart` with multiple series.
- Critical Tasks expiration cliff maps to `ReportBarChart layout="stack"`.
- Critical Tasks readiness distribution maps to `ReportBarChart layout="group"` or `layout="overlap"`.
- Training Reports' forecast maps to `ReportForecastChart`.
- No current report usage requires a shadcn area chart. Add an area wrapper only when a real route needs cumulative or filled-trend semantics.

Public components:

- `ReportLineChart`: multi-series line chart. Props: `data`, `series`, `ariaLabel`, `yDomain?`, `yTicks?`, `heightClass?`, `class?`.
- `ReportBarChart`: multi-series bar chart. Props: `data`, `series`, `ariaLabel`, `layout?: 'group' | 'stack' | 'overlap'`, `yDomain?`, `yTicks?`, `heightClass?`, `class?`.
- `ReportForecastChart`: one plot that pairs a readiness line over a shaded area (upper area) with per-interval count bars rising from the shared calendar axis (lower strip), plus a dashed success goal line, an optional highlighted band whose label and caption sit in their own row above the plot, aligned to the band, start and end point labels, and a screen-reader table. Props: `points: { date, label, percent }[]`, `bars: { start, end, count, emphasized }[]`, `goal: { value, label }`, `band: { start, end, label, caption } | null`, `xTicks: { date, label }[]`, `endTone` (text color class, usually from `readinessBandTone`), `ariaLabel`, `heightClass?`, `class?`. Dates are `YYYY-MM-DD` calendar days placed as UTC midnights, so a short final interval and month ticks land exactly. The y domain comes from `readinessTrendDomain` over the points and goal. Axis ticks and bar counts that would overlap a neighbor are dropped; the first and last ticks always stay. Points must not rise over time, so the start label sits above the start point and the end label below the end point, the sides the line never reaches. Each label steps past any gridline or goal line its glyphs would cross. The end label has its own row between the line floor and the bar counts. The goal label sits in the right gutter past the end point, centered on the goal line, and the right padding is sized to fit it, so no plotted mark can reach it. Training Reports uses it for the readiness forecast.

Routes configure:

- Data rows, series keys, labels, chart colors, domains, tick values, and surrounding report copy.

Shared components own:

- shadcn chart container usage, LayerChart simplified chart composition, axis baseline, grid styling, legend structure, and responsive chart frame.

`docs/component-catalog.md` shows the Critical Tasks chart mapping and the line, stacked bar, and overlap bar target examples.

---

## `patterns/requirement-status-badge`

`patterns/requirement-status-badge` owns neutral requirement status visuals. Training owns its badge and status-cell wrappers; Critical Tasks owns its status badge and translates its completion statuses to this shared visual contract. Feature-specific presentation stays with its owner.

```svelte
<script lang="ts">
	import { RequirementStatusBadge } from '$lib/components/patterns/requirement-status-badge';
</script>

<RequirementStatusBadge status="current" label="Current" />
```

Public shared exports are `RequirementStatusBadge`, `requirementStatusVisuals` and `RequirementStatus`. Routes pass status keys, visible labels and screen-reader labels through the relevant owner component. Keep shared status colors and typography in the neutral base; Training matrix/report cells retain Training's status-cell presentation.

---

## `patterns/readiness-band`

`patterns/readiness-band` is the shared shadcn-svelte-style visual contract for readiness tiers. The default `ramp` palette keeps Critical Tasks' report colors; Training Reports uses the token-based `semantic` palette (success → warning → destructive) with goal-relative tiers supplied by its model.

```svelte
<script lang="ts">
	import * as ReadinessBand from '$lib/components/patterns/readiness-band';
</script>

<ReadinessBand.Cell tier="okay" percent={84} aria-label="11B weapons readiness: 84%, 21 of 25 current" />
<ReadinessBand.Legend />
```

Public components:

- `Cell`: report heat-cell. Props: `tier`, `percent?`, `label?`, `palette?: 'ramp' | 'semantic'`, `size?: 'compact' | 'tile'`, `drop?: number | null`, `children?`, plus normal `span` attributes. `tile` fills its column for a briefing grid. `drop` marks an upcoming hot spot with a 2px inset foreground ring and a `▼ n` chip in foreground/background tokens, and adds screen-reader text contained by the cell; the ring and chip stay distinguishable on every band, including solid destructive cells.
- `Legend`: readiness tier legend. Props: `items?`, `ariaLabel?`, `palette?`, `dropLabel?` (keys the `drop` marker), plus normal `ul` attributes.
- `Swatch`: visual swatch used by `Legend`. Props: `tier`, `palette?`, plus normal `span` attributes.

Semantic palette:

| Tier             | Fill                   | Text                 |
| ---------------- | ---------------------- | -------------------- |
| `good`           | success at 14%         | foreground           |
| `okay`           | warning at 12%         | foreground           |
| `caution`        | warning at 28%         | foreground           |
| `warn`           | destructive at 18%     | foreground           |
| `danger`         | solid destructive      | background, semibold |
| `not-applicable` | none, 1px inset border | muted                |

Public helpers:

- `readinessBandLegendItems`
- `formatReadinessBandPercent(percent)`
- `readinessBandTone`: text color class per tier for values shown outside a cell (success, warning, destructive or muted), so a headline number, chart end label and grid total column share the cell scale.

Rules:

- The pattern presents tiers; it does not calculate them. Each feature computes its tier in one place and passes it in. The `ramp` legend reads `<60%`, `60-69%`, `70-79%`, `80-89%`, `90%+` and not applicable. Never re-derive a tier from a rounded display percent.
- Routes may pass data, labels, and accessible names. They must not restyle readiness colors, hatching, radius, typography, or density locally.
- `ui/operational-matrix` hosts these cells in Critical Tasks and Training Reports grids; readiness-tier meaning stays in `patterns/readiness-band`, not in the matrix primitive.

---

## `ui/operational-matrix`

`ui/operational-matrix` is a headless-first compound table primitive for dense row-by-column operational workflows.

```svelte
<script lang="ts">
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
</script>

<OperationalMatrix.Root {rows} {columns} {rowGroups} {selectedCell} onCellSelect={handleCellSelect}>
	<OperationalMatrix.Viewport ariaLabel="Training matrix viewport">
		<OperationalMatrix.Table ariaLabel="Training matrix">
			<OperationalMatrix.Header>
				<OperationalMatrix.HeaderRow>
					<OperationalMatrix.CornerCell>Personnel</OperationalMatrix.CornerCell>
					{#each columns as column (column.id)}
						<OperationalMatrix.ColumnHeader {column} orientation={column.compact ? 'vertical' : 'horizontal'}>
							{column.label}
						</OperationalMatrix.ColumnHeader>
					{/each}
				</OperationalMatrix.HeaderRow>
			</OperationalMatrix.Header>
			<OperationalMatrix.Body>
				{#each rows as row (row.id)}
					<OperationalMatrix.Row {row}>
						<OperationalMatrix.RowHeader {row}>{row.label}</OperationalMatrix.RowHeader>
						{#each columns as column (column.id)}
							<OperationalMatrix.Cell {row} {column} ariaLabel={`${row.label} ${column.label} action`}>
								<!-- wrapper-owned content -->
							</OperationalMatrix.Cell>
						{/each}
					</OperationalMatrix.Row>
				{/each}
			</OperationalMatrix.Body>
		</OperationalMatrix.Table>
	</OperationalMatrix.Viewport>
</OperationalMatrix.Root>
```

Public components:

- `Root`, `Viewport`, `Table`, `Header`, `HeaderRow`, `ColumnGroup`, `ColumnHeader`, `CornerCell`, `Body`, `RowGroup`, `Row`, `RowHeader`, `Cell`.

Public types:

- `OperationalMatrixRow`, `OperationalMatrixColumn`, `OperationalMatrixRowGroup`, `OperationalMatrixCellIdentity`, `OperationalMatrixCellSelection`, `OperationalMatrixSelectHandler`.

Shared component owns:

- Native table structure, compound context, row/column/group identity, selected-cell data attributes, disabled/read-only propagation, accessible cell selection payloads, and stable `data-slot` / `data-matrix-*` styling hooks.
- Optional `ColumnHeader orientation="vertical"` support for narrow training and Critical Tasks task-code columns.

Wrappers own:

- Status colors, legends, toolbars, sorting/filtering, dialogs, date math, training/task semantics, virtualization algorithms, range visuals, and final visual treatment.

Rules:

- Keep domain meaning out of the primitive. Do not add calendar, training, Critical Tasks, DA6, readiness, or status-type assumptions to this layer.
- Do not restore the deleted visual-first API and do not add compatibility adapters for it.
- Dialogs belong in wrappers/component catalog examples. `Cell` emits row and column identity; it does not open dialogs itself.
- Color-only cells must provide an accessible label through `ariaLabel`, visually hidden text, or both.
- Production consumers are the Critical Tasks matrix and readiness table, the Training matrix and the Training Reports hot-spot grid. Consumers style its cells and triggers through `data-slot` selectors, as those wrappers do.

Component Catalog coverage:

- `docs/component-catalog.md` covers grouped rows, sticky top header and row header, selected cell state, disabled/read-only cells, dialog-trigger cells, dense color-only cells with accessible labels, stacked month-band column headers, rich row headers with metadata, and loading/empty wrapper states.
- `docs/component-catalog.md` covers training-matrix parity mapping with vertical task-code headers, requirement status badges, and the note that `IctMatrix` should retire into the shared training-matrix parity path instead of preserving a separate visual system.

## `patterns/bulk-import-workspace`

`patterns/bulk-import-workspace` is the shared foundation for operational import workflows. It standardizes source choice, upload/paste/manual input panels, validation summaries, preview tables, row selection, progress states, disabled submit reasons, and final result summaries. Feature routes still own parsing, validation rules, duplicate/merge semantics, permissions, and persistence.

```svelte
<script lang="ts">
	import * as BulkImportWorkspace from '$lib/components/patterns/bulk-import-workspace';
	import { useDataTableSelection } from '$lib/components/ui/data-table';
</script>

<BulkImportWorkspace.Root ariaLabel="Personnel import workspace">
	<BulkImportWorkspace.Header title="Personnel import" step="Step 1" />

	<BulkImportWorkspace.SourcePicker label="Import source">
		<BulkImportWorkspace.SourceOption
			label="Upload"
			selected={source === 'upload'}
			onSelect={() => (source = 'upload')}
		/>
		<BulkImportWorkspace.SourceOption label="Paste" selected={source === 'paste'} onSelect={() => (source = 'paste')} />
	</BulkImportWorkspace.SourcePicker>

	<BulkImportWorkspace.InputPanel title="Upload rows">
		<BulkImportWorkspace.FileInput bind:files label="Upload personnel file" error={fileError} />
	</BulkImportWorkspace.InputPanel>

	<BulkImportWorkspace.ValidationSummary issues={validationIssues} />

	<BulkImportWorkspace.PreviewTable
		rows={previewRows}
		columns={previewColumns}
		{selection}
		rowKey={(row) => row.id}
		disabledRow={(row) => row.hasErrors}
		disabledReason={(row) => (row.hasErrors ? row.errorSummary : undefined)}
		rowStatus={(row) => row.status}
	/>

	<BulkImportWorkspace.FooterActions disabledReason={submitDisabledReason}>
		<Button disabled={!!submitDisabledReason}>Import checked rows</Button>
	</BulkImportWorkspace.FooterActions>
</BulkImportWorkspace.Root>
```

Public components:

- `Root`: import workspace shell. Props: `ariaLabel?`, `children`.
- `Header`: title, description, step label, and metadata.
- `SourcePicker`: accessible radio-group-style source chooser.
- `SourceOption`: selectable upload/paste/manual choice.
- `InputPanel`: shared section for upload, paste, manual, template, or example controls.
- `FileInput`: shared file input presentation using `ui/field` and `ui/input`.
- `PasteInput`: shared textarea presentation using `ui/field` and `ui/textarea`.
- `ValidationSummary`: shared error/warning/ready count summary.
- `PreviewTable`: DataTable-backed preview with optional `useDataTableSelection` row selection. Supports `rowStatus`, `disabledReason`, `statusColumnHeader`, `statusDescriptionMode`, `cellPresentation`, and `selectedCountLabel`. Use `cellPresentation="editable-grid"` when route-provided cell snippets render editable inputs in a dense preview; issue-bearing cells should expose a field-level tooltip and `data-cell-state`.
- `RowStatus`: shared per-row import status display. Props: `tone: 'valid' | 'warning' | 'error' | 'disabled' | 'duplicate' | 'info'`, `label?`, `description?`, `descriptionMode?`.
- `ProgressState`: importing/loading state with optional progress value.
- `FooterActions`: footer command region with disabled submit reason.
- `ResultSummary`: final `success`, `partial`, or `failed` result summary.

Shared components own:

- Import workspace structure, source chooser presentation, file/paste field labels and errors, preview table shell, row status presentation, selectable-row mechanics when `selection` is passed, validation/result state presentation, progress presentation, and responsive layout.

Routes configure:

- Source state, accepted file extensions if needed, pasted text value, examples/templates, parsed rows, validation issues, per-row status data, duplicate/merge decisions, disabled rows, disabled-row reasons, selected-row persistence, submit disabled reasons, retry/back/reset handlers, and API calls.

Import validation/result state guidance:

- Validation errors and warnings should be produced by feature utilities. Shared UI only renders the resulting counts/messages.
- Use `rowStatus` for valid/warning/error/duplicate/disabled/info presentation. Use `disabledReason` for rows that must not be selected; the preview table uses it in the selection label and can render it through the status column.
- `PreviewTable.disabledRow` disables the row's import checkbox, not its cell editors. Pass the same predicate to `useDataTableSelection` so select-all excludes invalid rows. Editable cells remain available to correct validation errors; use `rowStatus` and `disabledReason` to explain those errors.
- Use `ResultSummary status="partial"` when some rows were saved and some failed.
- Use `ResultSummary status="failed"` when no requested rows were saved.
- Use `ProgressState` for parsing/importing work that blocks closing or submit actions.

Route-level visual override ban:

- Routes must not restyle the import workspace, source cards, input panels, validation summary, preview table, footer, or result summary locally.
- If an import workflow needs a durable capability the shared API cannot express, add it centrally and prove it in `docs/component-catalog.md`.

Migration notes:

- Personnel bulk import/merge should migrate first because it already uses the new dialog and DataTable foundations but still contains route-local import source, preview, and result markup.
- Critical Tasks task import and completion import should follow because they share the same upload-preview-import-result state machine with domain-specific validation.
- Training bulk import should follow after paste/upload source choice settles in the shared API.
- Calendar bulk status add/remove/import should migrate after the import workspace proves partial-success and disabled-row handling.

Compatibility note: the legacy `src/lib/components/ui/BulkImportTable.svelte` helper has been removed. Import flows should compose `BulkImportWorkspace.PreviewTable`, `BulkImportWorkspace.RowStatus`, `BulkImportWorkspace.ValidationSummary`, and route-owned parsing/mapping utilities.

---

## Public Marketing Shell

Use these for any top-level marketing, legal, or trust page so the public site keeps one shared shell and one navigation/footer contract.

The shared wordmark is `patterns/brand-wordmark`. Public navigation and account-access pages use that same component so its lettering and subtitle stay consistent. It is a pattern rather than a `components/public` file because Identity's AuthShell also renders it, and public routes already depend on Identity.

```svelte
<PublicShell user={data.user} active="security">
	<PublicPageHeader label="Security">
		{#snippet title()}Built for controlled <em>personnel data.</em>{/snippet}
		<p>Role-scoped access, encryption, and audit history for unit workflows.</p>
	</PublicPageHeader>

	<PublicContentSection label="01 // Controls" alternate>
		{#snippet title()}Operationally practical controls.{/snippet}
		<p>Section body...</p>
	</PublicContentSection>
</PublicShell>
```

### `public/PublicShell.svelte`

Shared public wrapper that renders the classification bar, site nav, optional CTA, and footer around page content.

Props: `user?: unknown`, `active?: 'about' | 'security'`, `bodyClass?: string`, `showFaqLink?: boolean`, `showClassificationBar?: boolean`, `showCta?: boolean`, `navOverlay?: boolean`, `navScrolled?: boolean`, `children: Snippet`

Guidance:

- Prefer this over duplicating nav/footer/CTA markup in public routes.
- Use `showFaqLink` on the landing page; it links to `/#faq`.
- Use `showCta={false}` when the route has its own final action section.

### `public/PublicPageHeader.svelte`

Shared inner-page hero/header for marketing, legal, and trust pages.

Props: `label: string`, `title: Snippet`, `children: Snippet`

Guidance:

- Keep `label` short, mono, and structural.
- Put supporting copy and metadata like effective dates in `children`; use `.page-meta` for low-emphasis header metadata.

### `public/PublicContentSection.svelte`

Shared section framing for legal/trust/public longform pages.

Props: `id?: string`, `label: string`, `alternate?: boolean`, `title: Snippet`, `children: Snippet`

Guidance:

- Alternate sections with `alternate` when you need rhythm across long-form pages.
- Use `PublicContactCard` inside section content for disclosure and support email callouts.

### `public/PublicContactCard.svelte`

Shared email callout for public legal and security pages. `email` is required; `subject` optionally adds an encoded email subject. Keep page-specific instructions in the surrounding section.

### `public/PublicSiteNav.svelte`, `public/PublicCta.svelte`, `public/PublicFooter.svelte`

Lower-level shell primitives used internally by `PublicShell`. Reach for these directly only if you have a compelling reason to diverge from the standard public page wrapper.

---

## Shared Route Toolbar

See [`patterns/workspace-toolbar`](#patternsworkspace-toolbar) for the shared API and composition rules.

Use `WorkspaceToolbar.Root` as the route toolbar root, `WorkspaceToolbar.Group` for control/action/meta boundaries, shadcn `ButtonGroup` plus `Button` for mutually exclusive view modes, shadcn `Toggle` for independent boolean toolbar state, shadcn `Select`/`InputGroup` through the shared workspace toolbar helpers for filters and search, and `WorkspaceToolbar.Actions` for command buttons plus dropdown overflow.

Configure route behavior through the shared API; extensions follow the [UI system](agents/ui-system.md#default-ui-rules).

## `ui/app-dialog`

Shared shadcn-svelte-backed dialog foundation for information, edit, form, and review workflows. Use this for standard dialogs that collect or show content. Use `ui/confirm-dialog` for confirmations.

```svelte
<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';

	let open = $state(false);
	let name = $state('');
	const saving = new PendingSave();
	const dirty = $derived(name.trim() !== '');

	async function save() {
		// Await the mutation; close on success and keep the draft on failure.
	}
</script>

<AppDialog.Root bind:open busy={saving.pending} closeBlocked={dirty} onClose={() => (open = false)}>
	<AppDialog.Content size="default">
		<AppDialog.Header class="px-4 pt-4">
			<AppDialog.Title>Edit personnel metadata</AppDialog.Title>
			<AppDialog.Description>Update route-provided fields without route-local dialog styling.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body>
			<fieldset class="contents" disabled={saving.pending}>
				<!-- form fields -->
			</fieldset>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" disabled={saving.pending} onclick={() => (open = false)}>Cancel</Button>
			<Button disabled={saving.pending} onclick={() => saving.run(save)}>Save</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
```

Public components:

- `AppDialog.Root`: controlled open state and dismissal policy. Props: `open?: boolean` (bindable), `busy?: boolean`, `closeBlocked?: boolean`, `onClose?: () => void`, plus shadcn dialog root props.
- `AppDialog.Content`: shared shell with close button, constrained viewport and mobile-safe width. It reads `busy` and `closeBlocked` from Root. Props: `size?: 'default' | 'wide' | 'fullscreen'`, `showCloseButton?: boolean`.
- `AppDialog.Header`, `AppDialog.Title`, `AppDialog.Description`: accessible heading and description wiring. Use a description unless the title alone is enough for screen-reader context.
- `AppDialog.Body`: scrollable dialog body. Put long content and forms here.
- `AppDialog.Footer`: sticky action area outside the scrollable body.

Allowed route behavior knobs:

- Open/closed state, labels, form fields, validation, permissions, disabled/loading state, and action handlers.
- `size` only when content volume requires it: default for normal forms, `wide` for tables/import previews, `fullscreen` for rare constrained workspaces.
- `busy` while a save, import or delete is in flight. The dialog sets `aria-busy` and ignores Escape, outside click and its close button until the work settles. Use `PendingSave` (`$lib/utils/pendingSave.svelte`) so a repeated submit sends nothing, and put the fields in a `fieldset` disabled while pending so the draft cannot change before its response arrives. Disable Cancel and submit too, and keep the draft when the save fails.
- `closeBlocked` when dismissal would lose something while nothing is in flight: an unsaved draft, or an outcome the user must read (a `saved` or `uncertain` result). It blocks the same dismissals without announcing `aria-busy`.

Focus safety needs no code. When the focused control disables (a submit, a fieldset) or unmounts, the dialog content takes focus so keyboard users stay inside, whether or not the dialog is busy.

Action guidance:

- Footer order is cancel/secondary before primary confirm on the right in desktop layout. Destructive side actions may appear before cancel only when the route already has that workflow requirement.
- Use `Button` variants for action semantics. Do not pass route-local classes to retune dialog spacing, radius, color, typography, shadow, animation, footer layout, or internal parts.
- Long dialog bodies must use `AppDialog.Body`; do not add route-local `max-height` or `overflow` wrappers to shared dialog internals.

Compatibility note: the legacy `src/lib/components/Modal.svelte` wrapper has been removed. Compose `ui/app-dialog` or `ui/dialog` directly.

---

## `ui/confirm-dialog`

Shared shadcn-svelte alert-dialog foundation for destructive, warning, primary, and secondary confirmations. Handles internal async loading during `onConfirm` and also supports externally controlled `loading` and `disabled` states.

```svelte
{#if showConfirm}
	<ConfirmDialog
		title="Archive Personnel"
		message="Archived personnel leave active rosters and reports. Records are not erased."
		confirmLabel="Archive"
		variant="warning"
		onConfirm={handleArchive}
		onCancel={() => (showConfirm = false)}
	/>
{/if}
```

Props: `title: string`, `message: string`, `confirmLabel?: string`, `cancelLabel?: string`, `variant?: 'destructive' | 'danger' | 'warning' | 'primary' | 'secondary'`, `disabled?: boolean`, `loading?: boolean`, `onConfirm: () => void | Promise<void>`, `onCancel: () => void`

Guidance:

- Use `variant="destructive"` or legacy alias `variant="danger"` for delete, permanent remove, revoke, and irreversible actions.
- Use `variant="warning"` for archive, cancel, transfer, bulk change, or workflow changes that preserve data but alter active state.
- Use `variant="primary"` or `variant="secondary"` only for non-destructive confirmations.
- Return the mutation's promise from `onConfirm` and keep the confirmation mounted until it settles: close it from the success path, not before the await. While the promise is pending both actions are disabled, a spinner renders inside the confirm button, `aria-busy` is set and Escape is ignored. An outside click never closes a confirmation.
- Routes may pass labels, state, handlers, and disabled/loading flags only. Do not pass visual classes or wrap this component to change appearance for one route.

---

## `ui/badge`

Shadcn-svelte badge primitive for migrated Tailwind surfaces. Use semantic variants for route status instead of local badge color classes.

```svelte
<Badge variant="success">Ready</Badge>
<Badge variant="warning">Review</Badge>
<Badge variant="info">Info</Badge>
<Badge variant="danger">Blocked</Badge>
```

Compatibility note: the legacy `ui/Badge.svelte` wrapper with `label`, `color`, and `textColor` props has been removed. Admin and route status labels should map product state to semantic badge variants instead of raw color strings.

Props: native anchor/span attributes, `variant?: 'default' | 'secondary' | 'destructive' | 'danger' | 'warning' | 'info' | 'success' | 'outline' | 'ghost' | 'link'`

Badge guidance:

- Use `success`, `warning`, `info`, and `danger` only for real status or classification.
- Keep `destructive` for shadcn compatibility and destructive UI states. Prefer `danger` for general status labels such as blocked, overdue, or risk.
- Do not pass route-local visual classes to recolor badges unless Robert approved that specific visual exception.

---

## `ui/spinner`

Loading spinner for async buttons.

```svelte
<Button disabled={saving}>
	{#if saving}<Spinner />{/if}
	{saving ? 'Saving...' : 'Save'}
</Button>
```

Props: SVG attributes, including `class`, `aria-label`, `role`, and icon-compatible `color`/`stroke`.

Compatibility note: the legacy `ui/Spinner.svelte` wrapper and `.spinner` selector have been removed. Import `{ Spinner }` from `$lib/components/ui/spinner`.

---

## Shared Form Controls

New form work should use the shadcn-svelte-backed shared control system. The durable public API is compound and explicit: routes compose labels, controls, descriptions, errors, values, disabled state, and handlers. Routes must not restyle controls locally.

```svelte
<script lang="ts">
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Select from '$lib/components/ui/select';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as RadioGroup from '$lib/components/ui/radio-group';

	let title = $state('');
	let notes = $state('');
	let status = $state('ready');
	const notesError = $derived(notes.trim() ? '' : 'Notes are required.');
</script>

<Field.Root>
	<Field.Label for="task-title">Task title <span aria-hidden="true">*</span></Field.Label>
	<Field.Control>
		<Input id="task-title" name="title" bind:value={title} required />
	</Field.Control>
	<Field.Description>Use the official task name.</Field.Description>
</Field.Root>

<Field.Root data-invalid={notesError ? true : undefined}>
	<Field.Label for="task-notes">Notes</Field.Label>
	<Field.Control>
		<Textarea id="task-notes" bind:value={notes} />
	</Field.Control>
	{#if notesError}
		<Field.Error>{notesError}</Field.Error>
	{/if}
</Field.Root>

<Field.Root>
	<Field.Label id="status-label">Status</Field.Label>
	<Field.Control>
		<Select.Root type="single" bind:value={status}>
			<Select.Trigger aria-labelledby="status-label">Ready</Select.Trigger>
			<Select.Content>
				<Select.Item value="ready" label="Ready" />
				<Select.Item value="watch" label="Watch" />
			</Select.Content>
		</Select.Root>
	</Field.Control>
</Field.Root>

<Field.Root orientation="horizontal">
	<Checkbox id="include-archive" />
	<Field.Label for="include-archive">Include archived records</Field.Label>
</Field.Root>

<RadioGroup.Root bind:value={status}>
	<Field.Root orientation="horizontal">
		<RadioGroup.Item id="standard" value="standard" />
		<Field.Label for="standard">Standard</Field.Label>
	</Field.Root>
</RadioGroup.Root>
```

Public components:

- `Field.Root`: group wrapper for one field. Use `orientation="horizontal"` for checkbox and radio rows.
- `Field.Group`: stacked field group for related controls.
- `Field.Control`: control slot wrapper that keeps shared controls full-width without route-local styling.
- `Field.Label`, `Field.Description`, `Field.Error`: label, hint, and error text. Wire the label with `for` or `aria-labelledby`. Each rendered Description and Error inside a `Field.Root` registers its ID (generated unless the caller passes `id`), and the contained `Input`, `Textarea`, `NativeSelect`, `Select.Trigger`, `Combobox.Trigger` and `DatePicker` add those IDs to `aria-describedby` and set `aria-invalid="true"` while an Error is shown. A caller's own `aria-describedby` IDs come first and a caller's `aria-invalid` wins. Popover content starts outside the Field, so a search box in a popup is not described by the trigger's Field. Registration happens on mount; a server-rendered form whose errors must be associated before hydration still wires its IDs explicitly, as `AuthField` does.
- `Input`, `Textarea`, `Select.Root/Trigger/Content/Item`, `Checkbox` and `RadioGroup.Root/Item` are the shared controls.

Rules:

- Use `Select` for selects by default so option controls keep the same visual shape across Windows, macOS, Linux, and browser engines.
- Keep `NativeSelect` only for explicit native form-submission or mobile-picker requirements approved at the shared-component level. Account Profile's rank list is one: its form posts natively and works before hydration.
- Use `Checkbox` for selection, inclusion or batch choices.
- Use validation errors over hints when both exist. Render the error as `Field.Error` inside the control's `Field.Root` so the association and `aria-invalid` follow it; an alert elsewhere in the dialog is not associated.
- Required markers are visual only with `aria-hidden="true"`; keep native `required` on native controls where submission validation matters.
- Disabled and read-only states come from the shared controls. Do not add local opacity, colors, borders, spacing, or typography to route code.
- Toolbar-compact usage should compose the same controls inside `WorkspaceToolbar.Group`, using shared active counts rather than visual route overrides.

## `ui/combobox`

Compound shadcn-style combobox primitives for searchable single-select and multi-select controls. Use this as the `SearchSelect` replacement.

```svelte
<script lang="ts">
	import * as Combobox from '$lib/components/ui/combobox';

	const people = [
		{ value: 'avery', label: 'Avery Brooks', description: 'HQ', group: 'HQ' },
		{ value: 'maya', label: 'Maya Chen', description: 'A Co', group: 'Line companies' },
		{ value: 'jon', label: 'Jon Bell', description: 'B Co', group: 'Line companies', disabled: true }
	];
	let selectedPerson = $state('');
</script>

<Combobox.Root items={people} name="personId" autoHighlight bind:value={selectedPerson} label="Person">
	<Combobox.Trigger clearable aria-label="Person">
		{people.find((person) => person.value === selectedPerson)?.label ?? 'Search personnel'}
	</Combobox.Trigger>
	<Combobox.Content>
		<Combobox.Search placeholder="Search personnel..." />
		<Combobox.Empty>No people found.</Combobox.Empty>
		<Combobox.List>
			{#snippet children(value, option)}
				<Combobox.Item {value} label={option.label} description={option.description} />
			{/snippet}
		</Combobox.List>
	</Combobox.Content>
</Combobox.Root>
```

For multi-select behavior, use `Combobox.Root multiple` with its chip parts.

Props: `Root` accepts `items: readonly (string | { value: string; label?: string; description?: string; group?: string; disabled?: boolean })[]`, `value?: string | string[]` (bindable), `defaultValue?: string | string[]`, `name?: string`, `multiple?: boolean`, `autoHighlight?: boolean`, `disabled?: boolean`, `loading?: boolean`, `loadingText?: string`, `open?: boolean` (bindable), `label?: string`, `onValueChange?: (value) => void`. `Trigger` supports `clearable?: boolean`. `Search` wraps the command input and keeps filtering inside the shared primitive. `Chip` and `Item` require `value: string`; `Item` can also receive `label`, `description`, and `searchValue`.

- Use for large option lists, searchable personnel/template/type lookup, clearable and non-clearable search selection, and no-results states.
- Pass string items for simple lists. Pass object options when routes need stable ids, display labels, descriptions, group headings, or disabled options.
- When `name` is provided, `Combobox.Root` renders hidden inputs for native form submission. Single-select renders one hidden input; multi-select renders one hidden input per selected value using the same name.
- Use `loading` and `loadingText` for async option fetches. Keep the loading copy generic and route-owned; the visual loading state stays in the shared component.
- `Combobox.Trigger` opens by ArrowDown, Enter or Space. Popup search (or the option container when search is omitted) receives focus; Arrow keys navigate enabled options, Enter commits the option's value and closes single selection, and Escape dismisses without a value change and returns focus to the trigger. The popup is nonmodal by default: outside interaction dismisses without stealing focus; an explicit Content `trapFocus` override remains available.
- `Combobox.Chips`, `Combobox.ChipsInput`, and `Combobox.Chip` support chip-style multi-selection. The inline input keeps focus for search and keyboard selection; selected options toggle while the popup stays open, and Escape closes it. One Command context owns both inline input and popup; its DOM element is rendered inside the portal around its options. Do not move the context into Content or add a second Command root.
- Large lists, async/loading option states, empty states, and keyboard paths must be proven in `docs/component-catalog.md` before route usage.
- Visual changes belong in shared combobox source only.

## `ui/empty`

Composable empty list placeholder.

```svelte
<Empty.Root>
	<Empty.Header>
		<Empty.Title>No items yet.</Empty.Title>
		<Empty.Description>Add the first item to start this workflow.</Empty.Description>
	</Empty.Header>
	<Button size="sm">Add Item</Button>
</Empty.Root>
```

Compatibility note: the legacy `ui/EmptyState.svelte` wrapper has been removed. Compose `ui/empty` with `Button`, links, or route actions.

The root and Organization error boundaries and `WorkspaceAccessRestricted` compose `ui/empty` for their status, message and recovery action. A page's `h1` stays a heading element inside `Empty.Header` where the page needs one. `Empty.Root` is full width, so a caller that adds outer margins also sets `w-auto` to keep the margins inside its column.

---

## File Upload Pattern

The legacy `ui/FileUpload.svelte` wrapper has been removed. Upload workflows should compose `Field`, `Input type="file"`, `Button`, `Spinner`, `Alert`, and `Progress` as needed, keeping endpoint behavior in the owning feature.

**States**: empty file input or drop zone, uploading progress, selected-file display, file exists, remove, and error feedback.
**Endpoint contract** for sign-in roster signed scans:

- `POST uploadUrl` with `FormData(file)` returns `{ filePath: string }`
- `GET downloadUrl` returns `{ url: string }`
- `DELETE removeUrl` returns `200 OK`

**Storage path convention**: `{orgId}/{scope}/{recordId}/{sanitized-filename}.pdf`

---

## `ui/toolbar`

Removed. Use `patterns/workspace-toolbar` and generated shadcn-svelte primitives instead.

## `patterns/type-management-workspace`

Shared shadcn-aligned workspace chrome for manage-type pages. Training types, status types, assignment types, and similar configuration lists can use it when they need a list-detail layout, create/edit mode, row actions, form sections, detail facts, progressive disclosure, or a mobile list/detail flow.

The component owns the repeated visual structure: page workspace spacing, list/detail grid, selectable rows, swatches, section chrome, detail headers, configuration facts, progressive disclosure, mobile back affordance, and footer actions. Routes own behavior: fetching, selected item state, permissions, validation, persistence, field controls, destructive-confirm copy, and ordering rules.

```svelte
<script lang="ts">
	import * as TypeWorkspace from '$lib/components/patterns/type-management-workspace';
	import { Button } from '$lib/components/ui/button';

	let color = $state('#8a5800');
</script>

<TypeWorkspace.Root aria-label="Training type management workspace">
	<TypeWorkspace.Layout>
		<TypeWorkspace.List mobileHidden={mobileDetailOpen}>
			<TypeWorkspace.ItemList role="listbox" aria-label="Training types">
				<TypeWorkspace.ListItem
					title="Annual Qualification"
					description="Expires after 12 months"
					color="#8a5800"
					selected
					onselect={selectType}
				>
					{#snippet actions()}
						<Button variant="outline" size="icon" type="button" aria-label="Move up">...</Button>
					{/snippet}
				</TypeWorkspace.ListItem>
			</TypeWorkspace.ItemList>
		</TypeWorkspace.List>

		<TypeWorkspace.Detail mobileHidden={!mobileDetailOpen}>
			<TypeWorkspace.MobileBack onclick={showList}>Training types</TypeWorkspace.MobileBack>
			<TypeWorkspace.Stack>
				<TypeWorkspace.DetailHeader title="Annual Qualification" color="#8a5800">
					{#snippet actions()}
						<Button variant="outline" size="sm" type="button">Edit</Button>
					{/snippet}
				</TypeWorkspace.DetailHeader>

				<TypeWorkspace.FormSection title="Basics">
					<!-- route-owned Field/Input controls -->
				</TypeWorkspace.FormSection>

				<TypeWorkspace.Description>Optional detail copy.</TypeWorkspace.Description>
				<TypeWorkspace.ColorInput bind:value={color} />

				<TypeWorkspace.Choice>
					<!-- route-owned radio/checkbox controls inside shared choice chrome -->
				</TypeWorkspace.Choice>

				<TypeWorkspace.Disclosure
					title="Targeting"
					description="Reveal detailed applicability controls only when needed."
				>
					<TypeWorkspace.ChoiceGroup>
						<!-- route-owned chip/button controls -->
					</TypeWorkspace.ChoiceGroup>
				</TypeWorkspace.Disclosure>

				<TypeWorkspace.FactList>
					<TypeWorkspace.Fact label="Expiration">12 months</TypeWorkspace.Fact>
				</TypeWorkspace.FactList>
			</TypeWorkspace.Stack>
		</TypeWorkspace.Detail>
	</TypeWorkspace.Layout>
</TypeWorkspace.Root>
```

Public components:

- `Root`, `Layout`, `List`, `ItemList`, `ListItem`, `Detail`, `Stack`, `FormSection`, `Choice`, `ChoiceGroup`, `Disclosure`, `Description`, `ColorInput`, `MobileBack`, `DetailHeader`, `FactList`, `Fact`, `FooterActions`, `ActionSpacer`.

Key props:

- `List` and `Detail`: `mobileHidden?: boolean` hides that pane below the large breakpoint while preserving the shared desktop split.
- `Disclosure`: `title`, `description?`, and `open?` for shared progressive reveal around larger option groups.

Rules:

- Do not restyle the workspace from route code. Add shared variants here when a repeated manage-type need appears.
- Use `ListItem` for selectable type rows instead of rebuilding row chrome in each route.
- Use `FormSection` for repeated edit/create sections instead of route-local bordered fieldset classes; the shared layout renders them as ruled sections, not stacked cards.
- Use `Choice` for repeated radio/checkbox option rows instead of route-local bordered option classes.
- Use `ColorInput`, `Description`, and `ActionSpacer` when those repeated manage-type details are needed.
- Use `Fact` for configuration facts such as expiration policy, permission state, ordering, and applicability. Facts render as scan-friendly rows, not individual cards. Do not put readiness/report metrics in a type manager.
- Use `Disclosure` for large applicability, targeting, or exclusion option sets instead of route-local chip wrappers. Training's applicability editor owns its searchable `GroupSelector`.
- Use `MobileBack` with `List mobileHidden` and `Detail mobileHidden` when a route needs a mobile list-first flow.
- Keep color swatches accessible by pairing color with labels, summaries, badges, or visible text.
- Prove visual changes in `docs/component-catalog.md` before production routes consume them.

---

## `ui/skeleton`

Use for loading states in pages that use `defer: true` streaming loads.

```svelte
import {Skeleton} from '$lib/components/ui/skeleton';

<!-- Block: card, image, hero area -->
<Skeleton class="h-[120px] w-full rounded-lg" />

<!-- Line: text, labels -->
<Skeleton class="h-4 w-[60%]" />

<!-- Grid: table/matrix skeleton -->
<div class="grid grid-cols-4 gap-2" aria-hidden="true">
	{#each Array(20) as _, index (index)}
		<Skeleton class="h-[38px] w-[120px]" />
	{/each}
</div>
```

The legacy `SkeletonBlock`, `SkeletonLine`, `SkeletonGrid`, and `.skeleton-pulse` wrappers have been removed. Preserve loading-state dimensions with Tailwind utilities on `Skeleton` and mark grouped skeleton-only placeholders with `aria-hidden="true"` when a parent status region already announces loading.

---

## `ui/data-table`

Composable shadcn-svelte DataTable foundation built from the calibrated `ui/table`, `checkbox`, `dropdown-menu`, `skeleton`, `empty`, `button`, and shared toolbar primitives. It is the production DataTable system; the old DataTable implementation and its tests have been removed.

The DataTable API is deliberately modular. Simple tables can render only `DataTable`; richer tables can opt into search, pagination, row actions, bulk selection, loading, grouping, dense layout, and toolbar controls one piece at a time.

```svelte
<script lang="ts">
	import * as DataTable from '$lib/components/ui/data-table';
	import * as WorkspaceToolbar from '$lib/components/patterns/workspace-toolbar';
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
- `Search`: shared search input wired to `DataTableState<T>`.
- `SelectionCheckbox`: row/header checkbox primitive for table selection.
- `BulkActions`: selected-count region for toolbar/bulk commands.
- `RowActions`: shared dropdown-menu row action trigger.
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
- If a table needs a new durable visual state or behavior primitive, add it under `src/lib/components/ui/data-table/**`, document it here, and prove it in `docs/component-catalog.md`.
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

### Current Token API

New work should use shadcn-svelte and Tailwind v4 semantics from `src/app.css`: `@theme inline`, shadcn CSS variables, Tailwind utility classes, and shared component source under `src/lib/components/ui/**`.

The old TroopToTask canonical alias layer has been removed. Do not introduce route-local variables or compatibility aliases that recreate the old parallel API. If a durable visual decision is needed, put it in shadcn semantic tokens, a Tailwind theme mapping, or the smallest shared component boundary that owns the behavior.

### Palette

Use these semantic tokens and Tailwind utilities:

`--background` / `bg-background` | `--foreground` / `text-foreground` | `--card` / `bg-card` | `--muted` / `bg-muted` | `--muted-foreground` / `text-muted-foreground` | `--accent` / `text-accent` | `--destructive` / `text-destructive` | `--border` / `border` | `--ring` / `ring-ring`

Status colors have their own raw tokens, separate from the amber brand `--accent` and the chart series:

`success` -> `--success`
`warning` -> `--warning`
`info` -> `--info`
`danger` -> `--destructive`

Status text uses `text-*-foreground`, backed by separate `--danger-foreground`, `--warning-foreground`, `--success-foreground` and `--info-foreground` tokens that meet WCAG AA on page and muted status surfaces; the base status colors are fills, not text. Raw values live once in `:root` and once in `:root[data-theme='dark']`; each `--color-*` mapping is declared once in `@theme inline`. Chrome and the stepped readiness ramp (`--readiness-band-*`) are identical in both themes and are declared only in `:root`. Global element defaults sit in `@layer base`, so primitive variants and utilities override them.

Use `bg-success-muted`, `text-success-foreground`, `bg-warning-muted`, `text-warning-foreground`, `bg-info-muted`, `text-info-foreground`, `bg-danger-muted`, and `text-danger-foreground` through shared components where possible.

### Typography

The document default font is the app sans (`var(--font-sans)`), so portaled overlays such as the mobile drawer inherit it. Auth Shell sets `font-body` (Source Serif 4) on its own wrapper, and the public site sets its own families.

Use Tailwind typography utilities and shared component defaults. If scoped CSS truly needs a family, use the concrete family stack rather than a global alias:

`'Barlow Condensed', sans-serif`
`'Source Serif 4', serif`
`'IBM Plex Mono', monospace`

### Spacing / Border / Elevation

Use Tailwind spacing, radius, border, ring, and shadow utilities instead of root spacing and elevation aliases. In scoped CSS, use concrete rem values for component-local layout or move the style into shared component source.

Calibrated Tailwind radius scale:

`rounded-sm: 2px` | `rounded-md: 4px` | `rounded-lg: 6px`

### Focus And Motion

Global app concerns retained in `src/app.css`:

`--focus-outline` | `--focus-outline-offset` | `--focus-ring` | `--transition-fast` | `--transition-normal` | `--transition-slow`

These support native controls and legacy public-page CSS while the shared component system remains the preferred path for new interactions.

### Chrome / App Shell Tokens

Semantic tokens for the header, nav, and app shell. These are app-shell owned, not general-purpose color aliases.

| Token                       | Purpose                  |
| --------------------------- | ------------------------ |
| `--color-chrome`            | App shell background     |
| `--color-chrome-text`       | App shell text           |
| `--color-chrome-text-muted` | App shell secondary text |
| `--color-chrome-border`     | App shell borders        |

### Component-Owned Constants

Calendar and long-range matrix sizing is component-owned. Use component-local custom properties such as `--calendar-cell-width`, `--calendar-personnel-column-width`, and `--long-range-*` only inside the calendar/matrix boundary.

### Removed Global Utilities

Global utility selectors such as `.page-scroll`, `.spacer`, `.checkbox-label`, `.field-hint`, `.field-support`, `.text-primary`, `.text-success`, and `.text-warning` have been removed. Use Tailwind utilities or shared shadcn components instead.

Global `.btn`, `.input`, `.select`, `.label`, `.form-group`, and `.card` compatibility selectors were removed in an earlier cleanup. New or migrated production surfaces should compose `ui/button`, `ui/input`, `ui/textarea`, `ui/native-select` or `ui/select`, `ui/label`, `ui/field`, and `ui/card` instead.
