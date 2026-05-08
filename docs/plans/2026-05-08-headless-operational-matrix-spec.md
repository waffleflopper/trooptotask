# Spec: Headless Operational Matrix

## Purpose

Build a reusable headless matrix primitive for TroopToTask's operational grid surfaces.

The matrix must support dense row-by-column workflows such as monthly availability, long-range availability, training compliance, Critical Tasks, and DA6-like readiness views without forcing those domains into `DataTable` or into one calendar-specific implementation.

This spec replaces the current `ui/operational-matrix` implementation direction. The existing component has useful intent, but it is too visually opinionated for the next phase: semantic states, legend styling, density styling, sticky behavior, tooltips, icons, and cell presentation are all baked into the shared primitive. The new foundation should make headless behavior the first-class concern.

## Controlling Context

- `docs/plans/2026-05-06-shadcn-svelte-tailwind-v4-ui-migration-rfc.md` remains the controlling UI migration contract.
- `/ui-showroom` remains the calibration and proof surface before production route migration.
- Shared components remain visually authoritative. Route code may configure behavior and data, but it may not create route-local visual skins for shared components without explicit permission.
- This phase does not migrate production routes.

## Current Matrix-Like Surfaces

### Monthly Availability Calendar

Current shape:

- personnel rows grouped by group/platoon
- date columns for one month
- sticky personnel column
- sticky date header
- virtualized rows for larger rosters
- clickable cells that open the availability/status editor
- status ranges spanning dates
- custom status colors from saved status types
- weekends, holidays, today, onboarding, upcoming loss, assignments, and duty badges
- optional status text inside cells

Matrix implications:

- date columns must be plain columns, not special calendar internals
- cells need click selection with row and column identity
- row virtualization must be allowed
- wrappers need full control over cell rendering
- custom domain colors must be possible outside the headless core

### Long-Range Availability

Current shape:

- personnel rows grouped by group/platoon
- dense date columns across three months
- month band headers above day columns
- clickable date headers for navigation
- compact color-only status cells
- read-heavy workflow with export/print actions
- virtualized rows

Matrix implications:

- grouped/stacked column headers are required
- very small cells must be possible
- cell content may be color-only visually but must still be accessible
- headless should not require visible labels inside every cell

### Training Matrix

Current shape:

- personnel rows
- training type columns
- optional grouping by group
- sortable row/name and training columns
- clickable cells that open record entry/editing
- status text, expiration/date display, and color indicators
- legend

Matrix implications:

- sorting/filtering may live in a wrapper, not the headless primitive
- row and column metadata must be generic enough for non-date columns
- actionable cells must support existing edit-dialog workflows

### Critical Tasks Matrix

Current shape:

- personnel rows
- task columns
- grouped or alphabetical modes
- compact status symbols
- not-applicable cells
- row-header readiness metadata
- click-to-edit completion behavior
- report matrices with MOS rows and task-category columns

Matrix implications:

- row headers must accept rich custom content
- cells need disabled/not-applicable states without assuming domain status names
- compact symbol cells must be possible
- the same primitive should support person-by-task and MOS-by-category matrices

## Goals

1. Provide a headless compound Svelte API that feels consistent with shadcn-style composition.
2. Keep domain meaning out of the primitive: no calendar, training, Critical Tasks, DA6, or status-type assumptions.
3. Support native table semantics by default.
4. Support cell selection and dialog-trigger workflows.
5. Allow wrappers to render their own row headers, column headers, cells, ranges, legends, and toolbars.
6. Support dense, scrollable, sticky-axis operational layouts without the headless core owning the final visual skin.
7. Prove the API in `/ui-showroom` before production route migration.

## Non-Goals

- Do not migrate monthly availability, long-range availability, training, or Critical Tasks routes in this phase.
- Do not preserve the current `OperationalMatrix` visual API for compatibility. It has no production consumers yet.
- Do not adapt the old implementation with a compatibility layer.
- Do not make the headless primitive a data-table replacement.
- Do not make the primitive know about dates, months, soldiers, groups, training types, ICT tasks, status colors, or readiness formulas.
- Do not require all consumers to use the same styled cell component.

## Architecture

The shared matrix should have two layers.

### Layer 1: Headless Operational Matrix

Suggested path:

```txt
src/lib/components/ui/operational-matrix/
```

The headless layer owns:

- compound component context
- row, column, group, and cell identity
- selection event contracts
- disabled/read-only state propagation
- accessible labels and structural requirements
- semantic table structure
- optional sticky axis hooks via data attributes
- optional virtual row integration points
- render/snippet composition

The headless layer does not own:

- status colors
- semantic domain state names
- legends
- toolbar controls
- tooltip content
- dialog content
- sorting/filtering/search
- date math
- month navigation
- business permissions
- final visual treatment

### Layer 2: Styled Shared Wrappers

Styled wrappers can use the headless primitive and shadcn-svelte primitives.

Examples:

```txt
src/lib/components/ui/operational-matrix/styled/
src/features/calendar/components/AvailabilityMatrix.svelte
src/features/calendar/components/LongRangeAvailabilityMatrix.svelte
src/features/training/components/TrainingOperationalMatrix.svelte
src/features/critical-tasks/components/CriticalTasksOperationalMatrix.svelte
```

Exact wrapper paths can be decided during implementation. The rule is:

- shared visual behavior belongs under shared UI
- domain mapping belongs under feature modules
- route files should stay thin

## Public API Shape

The component should keep a compound namespace:

```ts
import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
```

Example target usage:

```svelte
<OperationalMatrix.Root
	rows={rows}
	columns={columns}
	rowGroups={rowGroups}
	selectedCell={selectedCell}
	readOnly={!canEdit}
	onCellSelect={handleCellSelect}
>
	<OperationalMatrix.Viewport ariaLabel="Availability matrix">
		<OperationalMatrix.Table ariaLabel="Monthly availability">
			<OperationalMatrix.Header>
				<OperationalMatrix.HeaderRow>
					<OperationalMatrix.CornerCell>
						Personnel
					</OperationalMatrix.CornerCell>

					{#each columns as column (column.id)}
						<OperationalMatrix.ColumnHeader {column}>
							{column.label}
						</OperationalMatrix.ColumnHeader>
					{/each}
				</OperationalMatrix.HeaderRow>
			</OperationalMatrix.Header>

			<OperationalMatrix.Body>
				{#each rowGroups as group (group.id)}
					<OperationalMatrix.RowGroup {group}>
						{group.label}
					</OperationalMatrix.RowGroup>

					{#each group.rows as row (row.id)}
						<OperationalMatrix.Row {row}>
							<OperationalMatrix.RowHeader {row}>
								{row.label}
							</OperationalMatrix.RowHeader>

							{#each columns as column (column.id)}
								<OperationalMatrix.Cell row={row} column={column}>
									{@render cellContent(row, column)}
								</OperationalMatrix.Cell>
							{/each}
						</OperationalMatrix.Row>
					{/each}
				{/each}
			</OperationalMatrix.Body>
		</OperationalMatrix.Table>
	</OperationalMatrix.Viewport>
</OperationalMatrix.Root>
```

The implementation does not need to require this exact markup if Svelte constraints make a slightly different shape cleaner. The important contract is composability: consumers must be able to own row header, column header, and cell content.

## Data Contracts

Use generic row and column records.

```ts
export interface OperationalMatrixRow {
	id: string;
	label: string;
	disabled?: boolean;
	readOnly?: boolean;
	meta?: Record<string, unknown>;
}

export interface OperationalMatrixColumn {
	id: string;
	label: string;
	disabled?: boolean;
	readOnly?: boolean;
	meta?: Record<string, unknown>;
}

export interface OperationalMatrixRowGroup {
	id: string;
	label: string;
	rowIds: string[];
	collapsed?: boolean;
	meta?: Record<string, unknown>;
}

export interface OperationalMatrixCellSelection<Row = OperationalMatrixRow, Column = OperationalMatrixColumn> {
	row: Row;
	column: Column;
	rowId: string;
	columnId: string;
	source: 'pointer' | 'keyboard' | 'programmatic';
}
```

The `meta` fields are intentionally loose. Domain wrappers can store a date, person, training type, task, readiness value, status entry, or computed flags there without teaching the primitive those concepts.

## Component Responsibilities

### `Root`

Owns matrix context.

Expected props:

- `rows`
- `columns`
- `rowGroups?`
- `selectedCell?`
- `readOnly?`
- `disabled?`
- `onCellSelect?`

Expected behavior:

- provides typed context to child components
- resolves row/column disabled and read-only state
- stores or receives selected cell identity
- exposes data attributes for selected, disabled, and read-only state
- does not render visual chrome by itself beyond a structural wrapper

### `Viewport`

Owns the scroll region.

Expected props:

- `ariaLabel`
- `maxHeight?`
- `virtualized?`

Expected behavior:

- creates an accessible scroll region
- allows horizontal and vertical scrolling
- does not decide cell sizes
- exposes data attributes for styled wrappers

### `Table`

Owns native table semantics.

Expected props:

- `ariaLabel`

Expected behavior:

- renders a native `<table>`
- does not implement sorting or filtering
- allows wrapper-controlled `thead`, `tbody`, `tr`, `th`, and `td` composition

### `Header`, `HeaderRow`, `ColumnGroup`, `ColumnHeader`, `CornerCell`

Own column/header structure.

Required support:

- single-row headers
- stacked/grouped headers for long-range month bands
- sticky header data attributes
- custom header snippets
- clickable header content when wrappers provide it

The headless layer should not know whether a column is a date, task, training type, or category.

### `Body`, `RowGroup`, `Row`, `RowHeader`

Own row structure.

Required support:

- grouped rows
- collapsed-group support through wrapper state
- rich row header content
- sticky row-header data attributes
- disabled/read-only propagation
- virtual-row positioning hooks where needed

The headless layer should not own group toggling or pinning behavior. Wrappers can render those controls.

### `Cell`

Owns cell identity and selection behavior.

Expected props:

- `row`
- `column`
- `rowId?`
- `columnId?`
- `disabled?`
- `readOnly?`
- `selected?`
- `ariaLabel?`
- `onSelect?`

Expected behavior:

- renders a table cell
- renders a button or interactive element only when selectable
- emits a selection payload with row and column identity
- supports pointer and keyboard activation
- preserves accessible labels even when visual content is color-only or symbol-only
- exposes `data-selected`, `data-disabled`, `data-readonly`, `data-row-id`, and `data-column-id`
- does not assign status colors or semantic state labels

## Interaction Requirements

### Cell Selection

Clicking or keyboard-activating a selectable cell must produce a stable selection payload.

Availability wrappers can use that payload to open a status dialog:

```ts
function handleCellSelect(selection: OperationalMatrixCellSelection<PersonRow, DateColumn>) {
	activePerson = selection.row.meta.person;
	activeDate = selection.column.meta.date;
	statusDialogOpen = true;
}
```

Training and Critical Tasks wrappers can use the same contract to open completion/record dialogs.

### Keyboard Behavior

Phase 1 should support:

- tab focus into actionable cells
- `Enter` and `Space` activation for actionable cells through native button behavior
- visible focus state through styled wrappers

Phase 1 should not implement spreadsheet-style arrow-key navigation unless explicitly added later. If that becomes necessary, it should be added to the headless primitive as a deliberate behavior extension.

### Dialogs

The matrix primitive should not own dialogs.

Wrappers should use shadcn-svelte `Dialog` or existing shared dialog primitives to render domain forms. The matrix only emits selection state.

## Styling Contract

The headless layer may emit structural data attributes. It should not impose the final product appearance.

Expected data attributes:

- `data-slot`
- `data-matrix-root`
- `data-matrix-viewport`
- `data-matrix-table`
- `data-matrix-header`
- `data-matrix-body`
- `data-matrix-row-group`
- `data-matrix-row`
- `data-matrix-row-header`
- `data-matrix-column-header`
- `data-matrix-cell`
- `data-row-id`
- `data-column-id`
- `data-selected`
- `data-disabled`
- `data-readonly`
- `data-sticky-axis`

Styled wrappers may use Tailwind and shared tokens to create:

- sticky headers
- sticky row headers
- dense cell sizing
- color-only cells
- range blocks
- row hover states
- focus rings
- legends
- toolbars

Domain-specific colors, such as calendar status type colors, belong in the domain wrapper and must still preserve accessible text labels.

## Accessibility Requirements

- Use native table semantics by default.
- Every table must have an accessible label.
- Every scroll viewport must have an accessible label.
- Every actionable cell must have an accessible name that includes row label, column label, and action meaning.
- Color-only cells must include text through `aria-label`, visually hidden text, or both.
- Do not rely on tooltip-only content for critical meaning.
- Do not use `role="grid"` in Phase 1 unless arrow-key grid navigation is implemented and tested.
- Disabled/read-only cells must not be reachable as actions.

## Virtualization Requirements

The headless primitive should allow virtualization but should not own the virtualization algorithm in Phase 1.

Reason:

- calendar and long-range already have specialized virtual row utilities
- training and Critical Tasks may not need virtualization in the first migration
- owning virtualization inside the primitive too early could force the wrong layout constraints

Phase 1 should support:

- externally supplied visible rows
- absolute-positioned virtual row wrappers when needed
- stable row heights owned by wrappers
- `aria-rowcount`/`aria-rowindex` support if a virtualized wrapper needs it

## Range Rendering Requirements

The headless primitive should not understand date ranges.

It should support wrapper-rendered range visuals by:

- letting cell content be fully custom
- exposing row and column identity
- allowing adjacent cells to share wrapper-computed range metadata
- not forcing each cell to render the same internal label/icon structure

Availability wrappers can decide whether a multi-day status is rendered as repeated cells, a visually connected block, clipped text, diagonal split, or color-only run.

## Showroom Requirements

Add or update `/ui-showroom` examples before production routes consume the component.

Required examples:

- basic headless matrix with simple styling
- grouped rows
- sticky top header and sticky row header
- selected cell state
- disabled/read-only cells
- clickable cells opening a dialog
- dense color-only cells with accessible labels
- stacked column headers for a long-range/month-band example
- rich row headers with metadata
- loading and empty wrapper examples

The showroom should prove the API under realistic pressure. It should not be only a toy three-by-three grid.

## Testing Requirements

Add focused component tests for the primitive.

Required coverage:

- renders table, headers, row groups, rows, row headers, and cells
- forwards row/column identity in cell selection payloads
- does not fire selection for disabled/read-only cells
- preserves accessible names for symbol-only/color-only cells
- supports custom snippets for row headers, column headers, and cell content
- supports selected state data attributes
- supports grouped/stacked header markup

Visual behavior belongs in showroom review and wrapper tests where practical.

## Documentation Updates

When implementing this spec:

- replace the current `ui/operational-matrix` section in `docs/component-catalog.md`
- reference this spec from the component catalog
- document which parts are headless and which are styled wrappers
- document that production route migration is a later phase

## Implementation Sequence

1. Delete or replace the current `src/lib/components/ui/operational-matrix/**` implementation.
2. Define the new headless type contracts.
3. Implement the compound component context and primitive parts.
4. Add primitive component tests.
5. Build showroom examples with basic styling and at least one dialog-trigger interaction.
6. Update `docs/component-catalog.md`.
7. Run required verification.

## Open Decisions

These decisions should be made during implementation if the repo evidence points clearly one way. Otherwise, stop and ask.

1. Should the public import remain `OperationalMatrix`, or should the root primitive be renamed `HeadlessMatrix`?
   - Recommendation: keep `OperationalMatrix` because the domain is clearer and existing docs already use it.
2. Should sticky behavior live as headless data attributes only, or should a shared styled wrapper provide default sticky classes?
   - Recommendation: data attributes in headless, default sticky classes in the showroom/styled wrapper.
3. Should Phase 1 include arrow-key cell navigation?
   - Recommendation: no. Use native button/tab behavior first.
4. Should calendar status colors be supported by a shared styled cell helper?
   - Recommendation: not in the headless core. A later availability wrapper can provide this.
5. Should row virtualization be generalized immediately?
   - Recommendation: no. Support external virtualization first.

## Acceptance Criteria

- A durable spec exists in `docs/plans` and can be used as the reference for future implementation prompts.
- The spec clearly replaces the old visual-first `OperationalMatrix` direction.
- The API supports monthly availability, long-range availability, training, and Critical Tasks needs without making the primitive domain-specific.
- The spec preserves the UI migration rule: shared visuals are calibrated in showroom before route migration.
- The implementation path does not require production route migration in the first slice.
