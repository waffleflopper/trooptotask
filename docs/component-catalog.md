# Component Catalog & CSS Design System

Shared UI primitives live in `src/lib/components/ui/`. Import via `$lib/components/ui/...`.
Layout components such as `Modal` live in `src/lib/components/`. Import via `$lib/components/...`.
Public marketing primitives live in `src/lib/components/public/`. Import via `$lib/components/public/...`.

---

## UI Foundation Showroom

Development route: `/ui-showroom`

The showroom is the only approved preview and calibration surface for the shadcn-svelte + Tailwind v4 migration foundation. It is development-only and returns 404 outside `dev` mode.

Use it to review shadcn-svelte primitives at desktop and mobile widths before production route migration work starts. The route renders docs-style examples of the selected foundation set: button, button group, input, input group, sidebar, navigation menu, label, textarea, select, checkbox, switch, radio group, badge, alert, dialog, sheet, popover, dropdown menu, tooltip, command, combobox, tabs, table, pagination, calendar/date picker, chart, skeleton, progress, spinner, empty, and separator.

Development route: `/ui-showroom/conversion-map`

Use the conversion map to compare current repeated TroopToTask building blocks against the current shadcn-svelte/shared UI target. Blank target cells mean the project has not selected a shadcn-svelte equivalent yet and needs a shared-component decision before route migration relies on that pattern.

Replacement previews:

- Production DataTable surfaces use the shadcn-svelte `ui/data-table` foundation shown in this showroom.
- Legacy `toolbar` is represented by the shadcn-composed `ui/workspace-toolbar` example using `input-group`, `select`, `button-group`, `button`, and `dropdown-menu`.
- Legacy `EmptyState` is represented by the shadcn `empty` component.
- Legacy `FileUpload` is represented by the native shadcn `input type="file"` example.
- Legacy `FormField` is replaced by the shadcn-backed `ui/field` compound primitives plus `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Combobox`, and `MultiSelect`.
- Legacy `SearchSelect` is replaced by the shadcn-style `ui/combobox` compound API.
- Legacy `MultiTagSelect` is replaced by the shadcn-style `ui/multi-select` compound API with chips.
- Legacy `Spinner` is represented by the shadcn `spinner` component.

Rules:

- Shared components are visually authoritative. Production routes consume shared component appearance as-is.
- Visual styling comes from `src/app.css`, `components.json`, theme variables, or shared component source files under `src/lib/components/**`.
- `/ui-showroom` should stay docs-like: no route-local component skinning, no custom variants, and no visual tuning of generated components.
- The approved migration baseline is the shadcn-svelte visual appearance shown in `/ui-showroom` and `/ui-showroom/app-shell`. Non-component route layout and legacy CSS should migrate to Tailwind utilities that match that baseline, using shared tokens such as `bg-background`, `bg-card`, `text-muted-foreground`, `border`, `rounded-lg`, spacing scale utilities, and calibrated shared component composition.
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

## `ui/date-picker`

Shared shadcn-svelte date picker composed from `button`, `popover`, and `calendar`. Use this instead of route-local `input type="date"` controls when a production form needs the showroom date picker appearance.

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
- Calendar and popover appearance must be calibrated in `/ui-showroom` before production route usage changes.

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

## `ui/report-workspace`

`ui/report-workspace` is the shared shadcn-svelte-backed foundation for operational report pages and report sections. It standardizes report structure, toolbar placement, filter/configuration panels, chart/table sections, report states, and export actions without owning feature calculations.

```svelte
<script lang="ts">
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
</script>

<ReportWorkspace.Root ariaLabel="Training report workspace">
	<ReportWorkspace.Header
		title="Training report"
		description="Training completion by group and date range."
		meta={[{ label: 'Window', value: '30 days' }]}
	/>

	<ReportWorkspace.Toolbar ariaLabel="Training report controls">
		<WorkspaceToolbar.Group label="Training report filters" activeCount={activeFilterCount}>
			<!-- route-owned filter controls -->
		</WorkspaceToolbar.Group>
		<WorkspaceToolbar.Group label="Training report exports" zone="actions">
			<ReportWorkspace.ExportActions>
				<ReportWorkspace.ExportAction label="Export CSV" href={exportHref} state={exportState} disabledReason={exportDisabledReason} />
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
		<ReportWorkspace.Table title="Detail rows" data={rows} columns={columns} ariaLabel="Training detail rows" />
	</ReportWorkspace.Content>
</ReportWorkspace.Root>
```

Public components:

- `Root`: report workspace shell. Props: `ariaLabel?: string`, `children?: Snippet`.
- `Header`: report title, description, and metadata. Props: `title`, `description?`, `meta?`, `actions?`.
- `Toolbar`: thin wrapper around `WorkspaceToolbar.Root`. Props: `ariaLabel`, `children`.
- `Filters`: configuration panel with optional date-range and actions regions. Props: `title?`, `description?`, `dateRange?`, `actions?`.
- `Content`: report section layout. Props: `layout?: 'stack' | 'split'`.
- `Section`: generic bounded report section. Props: `title`, `description?`, `meta?`, `actions?`.
- `Chart`: chart section with accessible chart region. Props: `title`, `description?`, `meta?`, `ariaLabel?`.
- `Table`: DataTable-backed report table section. Props include `data`, `columns`, `table`, `ariaLabel`, `emptyMessage`, `loading`, `showSearch`, `searchPlaceholder`, `pageSize`, and cell/header snippets.
- `State`: shared `loading`, `no-data`, and `error` report states.
- `ExportActions`: grouped export region.
- `ExportAction`: shared export command. Props: `label`, `state?: 'ready' | 'loading' | 'disabled' | 'error'`, `disabledReason?`, `errorReason?`, `loading?`, `loadingLabel?`, plus button props such as `href`.

Shared components own:

- Report page/section structure, spacing, borders, responsive wrapping, state presentation, disabled export affordance, and DataTable section framing.
- Composition with `ui/workspace-toolbar`, `ui/data-table`, shadcn `button`, `empty`, `alert`, and `spinner`.

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
- If a report needs a reusable new section shape, add it to `ui/report-workspace`, show it in `/ui-showroom`, and document it here before route usage.

Migration notes:

- Calendar reports should migrate first because they already have multiple report subtypes and date-oriented filters.
- Critical Tasks reports should follow because they already use the shared toolbar but still carry route-local report grids, states, and chart/table shells.
- Training reports should follow after Calendar/Critical Tasks settle table and export state conventions.
- Personnel report-like flows should migrate after bulk import/merge surfaces are separated from the current combined manager.

---

## `ui/report-chart`

`ui/report-chart` is the shared shadcn-svelte chart target for operational reports. It composes the generated `ui/chart` container with LayerChart simplified charts so production report routes do not each own axis, grid, legend, and series setup.

Current chart inventory:

- Critical Tasks readiness trend maps to `ReportLineChart` with multiple series.
- Critical Tasks expiration cliff maps to `ReportBarChart layout="stack"`.
- Critical Tasks readiness distribution maps to `ReportBarChart layout="group"` or `layout="overlap"`.
- No current report usage requires a shadcn area chart. Add an area wrapper only when a real route needs cumulative or filled-trend semantics.

Public components:

- `ReportLineChart`: multi-series line chart. Props: `data`, `series`, `ariaLabel`, `yDomain?`, `yTicks?`, `heightClass?`, `class?`.
- `ReportBarChart`: multi-series bar chart. Props: `data`, `series`, `ariaLabel`, `layout?: 'group' | 'stack' | 'overlap'`, `yDomain?`, `yTicks?`, `heightClass?`, `class?`.

Routes configure:

- Data rows, series keys, labels, chart colors, domains, tick values, and surrounding report copy.

Shared components own:

- shadcn chart container usage, LayerChart simplified chart composition, axis baseline, grid styling, legend structure, and responsive chart frame.

`/ui-showroom/conversion-map` shows the Critical Tasks chart mapping and the line, stacked bar, and overlap bar target examples.

---

## `ui/requirement-status-badge`

`ui/requirement-status-badge` owns shared requirement status visuals for Training and Critical Tasks. Badges are for legends, summaries, and compact status chips. Training matrix and report cells should use `TrainingStatusCell` so the status color belongs to the cell background and the visible text can stay focused on the associated date or compact value.

```svelte
<script lang="ts">
	import { TrainingStatusBadge, TrainingStatusCell } from '$lib/components/ui/requirement-status-badge';
</script>

<TrainingStatusBadge status="current" label="Current" />
<TrainingStatusCell status="warning-yellow" label="2026-05-10" srLabel="Expiring Soon" />
```

Public components:

- `TrainingStatusBadge`: badge/chip for Training status legends and summaries.
- `TrainingStatusCell`: compact status-colored Training cell. Props: `status`, `label`, `srLabel?`, plus normal `span` attributes.
- `CriticalTaskStatusBadge`: badge/chip for Critical Tasks status legends and summaries.

Rules:

- Routes may pass status keys, visible labels, and screen-reader labels.
- Routes must not restyle Training status colors, cell typography, radius, density, or ring treatment locally.
- Use `TrainingStatusCell` inside `ui/operational-matrix` and Training report tables when the cell background carries the status.

---

## `ui/readiness-band`

`ui/readiness-band` is the shared shadcn-svelte-style visual contract for Critical Tasks report readiness tiers. It preserves the current report semantics and band colors while moving heat-cell and legend styling out of production route files.

```svelte
<script lang="ts">
	import * as ReadinessBand from '$lib/components/ui/readiness-band';
</script>

<ReadinessBand.Cell tier="okay" percent={84} aria-label="11B weapons readiness: 84%, 21 of 25 current" />
<ReadinessBand.Legend />
```

Public components:

- `Cell`: compact report heat-cell. Props: `tier`, `percent?`, `label?`, `children?`, plus normal `span` attributes.
- `Legend`: readiness tier legend. Props: `items?`, `ariaLabel?`, plus normal `ul` attributes.
- `Swatch`: visual swatch used by `Legend`. Props: `tier`, plus normal `span` attributes.

Public helpers:

- `readinessBandLegendItems`
- `readinessBandTierForPercent(percent)`
- `formatReadinessBandPercent(percent)`

Rules:

- Keep the thresholds centralized: `<60%`, `60-69%`, `70-79%`, `80-89%`, `90%+`, and not applicable.
- Routes may pass data, labels, and accessible names. They must not restyle readiness colors, hatching, radius, typography, or density locally.
- `ui/operational-matrix` may host these cells during a future matrix migration, but readiness-tier meaning stays in `ui/readiness-band`, not in the matrix primitive.

---

## `ui/operational-matrix`

`ui/operational-matrix` is a headless-first compound table primitive for dense row-by-column operational workflows. It follows `docs/plans/2026-05-08-headless-operational-matrix-spec.md`.

```svelte
<script lang="ts">
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
</script>

<OperationalMatrix.Root rows={rows} columns={columns} rowGroups={rowGroups} selectedCell={selectedCell} onCellSelect={handleCellSelect}>
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
- Dialogs belong in wrappers/showroom examples. `Cell` emits row and column identity; it does not open dialogs itself.
- Color-only cells must provide an accessible label through `ariaLabel`, visually hidden text, or both.
- Production route migration is a later phase. Do not consume this primitive from production routes until a route migration slice explicitly asks for it.

Showroom coverage:

- `/ui-showroom` covers grouped rows, sticky top header and row header, selected cell state, disabled/read-only cells, dialog-trigger cells, dense color-only cells with accessible labels, stacked month-band column headers, rich row headers with metadata, and loading/empty wrapper states.
- `/ui-showroom/conversion-map` covers training-matrix parity mapping with vertical task-code headers, requirement status badges, and the note that `IctMatrix` should retire into the shared training-matrix parity path instead of preserving a separate visual system.

## `ui/workflow-panel`

`ui/workflow-panel` is the shared shadcn-aligned panel family for manager and workflow surfaces that repeat a list-detail, two-panel, or configuration-panel shape. Use it with `ui/alert` for onboarding, training type, and workflow manager notices.

```svelte
<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import * as WorkflowPanel from '$lib/components/ui/workflow-panel';
</script>

<Alert.Root variant="warning">
	<Alert.Title>Review required before publishing</Alert.Title>
	<Alert.Description>Route-owned copy inside shared alert chrome.</Alert.Description>
</Alert.Root>

<WorkflowPanel.Root aria-label="Training type manager">
	<WorkflowPanel.Header>
		<WorkflowPanel.Title>Training type setup</WorkflowPanel.Title>
		<WorkflowPanel.Description>Shared list-detail shell.</WorkflowPanel.Description>
	</WorkflowPanel.Header>
	<WorkflowPanel.Content>
		<WorkflowPanel.Grid>
			<WorkflowPanel.Item selected>Annual qualification</WorkflowPanel.Item>
			<WorkflowPanel.Item>Configuration fields</WorkflowPanel.Item>
		</WorkflowPanel.Grid>
	</WorkflowPanel.Content>
</WorkflowPanel.Root>
```

Public components:

- `Root`, `Header`, `Title`, `Description`, `Content`, `Grid`, `Item`.

Rules:

- Routes own data loading, selected item state, forms, validation, permissions, actions, and copy.
- Shared components own panel radius, borders, spacing, selected-row treatment, notice tone, and density.
- Use `Alert.Root` variants `default`, `info`, `success`, `warning`, or `destructive` instead of route-local warning boxes, callouts, and notice panels.
- If a workflow needs a new repeated surface shape, add it here and prove it in `/ui-showroom/conversion-map` before production route usage.

---

## `ui/bulk-import-workspace`

`ui/bulk-import-workspace` is the shared foundation for operational import workflows. It standardizes source choice, upload/paste/manual input panels, validation summaries, preview tables, row selection, progress states, disabled submit reasons, and final result summaries. Feature routes still own parsing, validation rules, duplicate/merge semantics, permissions, and persistence.

```svelte
<script lang="ts">
	import * as BulkImportWorkspace from '$lib/components/ui/bulk-import-workspace';
	import { useDataTableSelection } from '$lib/components/ui/data-table';
</script>

<BulkImportWorkspace.Root ariaLabel="Personnel import workspace">
	<BulkImportWorkspace.Header title="Personnel import" step="Step 1" />

	<BulkImportWorkspace.SourcePicker label="Import source">
		<BulkImportWorkspace.SourceOption label="Upload" selected={source === 'upload'} onSelect={() => (source = 'upload')} />
		<BulkImportWorkspace.SourceOption label="Paste" selected={source === 'paste'} onSelect={() => (source = 'paste')} />
	</BulkImportWorkspace.SourcePicker>

	<BulkImportWorkspace.InputPanel title="Upload rows">
		<BulkImportWorkspace.FileInput bind:files label="Upload personnel file" error={fileError} />
	</BulkImportWorkspace.InputPanel>

	<BulkImportWorkspace.ValidationSummary issues={validationIssues} />

	<BulkImportWorkspace.PreviewTable
		rows={previewRows}
		columns={previewColumns}
		selection={selection}
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
- `PreviewTable`: DataTable-backed preview with optional `useDataTableSelection` row selection. Supports `rowStatus`, `disabledReason`, `statusColumnHeader`, and `selectedCountLabel`.
- `RowStatus`: shared per-row import status display. Props: `tone: 'valid' | 'warning' | 'error' | 'disabled' | 'duplicate' | 'info'`, `label?`, `description?`.
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
- Use `ResultSummary status="partial"` when some rows were saved and some failed.
- Use `ResultSummary status="failed"` when no requested rows were saved.
- Use `ProgressState` for parsing/importing work that blocks closing or submit actions.

Route-level visual override ban:

- Routes must not restyle the import workspace, source cards, input panels, validation summary, preview table, footer, or result summary locally.
- If an import workflow needs a durable capability the shared API cannot express, add it centrally and prove it in `/ui-showroom`.

Migration notes:

- Personnel bulk import/merge should migrate first because it already uses the new dialog and DataTable foundations but still contains route-local import source, preview, and result markup.
- Critical Tasks task import and completion import should follow because they share the same upload-preview-import-result state machine with domain-specific validation.
- Training bulk import should follow after paste/upload source choice settles in the shared API.
- Calendar bulk status add/remove/import should migrate after the import workspace proves partial-success and disabled-row handling.

Legacy note:

- `src/lib/components/ui/BulkImportTable.svelte` is deprecated for new work. It remains only because existing production consumers still use its mapping/editing behavior. New and migrated import flows should compose `BulkImportWorkspace.PreviewTable`, `BulkImportWorkspace.RowStatus`, `BulkImportWorkspace.ValidationSummary`, and route-owned parsing/mapping utilities instead.

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

<!-- With below slot for filters or local route controls -->
<PageToolbar title="Calendar">
    {#snippet below()}
        <ToolbarFilters {filters} />
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

## `ui/app-dialog`

Shared shadcn-svelte-backed dialog foundation for information, edit, form, and review workflows. Use this for standard dialogs that collect or show content. Use `ui/ConfirmDialog.svelte` for confirmations.

```svelte
<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';

	let open = $state(false);
	let saving = $state(false);
</script>

<AppDialog.Root bind:open closeBlocked={saving} onClose={() => (open = false)}>
	<AppDialog.Content closeBlocked={saving} size="default">
		<AppDialog.Header class="px-4 pt-4">
			<AppDialog.Title>Edit personnel metadata</AppDialog.Title>
			<AppDialog.Description>Update route-provided fields without route-local dialog styling.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body>
			<!-- form fields or review content -->
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" disabled={saving} onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit" form="personnel-form" disabled={saving}>Save</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
```

Public components:

- `AppDialog.Root`: controlled open state. Props: `open?: boolean` (bindable), `closeBlocked?: boolean`, `onClose?: () => void`, plus shadcn dialog root props.
- `AppDialog.Content`: shared shell with close button, constrained viewport, mobile-safe width, and close-blocking behavior. Props: `size?: 'default' | 'wide' | 'fullscreen'`, `closeBlocked?: boolean`, `showCloseButton?: boolean`.
- `AppDialog.Header`, `AppDialog.Title`, `AppDialog.Description`: accessible heading and description wiring. Use a description unless the title alone is enough for screen-reader context.
- `AppDialog.Body`: scrollable dialog body. Put long content and forms here.
- `AppDialog.Footer`: sticky action area outside the scrollable body.

Allowed route behavior knobs:

- Open/closed state, labels, form fields, validation, permissions, disabled/loading state, and action handlers.
- `size` only when content volume requires it: default for normal forms, `wide` for tables/import previews, `fullscreen` for rare constrained workspaces.
- `closeBlocked` during saves/imports/async confirms so Escape, outside click, and close buttons cannot interrupt in-flight operations.

Action guidance:

- Footer order is cancel/secondary before primary confirm on the right in desktop layout. Destructive side actions may appear before cancel only when the route already has that workflow requirement.
- Use `Button` variants for action semantics. Do not pass route-local classes to retune dialog spacing, radius, color, typography, shadow, animation, footer layout, or internal parts.
- Long dialog bodies must use `AppDialog.Body`; do not add route-local `max-height` or `overflow` wrappers to shared dialog internals.

`src/lib/components/Modal.svelte` is deprecated. It is currently shadcn-backed only to keep remaining legacy call sites working while migration continues. Do not add new `Modal` usages. Migrate old call sites to `ui/app-dialog` when their route slice is explicitly in scope.

---

## `ui/ConfirmDialog.svelte`

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
- While `onConfirm` is awaited, both actions are disabled, a spinner renders inside the confirm button, and Escape/outside-click close is blocked.
- Routes may pass labels, state, handlers, and disabled/loading flags only. Do not pass visual classes or wrap this component to change appearance for one route.

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
- Prefer shared semantic tokens (`--color-success`, `--color-warning`, `--color-danger`, `--color-info`) over arbitrary decorative colors when possible.

## `ui/badge`

Shadcn-svelte badge primitive for migrated Tailwind surfaces. Use semantic variants for route status instead of local badge color classes.

```svelte
<Badge variant="success">Ready</Badge>
<Badge variant="warning">Review</Badge>
<Badge variant="info">Info</Badge>
<Badge variant="danger">Blocked</Badge>
```

Status type colors are allowed through `statusType`, not through a raw color prop:

```svelte
<Badge statusType={status}>{status.name}</Badge>
```

Props: native anchor/span attributes, `variant?: 'default' | 'secondary' | 'destructive' | 'danger' | 'warning' | 'info' | 'success' | 'status' | 'outline' | 'ghost' | 'link'`, `statusType?: Pick<StatusType, 'id' | 'name' | 'color' | 'textColor'>`

Badge guidance:

- Use `success`, `warning`, `info`, and `danger` only for real status or classification.
- Keep `destructive` for shadcn compatibility and destructive UI states. Prefer `danger` for general status labels such as blocked, overdue, or risk.
- Use `statusType` when the color comes from a saved calendar status type, such as dashboard availability or calendar reports.
- Carry the status type object through the read model instead of flattening it to a route-owned color string.
- Do not pass route-local visual classes to recolor badges unless Robert approved that specific visual exception.

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

## `ui/stepper`

Shadcn-style compound primitive for workflow progress. Use this for new workflow step indicators that need explicit
step metadata, keyboard focus movement, disabled/error/completed states, or previous/next controls.

```svelte
<script lang="ts">
    import * as Stepper from '$lib/components/ui/stepper';

    const steps = [
        { value: 'draft', label: 'Draft', completed: true },
        { value: 'review', label: 'Review', description: 'Current approval stage' },
        { value: 'done', label: 'Done' }
    ];
</script>

<Stepper.Root {steps} value="review">
    <Stepper.List>
        {#each steps as step (step.value)}
            <Stepper.Item value={step.value} label={step.label} description={step.description} />
        {/each}
    </Stepper.List>
</Stepper.Root>
```

Use `Stepper.Item` with `label` and `description` for the default visual. Use child content only when composing a custom
item layout with `Stepper.Trigger`, `Stepper.Indicator`, `Stepper.Label`, and `Stepper.Description`.

---

## `ui/Stepper.svelte`

Linear stage indicator for multi-step workflows. Shows stages as connected dots with labels. Clickable when not disabled.
This legacy wrapper is preserved for existing route imports and delegates to `ui/stepper`.

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
    import { Switch } from '$lib/components/ui/switch';

    let title = $state('');
    let status = $state('ready');
</script>

<Field.Root>
    <Field.Label for="task-title">Task title <span aria-hidden="true">*</span></Field.Label>
    <Field.Control>
        <Input id="task-title" name="title" bind:value={title} required aria-describedby="task-title-help" />
    </Field.Control>
    <Field.Description id="task-title-help">Use the official task name.</Field.Description>
</Field.Root>

<Field.Root data-invalid>
    <Field.Label for="task-notes">Notes</Field.Label>
    <Field.Control>
        <Textarea id="task-notes" aria-invalid="true" aria-describedby="task-notes-error" />
    </Field.Control>
    <Field.Error id="task-notes-error">Notes are required.</Field.Error>
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

<Field.Root orientation="horizontal">
    <Switch id="approval-required" />
    <Field.Label for="approval-required">Approval required</Field.Label>
</Field.Root>

<RadioGroup.Root bind:value={status}>
    <Field.Root orientation="horizontal">
        <RadioGroup.Item id="standard" value="standard" />
        <Field.Label for="standard">Standard</Field.Label>
    </Field.Root>
</RadioGroup.Root>
```

Public components:

- `Field.Root`: group wrapper for one field. Use `orientation="horizontal"` for checkbox, radio, and switch rows.
- `Field.Group`: stacked field group for related controls.
- `Field.Control`: control slot wrapper that keeps shared controls full-width without route-local styling.
- `Field.Label`, `Field.Description`, `Field.Error`: label, hint, and error text. Wire `for`, `id`, `aria-describedby`, and `aria-invalid` explicitly.
- `Input`, `Textarea`, `Select.Root/Trigger/Content/Item`, `Checkbox`, `RadioGroup.Root/Item`, and `Switch` are the shared controls.

Rules:

- Use `Select` for selects by default so option controls keep the same visual shape across Windows, macOS, Linux, and browser engines.
- Keep `NativeSelect` only for explicit native form-submission or mobile-picker requirements approved at the shared-component level.
- Use `Checkbox` for selection, inclusion, or batch choices. Use `Switch` only for immediate on/off settings.
- Use validation errors over hints when both exist. Errors must set `aria-invalid="true"` on the control and reference the error id with `aria-describedby`.
- Required markers are visual only with `aria-hidden="true"`; keep native `required` on native controls where submission validation matters.
- Disabled and read-only states come from the shared controls. Do not add local opacity, colors, borders, spacing, or typography to route code.
- Toolbar-compact usage should compose the same controls inside `WorkspaceToolbar.Group`, using shared active counts rather than visual route overrides.

## Deprecated `ui/FormField.svelte`

`FormField.svelte` is deprecated for new work. It remains only for existing production routes until those routes migrate to the compound `ui/field` API.

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
        <Combobox.Empty>No people found.</Combobox.Empty>
        <Combobox.List>
            {#snippet children(value, option)}
                <Combobox.Item {value} label={option.label} description={option.description} />
            {/snippet}
        </Combobox.List>
    </Combobox.Content>
</Combobox.Root>
```

For multi-select behavior, either use `Combobox.Root multiple` directly or prefer the `ui/multi-select` namespace below when the control is conceptually a multi-select.

Props: `Root` accepts `items: readonly (string | { value: string; label?: string; description?: string; group?: string; disabled?: boolean })[]`, `value?: string | string[]` (bindable), `defaultValue?: string | string[]`, `name?: string`, `multiple?: boolean`, `autoHighlight?: boolean`, `disabled?: boolean`, `loading?: boolean`, `loadingText?: string`, `open?: boolean` (bindable), `label?: string`, `onValueChange?: (value) => void`. `Trigger` supports `clearable?: boolean`. `Chip` and `Item` require `value: string`; `Item` can also receive `label` and `description`.

- Use for large option lists, searchable personnel/template/type lookup, clearable and non-clearable search selection, and no-results states.
- Pass string items for simple lists. Pass object options when routes need stable ids, display labels, descriptions, group headings, or disabled options.
- When `name` is provided, `Combobox.Root` renders hidden inputs for native form submission. Single-select renders one hidden input; multi-select renders one hidden input per selected value using the same name.
- Use `loading` and `loadingText` for async option fetches. Keep the loading copy generic and route-owned; the visual loading state stays in the shared component.
- `Combobox.Trigger` is the single-select trigger. `Combobox.Chips`, `Combobox.ChipsInput`, and `Combobox.Chip` support chip-style multi-selection.
- Large lists, async/loading option states, empty states, and keyboard paths must be proven in `/ui-showroom` before route usage.
- Visual changes belong in shared combobox source only.

## `ui/multi-select`

Compound namespace for chip-based multi-selects. It composes the same shared combobox foundation but exposes the route-facing API as `MultiSelect.Root`, `MultiSelect.Trigger`, `MultiSelect.Content`, `MultiSelect.Item`, and `MultiSelect.Chip`.

```svelte
<script lang="ts">
    import * as MultiSelect from '$lib/components/ui/multi-select';

    const groups = [
        { value: 'hq', label: 'HQ', group: 'Staff' },
        { value: 'a-co', label: 'A Co', group: 'Line companies' },
        { value: 'b-co', label: 'B Co', group: 'Line companies' }
    ];
    let selectedGroups = $state<string[]>(['hq']);
</script>

<MultiSelect.Root items={groups} multiple name="groupIds" bind:value={selectedGroups} label="Groups">
    <MultiSelect.Trigger>
        <MultiSelect.Value>
            {#snippet children(values)}
                {#each values as groupValue (groupValue)}
                    {@const group = groups.find((option) => option.value === groupValue)}
                    <MultiSelect.Chip value={groupValue}>{group?.label ?? groupValue}</MultiSelect.Chip>
                {/each}
                <MultiSelect.Input placeholder="Groups" aria-label="Groups" />
            {/snippet}
        </MultiSelect.Value>
    </MultiSelect.Trigger>
    <MultiSelect.Content>
        <MultiSelect.Empty>No groups found.</MultiSelect.Empty>
        <MultiSelect.List>
            {#snippet children(value, option)}
                <MultiSelect.Item {value} label={option.label} />
            {/snippet}
        </MultiSelect.List>
    </MultiSelect.Content>
</MultiSelect.Root>
```

Toolbar compact pattern:

```svelte
<WorkspaceToolbar.Group label="Groups" activeCount={selectedGroups.length}>
    <MultiSelect.Root items={groups} multiple bind:value={selectedGroups} label="Groups">
        <MultiSelect.Trigger>
            <MultiSelect.Value>
                {#snippet children(values)}
                    <span>{values.length} selected</span>
                    <MultiSelect.Input aria-label="Groups" />
                {/snippet}
            </MultiSelect.Value>
        </MultiSelect.Trigger>
        <MultiSelect.Content>...</MultiSelect.Content>
    </MultiSelect.Root>
</WorkspaceToolbar.Group>
```

- Use for training, Critical Tasks, duty roster, calendar report, MOS/rank/group/role, and toolbar filters where several values can be active.
- Selected values should render as removable chips in regular forms and as an active count in compact toolbars.
- Backspace removes the last selected value when the search input is empty.
- Use the same object option shape as `Combobox.Root` when labels differ from submitted values, options need group headings, or selected chips should announce readable labels.
- Provide `name` when selected values must participate in native form submission.
- Do not pass color props or visual classes from routes. Domain colors require an explicit shared API and showroom example.

## Deprecated `ui/SearchSelect.svelte`

`SearchSelect.svelte` is deprecated for new work. Use `ui/combobox`.

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

## Deprecated `ui/MultiTagSelect.svelte`

`MultiTagSelect.svelte` is deprecated for new work. Use `ui/multi-select`.

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

## `ui/date-cell`

Token-aligned calendar/matrix day cell primitive. Use this for dense date status cells that need availability color, duty markers, weekend/holiday/today treatment, and the same visual language as `/ui-showroom/calendar`.

```svelte
<script lang="ts">
    import * as DateCell from '$lib/components/ui/date-cell';
</script>

<DateCell.Root
    today
    holiday
    holidayName="Training Holiday"
    statuses={[
        { id: 'leave', name: 'Leave', color: '#345b22', textColor: '#f7f8f4', note: 'Approved pass' }
    ]}
    markers={[
        { id: 'staff-duty', name: 'Staff Duty', shortName: 'SD', color: '#263f75', textColor: '#ffffff' }
    ]}
/>
```

Props: `statuses?: DateCellStatus[]`, `markers?: DateCellMarker[]`, `weekend?: boolean`, `today?: boolean`, `holiday?: boolean`, `holidayName?: string`, `onboarding?: boolean`, `showStatusText?: boolean`, `density?: 'month' | 'long-range'`, plus button attributes.

Compatibility: `ui/DateCell.svelte` remains available for current calendar consumers and delegates to `ui/date-cell`.

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

Compatibility wrapper for `ui/inline-notes`. Use `ui/inline-notes` for new shadcn-aligned work.

```svelte
<script lang="ts">
    import * as InlineNotes from '$lib/components/ui/inline-notes';
</script>

<InlineNotes.Root
    {notes}
    resolveAuthor={(userId) => personnelMap[userId]?.name ?? 'Unknown'}
    onAddNote={(text) => addNote(recordId, text)}
/>

<!-- Read-only -->
<InlineNotes.Root {notes} resolveAuthor={resolveAuthor} disabled />
```

Props: `notes: { text: string; timestamp: string; userId: string }[]`, `resolveAuthor: (userId: string) => string`, `onAddNote?: (text: string) => void`, `disabled?: boolean` (default `false`), `open?: boolean` (bindable)

- Collapsed by default; shows note count in a shared badge
- Cmd/Ctrl+Enter submits from the textarea
- Omit `onAddNote` for read-only display

---

## `ui/type-manager`

Compact compound management dialog for repeated status/type manager workflows. It composes `ui/app-dialog`, `ui/button`, `ui/empty`, and `ui/alert-dialog` while the route owns the form snippets and persistence.

Use `ui/type-manager` for small modal CRUD lists such as status types and assignment types when inline add/edit rows are enough. Use `ui/type-workspace` when the type surface needs a persistent list-detail workspace, ordering controls, multi-section forms, impact facts, or a full-page configuration flow.

```svelte
<script lang="ts">
    import * as TypeManager from '$lib/components/ui/type-manager';
</script>

<TypeManager.Root
    title="Status Types"
    noun="Type"
    items={statusTypes}
    onAdd={addStatusType}
    onUpdate={updateStatusType}
    onRemove={removeStatusType}
    onClose={closeManager}
    getAddData={getAddData}
    resetAddForm={resetAddForm}
    onEditStart={startEdit}
    getEditData={getEditData}
>
    {#snippet addForm()}
        <!-- route-owned shared controls -->
    {/snippet}

    {#snippet editForm()}
        <!-- route-owned shared controls -->
    {/snippet}

    {#snippet itemDisplay(item)}
        <span>{item.name}</span>
    {/snippet}
</TypeManager.Root>
```

Compatibility: `ui/TypeManager.svelte` delegates to `ui/type-manager` so existing status/type manager consumers keep their current API.

---

## `ui/type-workspace`

Shared shadcn-aligned workspace chrome for manage-type pages that need more than the compact modal helper. Training types, status types, assignment types, and similar configuration lists can use it when they need a list-detail layout, create/edit mode, row actions, form sections, and detail facts.

The component owns the repeated visual structure: page workspace spacing, list/detail grid, selectable rows, swatches, section chrome, detail headers, impact rows, and footer actions. Routes own behavior: fetching, selected item state, permissions, validation, persistence, field controls, destructive-confirm copy, and ordering rules.

```svelte
<script lang="ts">
	import * as TypeWorkspace from '$lib/components/ui/type-workspace';
	import { Button } from '$lib/components/ui/button';

	let color = $state('#8a5800');
</script>

<TypeWorkspace.Root aria-label="Training type management workspace">
	<TypeWorkspace.Layout>
		<TypeWorkspace.List>
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

		<TypeWorkspace.Detail>
			<TypeWorkspace.Stack>
				<TypeWorkspace.DetailHeader title="Annual Qualification" color="#8a5800">
					{#snippet actions()}
						<Button variant="outline" size="sm" type="button">Edit</Button>
					{/snippet}
				</TypeWorkspace.DetailHeader>

				<TypeWorkspace.Form title="Basics">
					<!-- route-owned Field/Input controls -->
				</TypeWorkspace.Form>

				<TypeWorkspace.Description>Optional detail copy.</TypeWorkspace.Description>
				<TypeWorkspace.ColorInput bind:value={color} />

				<TypeWorkspace.Choice>
					<!-- route-owned radio/checkbox controls inside shared choice chrome -->
				</TypeWorkspace.Choice>

				<TypeWorkspace.FactList>
					<TypeWorkspace.Impact label="Expiration">12 months</TypeWorkspace.Impact>
				</TypeWorkspace.FactList>
			</TypeWorkspace.Stack>
		</TypeWorkspace.Detail>
	</TypeWorkspace.Layout>
</TypeWorkspace.Root>
```

Public components:

- `Root`, `Layout`, `List`, `ItemList`, `ListItem`, `Detail`, `Stack`, `Form`, `FormSection`, `Choice`, `Description`, `ColorInput`, `DetailHeader`, `FactList`, `Impact`, `Fact`, `Actions`, `FooterActions`, `ActionSpacer`, `ActionsSpacer`.

Rules:

- Do not restyle the workspace from route code. Add shared variants here when a repeated manage-type need appears.
- Use `ListItem` for selectable type rows instead of rebuilding row chrome in each route.
- Use `Form` for repeated edit/create sections instead of route-local bordered fieldset classes.
- Use `Choice` for repeated radio/checkbox option rows instead of route-local bordered option classes.
- Use `ColorInput`, `Description`, and `ActionSpacer` when those repeated manage-type details are needed.
- Use `Impact` for repeated management facts such as affected records, expiration policy, permission state, and applicability.
- Keep color swatches accessible by pairing color with labels, summaries, badges, or visible text.
- Prove visual changes in `/ui-showroom` before production routes consume them.
- `ui/type-workspace` is the target shared gap behind the current training type page. `ui/type-manager` remains the compact modal API for smaller status and assignment managers until those workflows need the full workspace.

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

## OnboardingPacketList

Source: `src/lib/components/ui/onboarding-packet-list`.

Use `OnboardingPacketList` for onboarding-style packet workflows where one person packet expands at a time and the expanded packet contains task rows, progress, actions, stage indicators, and independent notes disclosure. Use it instead of raw Accordion or Collapsible whenever the route is showing onboarding packet progress or task completion state.

Core API:

```svelte
<script lang="ts">
	import * as OnboardingPacketList from '$lib/components/ui/onboarding-packet-list';
</script>

<OnboardingPacketList.Root value={expandedPacketId} onValueChange={setExpandedPacket}>
	<OnboardingPacketList.Item value={packet.id}>
		<OnboardingPacketList.Trigger>
			<OnboardingPacketList.Summary>
				<OnboardingPacketList.SummaryTitle title={personName} meta={[templateName, groupName, startedLabel]} />
				{#snippet progress()}
					<OnboardingPacketList.Progress value={completed} max={total} />
				{/snippet}
			</OnboardingPacketList.Summary>
		</OnboardingPacketList.Trigger>

		<OnboardingPacketList.Content>
			<OnboardingPacketList.Actions>...</OnboardingPacketList.Actions>
			<OnboardingPacketList.StepList>
				<OnboardingPacketList.Step label={stepName} typeLabel="Training" tone="training" state="incomplete">
					{#snippet status()}...{/snippet}
					{#snippet notes()}...{/snippet}
				</OnboardingPacketList.Step>
			</OnboardingPacketList.StepList>
		</OnboardingPacketList.Content>
	</OnboardingPacketList.Item>
</OnboardingPacketList.Root>
```

Composition:

- `Root` controls single-open packet disclosure through a shadcn/Bits accordion primitive.
- `Notes` controls independent task-note disclosure through a shadcn/Bits collapsible primitive.
- `Progress` wraps the shared progress primitive and renders the count label.
- `Step` owns shared task-row layout, type badge placement, inactive/deprecated state, and status/notes regions.
- `Actions` is the shared action toolbar region for packet-level commands.
- `StatusIcon`, `Note`, and `NoteInput` cover common completion, note display, and note entry affordances.

Accessibility guidance:

- Pass a stable `value` for each packet item so trigger/content relationships remain stable.
- Packet triggers inherit accordion keyboard behavior: tab to the trigger, then Enter/Space toggles the active packet.
- Note toggles must have a clear `label` when the default "Toggle notes" is not enough.
- Step controls need route-supplied accessible labels, for example "Mark sponsor brief complete".
- Do not hide status behind color alone. Use type labels, count text, status icons, and completion labels.

Route usage rules:

- Routes pass data, labels, handlers, permissions, disabled/loading flags, and links.
- Routes must not pass classes that alter packet-list visuals.
- Do not expose raw Accordion or Collapsible primitives to onboarding routes for this workflow.
- Keep onboarding business rules in feature context/store code. The shared component should not know when a packet can be completed, cancelled, resynced, or edited.

Showroom coverage:

`/ui-showroom` includes active packets, multiple packets with one open, complete/incomplete/inactive steps, checkbox/training/paperwork rows, notes open/closed, note count, empty notes, loading and disabled actions, read-only/history display, constrained layout, keyboard focus path, and dark-mode participation.

Onboarding migration notes:

- Active onboarding and onboarding history now consume `OnboardingPacketList`.
- Template step editing still uses its existing modal/list markup. If that workflow needs migration, add a shared template-step editor or workflow-step authoring pattern first rather than patching the modal locally.

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
