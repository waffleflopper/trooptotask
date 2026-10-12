# Component Catalog & CSS Design System

`src/lib/components/` holds three layers and nothing else; the `foundation-placement` governance rule rejects any other file or directory there. Shared UI primitives and central variants, including dialogs, sheets and cards, live in `src/lib/components/ui/`. Shared neutral compositions with real consumers live in `src/lib/components/patterns/`. Import both through each family's barrel. Public marketing primitives live in `src/lib/components/public/`; import them via `$lib/components/public/...`. Feature UI, including the app shell's `BannerStack`, lives with its owner under `src/features/`. The [foundation provenance and family contract](ui-foundation-provenance.md) records the current APIs, deviations and target layers.

---

## Find the relevant component

Read the [UI foundation](#ui-foundation), then the entry for the component being changed. Every family below is imported through its barrel, `$lib/components/<layer>/<family>`. A family without its own section is a vendored shadcn-svelte primitive; use it as generated.

| Family                                                                     | Parts                                                                                                                                               | Production consumers                                                                                                                                                   |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/accordion`                                                             | `Root`, `Item`, `Trigger`, `Content`                                                                                                                | Onboarding packet list; landing page FAQ.                                                                                                                              |
| `ui/alert`                                                                 | `Root`, `Title`, `Description`, `Action`; `alertVariants`                                                                                           | Inline errors and notices in most features; report and bulk import states.                                                                                             |
| `ui/alert-dialog`                                                          | `Root`, `Content`, `Header`, `Footer`, `Title`, `Description`, `Action`, `Cancel`, `Overlay`, `Portal`, `Trigger`                                   | Foundation primitive, used by [`ui/confirm-dialog`](#uiconfirm-dialog).                                                                                                |
| [`ui/app-dialog`](#uiapp-dialog)                                           | `Root`, `Content`, `Header`, `Title`, `Description`, `Body`, `Footer`                                                                               | Edit, form and review dialogs in most features.                                                                                                                        |
| `ui/avatar`                                                                | `Root`; `avatarVariants`                                                                                                                            | Onboarding kanban card.                                                                                                                                                |
| [`ui/badge`](#uibadge)                                                     | `Badge`; `badgeVariants`                                                                                                                            | Status labels in most features.                                                                                                                                        |
| `ui/breadcrumb`                                                            | `Root`, `List`, `Item`, `Link`, `Page`, `Separator`, `Ellipsis`                                                                                     | App shell header.                                                                                                                                                      |
| [`ui/button`](#uibutton)                                                   | `Button`; `buttonVariants`                                                                                                                          | Every feature.                                                                                                                                                         |
| `ui/button-group`                                                          | `Root`, `Text`, `Separator`; `buttonGroupVariants`                                                                                                  | View toggles in Calendar bulk status, the Critical Tasks library and matrix, Personnel, Rating Scheme, the Training matrix and Ranks settings; `WorkspaceToolbar.Nav`. |
| `ui/calendar`                                                              | `Calendar` and its month-grid parts                                                                                                                 | Foundation primitive, used by [`ui/date-picker`](#uidate-picker).                                                                                                      |
| `ui/card`                                                                  | `Root`, `Header`, `Title`, `Description`, `Content`, `Footer`                                                                                       | Account, platform admin, Calendar bulk status, Critical Tasks reports, Dashboard overview, Onboarding, Sign-in rosters, organization creation and the suspended page.  |
| `ui/chart`                                                                 | `Container`, `Tooltip`; `ChartConfig`                                                                                                               | Foundation primitive, used by [`patterns/report-chart`](#patternsreport-chart).                                                                                        |
| `ui/checkbox`                                                              | `Root`                                                                                                                                              | See [form controls](#shared-form-controls).                                                                                                                            |
| `ui/collapsible`                                                           | `Root`, `Trigger`, `Content`                                                                                                                        | Onboarding detail sheet and packet notes, Sign-in rosters, admin audit and feedback; `TypeWorkspace.Disclosure`.                                                       |
| [`ui/combobox`](#uicombobox)                                               | `Root`, `Trigger`, `Content`, `Search`, `List`, `Item`, `Empty`, `Value`, `Chips`, `ChipsInput`, `Chip`                                             | Calendar assignments, Critical Tasks completion, Onboarding start, Personnel and Rating Scheme.                                                                        |
| [`ui/command`](#uicommand)                                                 | `Root`, `Input`, `List`, `Viewport`, `Group`, `Item`, `LinkItem`, `Empty`, `Loading`, `Separator`, `Shortcut`, `Dialog`                             | Platform admin search; `ui/combobox`.                                                                                                                                  |
| [`ui/confirm-dialog`](#uiconfirm-dialog)                                   | `ConfirmDialog`                                                                                                                                     | Confirmations in most features.                                                                                                                                        |
| [`ui/data-table`](#uidata-table)                                           | `DataTable`, `Search`, `SelectionCheckbox`, `BulkActions`, `RowActions`, `useDataTable`, `useDataTableSelection`                                    | Calendar, Critical Tasks, Personnel, Rating Scheme, Training and Organization settings; report and bulk import tables.                                                 |
| [`ui/date-picker`](#uidate-picker)                                         | `DatePicker`                                                                                                                                        | Date fields in Calendar, Critical Tasks, Onboarding, Personnel, Rating Scheme, Sign-in rosters and Training.                                                           |
| `ui/dialog`                                                                | `Root`, `Content`, `Header`, `Footer`, `Title`, `Description`, `Trigger`, `Close`, `Overlay`, `Portal`; `focusAfterDialogCloses`, `keepFocusInside` | Foundation for `ui/app-dialog`, `ui/alert-dialog` and `ui/sheet`. Personnel archived artifacts and Ranks settings call `focusAfterDialogCloses`.                       |
| `ui/dropdown-menu`                                                         | `Root`, `Trigger`, `Content`, `Item`, `CheckboxItem`, `RadioGroup`, `RadioItem`, `Group`, `Label`, `Separator`, `Sub` parts                         | App shell user menu; workspace toolbar actions and multi-select; `DataTable.RowActions`.                                                                               |
| [`ui/empty`](#uiempty)                                                     | `Root`, `Header`, `Media`, `Title`, `Description`, `Content`                                                                                        | Empty and error states in most features and every error boundary.                                                                                                      |
| [`ui/field`](#shared-form-controls)                                        | `Root`, `Control`, `Label`, `Description`, `Error`, `Title`, `Set`, `Legend`, `Group`, `Content`, `Separator`                                       | Forms in most features.                                                                                                                                                |
| [`ui/input`](#shared-form-controls)                                        | `Root`                                                                                                                                              | Forms in most features.                                                                                                                                                |
| `ui/input-group`                                                           | `Root`, `Addon`, `Button`, `Input`, `Text`, `Textarea`                                                                                              | Foundation primitive, used by `WorkspaceToolbar.Search`, `Command.Input` and `DataTable.Search`.                                                                       |
| `ui/label`                                                                 | `Root`                                                                                                                                              | App shell header, Calendar closures, Feedback, Organization danger zone and members settings; `Field.Label`.                                                           |
| [`ui/native-select`](#shared-form-controls)                                | `Root`, `Option`, `OptGroup`                                                                                                                        | Plain form choices in Calendar, Critical Tasks, Personnel import, platform admin, Account Profile and Ranks settings.                                                  |
| [`ui/operational-matrix`](#uioperational-matrix)                           | See its section                                                                                                                                     | Critical Tasks matrix and readiness table, Training matrix and Training Reports.                                                                                       |
| `ui/popover`                                                               | `Root`, `Trigger`, `Content`, `Header`, `Title`, `Description`, `Close`, `Portal`                                                                   | Foundation primitive, used by `ui/combobox` and `ui/date-picker`.                                                                                                      |
| `ui/progress`                                                              | `Root`                                                                                                                                              | Critical Tasks reports, Dashboard overview and Onboarding; `BulkImportWorkspace.ProgressState`.                                                                        |
| [`ui/radio-group`](#shared-form-controls)                                  | `Root`, `Item`                                                                                                                                      | Calendar assignment settings, Sign-in rosters, Training types, Onboarding templates and members settings.                                                              |
| [`ui/select`](#shared-form-controls)                                       | `Root`, `Trigger`, `Content`, `Item`, `Group`, `GroupHeading`, `Label`, `Separator`, scroll buttons, `Portal`                                       | Calendar, Feedback, Onboarding, Organization, Rating Scheme, access requests and members settings; `WorkspaceToolbar.Select`.                                          |
| `ui/separator`                                                             | `Root`                                                                                                                                              | App shell header, Critical Tasks reports, Dashboard overview, Organization and data export settings, platform admin and Ranks settings.                                |
| `ui/sheet`                                                                 | `Root`, `Trigger`, `Content`, `Header`, `Footer`, `Title`, `Description`, `Close`, `Overlay`, `Portal`                                              | Onboarding detail sheet and members settings; the mobile `ui/sidebar`.                                                                                                 |
| `ui/sidebar`                                                               | `Provider`, `Root`, `Inset`, `Rail`, `Header`, `Content`, `Footer`, `Group` and `Menu` parts; `useSidebar`                                          | App shell navigation and header; platform admin layout.                                                                                                                |
| [`ui/skeleton`](#uiskeleton)                                               | `Root`                                                                                                                                              | Streamed loading states in Calendar, Critical Tasks, Dashboard, Evals, Onboarding, Personnel and Training.                                                             |
| `ui/sonner`                                                                | `Toaster`                                                                                                                                           | Root layout; see [transient feedback](#transient-feedback).                                                                                                            |
| [`ui/spinner`](#uispinner)                                                 | `Spinner`                                                                                                                                           | Async buttons in most features.                                                                                                                                        |
| `ui/table`                                                                 | `Root`, `Header`, `Body`, `Footer`, `Row`, `Head`, `Cell`, `Caption`                                                                                | Calendar planner and group readiness, Training type risk, platform admin lists and archived personnel settings; `ui/data-table` and `ReportChartTable`.                |
| `ui/tabs`                                                                  | `Root`, `List`, `Trigger`, `Content`; `tabsListVariants`                                                                                            | Calendar settings, Critical Tasks completion import, the soldier data sheet, admin access requests and feedback.                                                       |
| [`ui/textarea`](#shared-form-controls)                                     | `Root`                                                                                                                                              | Forms in most features.                                                                                                                                                |
| `ui/toggle`                                                                | `Root`; `toggleVariants`                                                                                                                            | Personnel and the Critical Tasks matrix; `ui/toggle-group` and `ReportWorkspace.OptionChips`.                                                                          |
| [`ui/toggle-group`](#uitoggle-group)                                       | `Root`, `Item`                                                                                                                                      | Training Reports and its affected soldiers section.                                                                                                                    |
| `ui/tooltip`                                                               | `Root`, `Trigger`, `Content`, `Provider`, `Portal`                                                                                                  | App shell header and Personnel import; `ui/sidebar`.                                                                                                                   |
| [`patterns/brand-wordmark`](#public-marketing-shell)                       | `BrandWordmark`                                                                                                                                     | Public navigation and Identity's AuthShell.                                                                                                                            |
| [`patterns/bulk-import-workspace`](#patternsbulk-import-workspace)         | See its section                                                                                                                                     | Calendar, Critical Tasks, Personnel and Training imports.                                                                                                              |
| [`patterns/page-shell`](#patternspage-shell)                               | `Root`, `Header`, `Tabs`, `FactGrid`, `Metric`                                                                                                      | Account, Organization settings, the person record, platform admin and Training Reports.                                                                                |
| [`patterns/readiness-band`](#patternsreadiness-band)                       | `Cell`, `Legend`; `readinessBandTone`                                                                                                               | Critical Tasks and Training reports.                                                                                                                                   |
| [`patterns/report-chart`](#patternsreport-chart)                           | See its section                                                                                                                                     | Critical Tasks reports, Training Reports and the platform admin dashboard.                                                                                             |
| [`patterns/report-workspace`](#patternsreport-workspace)                   | See its section                                                                                                                                     | Calendar, Critical Tasks and Training reports.                                                                                                                         |
| [`patterns/requirement-status-badge`](#patternsrequirement-status-badge)   | `RequirementStatusBadge`                                                                                                                            | Critical Tasks and Training status badges.                                                                                                                             |
| [`patterns/type-management-workspace`](#patternstype-management-workspace) | See its section                                                                                                                                     | Training types and views; Onboarding templates.                                                                                                                        |
| [`patterns/workspace-toolbar`](#patternsworkspace-toolbar)                 | See its section                                                                                                                                     | Authenticated workspace toolbars.                                                                                                                                      |

## UI Foundation

This catalog is the reference for TroopToTask's shadcn-svelte and Tailwind v4 UI foundation. It records the shared primitives, the project compositions, their production consumers and their usage rules.

The [family contract](ui-foundation-provenance.md) governs retention, moves and removals. Domain UI lives with its feature: Calendar owns its date cells and status badge, and Onboarding owns its kanban board and paperwork stage display. Those components are documented by their feature code, not here.

Platform admin has no admin-specific CSS. `/admin/**` composes the shared sidebar, page-shell, card, field, command, tabs, collapsible, alert, confirm-dialog, empty, badge, button, input, select, textarea and table primitives with Tailwind layout utilities. Its sidebar is a named navigation that marks the current page with `aria-current`. Users, Organizations and Audit Log page with the admin-owned `AdminPager`, which keeps focus on Previous or Next across the navigation. Admin forms settle through `settleAction`: a success may confirm with `toastStore`, and a failure stays in an inline `Alert` beside its action.

Composition and visual ownership follow the [UI system](agents/ui-system.md#default-ui-rules). Within authorized UI work, extend shared APIs or add centrally owned variants and update affected consumers and this catalog. Preserve existing consumer behavior; route-local visual exceptions require Robert's explicit approval.

Foundation files:

- `components.json` initializes shadcn-svelte with `ui` pointed at `$lib/components/ui`.
- `src/lib/utils.ts` provides the shadcn `cn` helper and element-ref utility types.
- `src/app.css` imports Tailwind v4 and maps shared semantic tokens to the product palette; see the [current token API](#current-token-api) and [palette](#palette).
- `src/app.css` defines the `below-banner` utility: the app frame fills the viewport under the app shell's fixed `BannerStack` (`src/features/app-shell`), which publishes its measured height as `--banner-height` on `<html>`. Apply the utility instead of writing the variable; `ui/sidebar` reads it for its fixed container.
- `src/app.css` names the fixed layers with the `z-banner` and `z-sheet` utilities. From lowest to highest the layers are: the desktop sidebar (`z-10`), `BannerStack` (`z-banner`), `ui/sheet` and its overlay (`z-sheet`), then dialogs, alert dialogs and floating content (menus, selects, popovers, tooltips) at shadcn's `z-50`, then the Toaster. Bits portals join `<body>` when the component mounts, not when it opens. Overlays on the same layer therefore paint in mount order, and a drawer that mounted after a resize would cover a dialog opened from it. A sheet sits below the dialogs it can open, and the banner sits above the page and desktop sidebar but below every modal layer. Use these layers instead of new z-values.

The catalog records `shadcn-svelte@1.2.7` as its generation-time CLI reference. No CLI is installed. `components.json` selects `nova` and `stone`, but does not pin a registry. The [provenance comparison](ui-foundation-provenance.md#source-and-comparison-method) uses the immutable 1.2.7 registry tag and records adaptations rather than treating every local family as stock generated source.

---

## `ui/command`

Command input and result items must share one `Command.Root`. For server-filtered search, set `shouldFilter={false}` and supply the root `label` for the input name. `Command.Viewport` exposes the Bits viewport without a second state owner; compose it through `Command.List`'s `child` snippet with the supplied props when list and viewport share one element, so `aria-controls` targets the listbox and `aria-activedescendant` identifies its selected option. `Command.Input` preserves an explicit `aria-expanded` value for conditional popups; always-open menus retain the primitive default.

## Transient feedback

The Web UI Foundation's public [`toastStore`](../src/lib/stores/toast.svelte.ts) wraps Sonner for `success`, `error`, `warning`, `info` and `dismiss`. The root layout mounts the shared `ui/sonner` Toaster once. Feature views can report a failed save through this interface while keeping their draft or unsaved record visible for retry. A toast does not decide whether an operation succeeded or own saved feature state; the response and the feature's operation remain authoritative. No feature-specific message or recipient policy belongs in the shared adapter. The Toaster keeps toasts clickable above modal layers: a modal sets `pointer-events: none` on `<body>`, so the Toaster restores it for its own list and stops `pointerdown` from reaching the open dialog or drawer, which would otherwise treat a touch on the toast as an outside press and close itself. While a modal's focus scope is active, keyboard focus stays in the modal; the toast is still announced through the Toaster's live region and dismisses itself.

## Password MFA continuation

[`PasswordMfaChallenge`](../src/features/identity/PasswordMfaChallenge.svelte), exported by Identity’s web seam, composes the shared auth field/notice and button primitives for Account Security, recovery and invite password flows. It owns serialized code submission, explicit-success admission, retry errors and code focus; `onverified` returns to the parent's retained password draft or pending activation step. Optional `hint` explains which action is awaiting MFA; the invite consumer uses it after password completion. It never submits or stores passwords.

## Password completion continuation

[`PasswordCompletion`](../src/features/identity/PasswordCompletion.svelte), exported by Identity’s web seam, composes the shared auth primitives for Account Security, recovery and invite reconciliation. Loaders expose only the server-persisted attempt state. Unknown outcomes offer a serialized status check; confirmed changes retry revocation alone; fenced failures permit explicit restart. Transport errors and reload never automatically resubmit a password. Fresh MFA uses `PasswordMfaChallenge`, with focus restored to the next action. Confirmed completion advances recovery or invite activation; Account Security offers explicit restart. Unavailable persistence offers status retry. Expired attempts require a fresh session after their original expiry before restart. Password drafts are discarded on confirmation or an unknown mutation outcome.

## `patterns/page-shell`

`patterns/page-shell` is the shared authenticated-page shell primitive family for route workspaces. It standardizes page padding, route body overflow, page headers, route tabs and dense metric grids without owning route-specific business rules.

```svelte
<script lang="ts">
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';

	const tabs = [
		{ label: 'Overview', href: '/account/profile', active: true },
		{ label: 'History', href: '/account/security', badge: 48, badgeLabel: '48 history entries' }
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

	<PageShell.Tabs items={tabs} label="Training sections" />

	<PageShell.FactGrid layout="three">
		<PageShell.Metric label="Personnel" value="22" />
		<PageShell.Metric label="Complete" value="6" />
		<PageShell.Metric label="Due" value="16" />
	</PageShell.FactGrid>
</PageShell.Root>
```

Public components:

- `Root`: authenticated page content scroller. Props: `density?: 'default' | 'compact'`, `width?: 'full' | 'content' | 'wide'`, `bodyClass?`, `children?`.
- `Header`: page header. Props: `title`, `subtitle?`, snippets `back`, `meta`, `actions`, and `overflow`.
- `Tabs`: route-level navigation links. Props: `items?`, `label?`. Items support `label`, `href` (required), `active`, `badge`, `badgeLabel`, `badgeVariant`, and `disabled`. The active link carries `aria-current="page"`; a disabled item renders as non-interactive text. Use `ui/tabs` for in-page views. Each tab shows the app focus ring. When a bare count would be ambiguous, set `badgeLabel` (for example `2 pending requests`); assistive technology then hears that text in place of the badge.
- `FactGrid`: dense fact layout. Props: `layout?: 'stack' | 'two' | 'three' | 'rail'`, `children?`.
- `Metric`: compact bordered metric tile. Props: `label`, `value`, `detail?`, `tone?`, `children?`.

Rules:

- Use `Root` inside the authenticated shell/sidebar inset so page content scrolls inside the shell and the app breadcrumb/header remains outside the route scroller.
- The shell owns the page's only `main` landmark. `ui/sidebar`'s `Inset` renders a `div`; the Organization shell's `main#main-content` (the skip-link target) and the platform admin layout's `main` wrap page content below their headers. Route content renders a `div` root, never another `main`.
- Use `Header` for route-local title, subtitle, meta, and actions. Do not duplicate the authenticated app breadcrumb bar inside route content.
- Use `Tabs` for route-level Overview/History/Settings style navigation.
- Use `FactGrid` and `Metric` for dense operational summaries instead of route-local summary wrappers.
- Routes may configure labels, values, actions, links, disabled/loading state, status badges, and snippets. Routes must not visually retune these primitives with local spacing, radius, color, border, density, or typography overrides unless explicitly approved.

Consumers: the Account and Organization settings shells, the person record layout, every platform admin page and Training Reports. Most platform admin pages also use `FactGrid` and `Metric`.

---

## `ui/date-picker`

Shared shadcn-svelte date picker composed from `button`, `popover`, and `calendar`. Use it instead of a route-local `input type="date"`. Date fields in Calendar, Critical Tasks, Onboarding, Personnel, Rating Scheme, Sign-in rosters and Training use it, as does `ReportWorkspace.DateRangeField`.

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

`patterns/workspace-toolbar` is the shared toolbar used by authenticated production routes. The named `WorkspaceToolbar` export is data-driven. A route describes its controls as ranked data and the toolbar decides what fits on one row. Everything that does not fit folds into one More menu.

```svelte
<script lang="ts">
	import { WorkspaceToolbar, type ToolbarItem } from '$lib/components/patterns/workspace-toolbar';

	const items = $derived<ToolbarItem[]>([
		{ kind: 'view', id: 'view', label: 'View mode', options: viewOptions, value: view, onValueChange: setView },
		{
			kind: 'select',
			id: 'group',
			label: 'Group',
			options: groupOptions,
			value: group,
			defaultValue: '',
			onValueChange: setGroup
		},
		{ kind: 'toggle', id: 'gaps', label: 'Gaps only', pressed: gapsOnly, onPressedChange: setGapsOnly },
		{ kind: 'action', id: 'reports', label: 'Reports', icon: 'chart', href: reportsHref },
		{ kind: 'action', id: 'export', label: 'Export Excel', icon: 'download', loading: exporting, onclick: exportExcel }
	]);
</script>

<WorkspaceToolbar
	ariaLabel="Critical Tasks controls"
	{items}
	search={{ label: 'Search by name, rank, or MOS', placeholder: 'Search...', value: search, onValueChange: setSearch }}
	primary={{ kind: 'action', id: 'record', label: 'Record Completion', icon: 'plus', onclick: openRecord }}
/>
```

Props (`WorkspaceToolbarProps`):

- `ariaLabel`: the toolbar name. The More trigger is named `More {ariaLabel}`.
- `items: ToolbarItem[]`: views, filters and actions, most important first.
- `search?`: `label`, `placeholder`, `value` and `onValueChange`. The search field is pinned.
- `primary?`: one pinned `ToolbarAction`. It is always on the row and is never menu only.

Item kinds (`toolbar-types.ts`):

- `view`: a mutually exclusive mode. The row shows a `ButtonGroup` with `aria-pressed`. More shows a radio group.
- `select`: one value with a required `defaultValue`. It is active when its value differs from the default.
- `multiSelect`: several values with optional `defaultValues`. It is active when its set differs from the defaults, in any order.
- `toggle`: one boolean. It is active when pressed.
- `action`: exactly one of `onclick`, `href` or `menuItems`, plus `icon`, `destructive`, `disabled`, `disabledReason`, `loading` and `menuOnly`. `href` navigates with `goto`. `menuItems` nest as submenus, and a disabled or loading parent blocks its children.

Every item has a unique `id` and a visible `label`. An optional `ariaLabel` keeps an existing accessible name.

Rank rule:

- `items` order is the only ranking. There is no priority number and no per-route breakpoint.
- The row renders view, search, filters, actions, More and primary. Actions render in reverse rank, so the highest-ranked action sits next to the primary. The first trailing control aligns right.

Fold rule:

- The toolbar measures each control's natural width in a hidden copy and fits them to the row width.
- Actions fold first, then filters, then views. Within each section the lowest ranked item folds first.
- More takes room once something folds or a `menuOnly` action exists. With nothing folded and no menu-only action there is no More button.
- Search collapses to an icon button only after every item has folded. The primary and More never fold.
- Before the first measurement every control renders on the row, and the root clips overflow.

More rendering:

- More lists folded items under View, Filters and Actions headings, separated, in that order.
- A folded `select` or `multiSelect` becomes a submenu. Its trigger shows the current value and an accent dot when the filter is active. A folded `toggle` becomes a checkbox item.
- Folded actions keep row order, with menu-only actions after them. Destructive actions sit last after a separator, in every menu and submenu.
- When a folded filter is active, the More trigger shows a dot and is described as `Hidden filters active: …`.
- A chosen action runs after its menu has finished closing, so an action that moves focus into page content keeps it. If More unmounts before its close finishes, the action runs then. If the whole toolbar unmounts, the action is dropped.
- When a focused control or an open menu folds, focus moves to More. When More disappears, focus moves to the first returning control.

Phone search:

- A collapsed search is an icon button named by the search label. A non-empty search value describes the button.
- Opening it fills the row with the search field and a Close search button and hides the other controls. Escape or Close search returns to the icon.
- When the row widens enough to show the field, the toolbar leaves phone search and keeps the same input element.

Data attributes, for tests and the verification helpers:

| Attribute                       | Element                                       | Values                                                   |
| ------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| `data-slot="workspace-toolbar"` | Root, with `role="toolbar"` and `aria-label`  | —                                                        |
| `data-toolbar-search`           | Root                                          | `field`, `icon`, `open` or `none`                        |
| `data-toolbar-ready`            | Root                                          | `true` after the first fit, otherwise `false`            |
| `data-toolbar-row`              | The live row                                  | —                                                        |
| `data-toolbar-item`             | Each live item wrapper, including the primary | The item `id`                                            |
| `data-toolbar-more`             | The More wrapper                              | —                                                        |
| `data-toolbar-measure`          | The hidden, inert measuring copy              | Its item wrappers carry the same `data-toolbar-item` ids |

Rules:

- Rank items by importance to the route's main task. Do not hand-pick overflow or icon-only modes.
- Use `menuOnly` for rare or destructive commands that should never take row space.
- Keep disabled actions visible when their presence explains unavailable work, and give them a `disabledReason`. Loading actions show the shared spinner.
- Do not add route-local toolbar spacing, radius, borders, shadows, color, density, typography, or internal selector overrides.
- Compose route-specific behavior under the [shared UI composition rules](agents/ui-system.md#default-ui-rules); keep toolbar appearance and reusable APIs owned by the shared component.
- If an authorized route change needs behavior this API cannot express, implement and verify the smallest shared API extension, update affected consumers and document its usage here.

Consumers: the Critical Tasks matrix. A new route toolbar starts from `WorkspaceToolbar`. A change to the toolbar is verified on its consumers at narrow and wide widths.

### Legacy composition API (temporary)

The namespace parts below remain until the remaining consumers migrate. Slice 7 of #1624 removes them. Do not start a new toolbar from them.

- `WorkspaceToolbar.Root`: the legacy shell. Props: `ariaLabel: string`, `wrap?: boolean`, `children?: Snippet`, plus normal `div` attributes. It renders `role="toolbar"` as one fixed-height `flex-nowrap` row with hidden horizontal overflow as a last resort. `wrap` lets groups flow onto further rows. The shell is a size container that uses the `toolbar-compact` and `toolbar-narrow` variants from `src/app.css`.
- `WorkspaceToolbar.Group`: the labeled control/action boundary. Props: `label: string`, `activeCount?: number`, `zone?: 'controls' | 'actions' | 'meta'`, `children?: Snippet`, plus normal `div` attributes. `activeCount` is included in the accessible group label. The `actions` zone aligns to the toolbar's right edge.
- `WorkspaceToolbar.Select`: single-choice `ui/select`. Props: `ariaLabel`, `options: { value, label }[]`, `value`, `disabled?`, `onValueChange`.
- `WorkspaceToolbar.MultiSelect`: checkbox dropdown for several values. Props: `ariaLabel`, `label`, `options`, `value: string[]`, `disabled?`, `onChange`.
- `WorkspaceToolbar.Search`: compact `ui/input-group` search. Props: `value` (bindable), `ariaLabel`, `placeholder?`, `testId?`, `onValueChange?`.
- `WorkspaceToolbar.Nav`: link group for sibling workspace views. Props: `ariaLabel`, `items: { label, href }[]`.
- `WorkspaceToolbar.Actions`: command buttons with dropdown overflow. Props: `actions: WorkspaceToolbarAction[]`, `ariaLabel?`, `overflowAriaLabel`. Each action sets `priority`, `displayMode`, `overflow`, `variant`, `icon`, `menuItems`, `toggle` and disabled reasons. An action chosen from one of its menus runs after that menu has finished closing.
- `WorkspaceToolbar.Meta`: compact passive metadata. Props: `tone?: 'neutral' | 'warning' | 'success'`, `children?: Snippet`, plus normal `div` attributes.

Legacy consumers: the Calendar month view, assignment planner, bulk status and reports; the Critical Tasks library, person detail and reports; Onboarding History and templates; Personnel; Rating Scheme; Ranks settings; and the Training matrix, types, views and reports.

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

`patterns/report-workspace` is the shared shadcn-svelte-backed foundation for operational report pages and report sections. It standardizes report structure, filter/configuration panels, report sections and tables, report states, run state and export actions without owning feature calculations.

```svelte
<script lang="ts">
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace';
</script>

<ReportWorkspace.Root ariaLabel="Readiness report workspace">
	<ReportWorkspace.Filters title="Report configuration">
		<!-- route-owned filters -->
		{#snippet dateRange()}
			<ReportWorkspace.DateRangeField bind:start bind:end presets={ReportWorkspace.WEEK_PRESETS} />
		{/snippet}
	</ReportWorkspace.Filters>

	{#if report.status === 'loading'}
		<ReportWorkspace.State state="loading" title="Counting readiness" />
	{:else if report.result}
		<ReportWorkspace.Table title="Detail rows" data={report.result.rows} {columns} ariaLabel="Readiness detail rows">
			{#snippet actions()}
				<ReportWorkspace.ExportAction label="Export workbook" onclick={exportWorkbook} />
			{/snippet}
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
	{/if}
</ReportWorkspace.Root>
```

Public components:

- `Root`: report workspace shell. Props: `ariaLabel?: string`, `children?: Snippet`.
- `Filters`: configuration panel with optional date-range and actions regions. Renders a header band, a responsive config grid (children and `dateRange` flow together), and a bordered action footer. Props: `title?`, `description?`, `dateRange?`, `actions?`.
- `OptionChips`: shadcn `Toggle`-backed multi-select rendered as chips, each with an optional color identity dot. Use for status-type and assignment-type filters instead of route-local toggle buttons. Props: `options: { id; label; color? }[]`, `selectedIds`, `onToggle`, `label?`, `ariaLabel?`, `onToggleAll?`, `allSelected?`. Color is shown as a small dot only; selection uses the standard toggle state, never a flood of the raw color.
- `OptionList`: scrollable shadcn `Checkbox` + `Label` list for personnel, group, MOS, and role selection. Use instead of raw `<input type="checkbox">` lists. Props: `options: { id; label }[]`, `selectedIds`, `onToggle`, `ariaLabel?`, `emptyMessage?`.
- `Content`: report section layout. Props: `layout?: 'stack' | 'split'`. Critical Tasks reports use `split`.
- `Section`: generic bounded report section. Props: `title`, `description?`, `meta?`, `actions?`, `summary?`, `variant?: 'card' | 'briefing'`, `eyebrow?`. The default `card` is a bordered card. `briefing` is an open section under a 2px foreground rule with a small-caps `eyebrow`, a heading-font title and a description capped at 560px; its `actions` stack at the top right. Each briefing column is its own section so stacked columns keep their rules.
- `SummaryStrip`: compact operational summary band for completed report results. Props: `topRisk`, `population`, `parameters`, `findings`, `riskTone?: 'default' | 'warning' | 'danger' | 'success'`, `ariaLabel?`. Use inside the `summary` snippet so the strip sits between the section header and result body, not as a nested card.
- `Table`: DataTable-backed report table section. Props include `data`, `columns`, `table`, `ariaLabel`, `emptyMessage`, `loading`, `showSearch`, `searchPlaceholder`, `pageSize`, and cell/row/header/summary snippets.
- `State`: shared `loading`, `no-data`, and `error` report states. `level?: 2 | 3 | 4` sets the no-data heading level; the default `4` fits a state inside a report section, and a page-level state passes `2`.
- `ExportAction`: shared export command. Props: `label`, `state?: 'ready' | 'loading' | 'disabled' | 'error'`, `disabledReason?`, `errorReason?`, `loading?`, `loadingLabel?`, plus button props such as `href`. Calendar reports render it in their `Table` `actions` snippet.
- `DateRangeField`: start and end date pickers with optional preset buttons. Props: `start` and `end` (bindable ISO dates), `presets?: DateRangePreset[]`, `onCustom?`. Presets are `{ id, label, getRange }`. `WEEK_PRESETS`, `FORECAST_PRESET` and `createYearPresets(referenceDate?)` supply the Calendar report presets; `formatLocalDate(date)` formats a local `YYYY-MM-DD`.
- `createReportRun({ validate, load, compute })`: run state for a report that loads on request. It exposes `status` (`idle`, `loading`, `ready` or `error`), `result`, `error`, `canRun`, `run()` and `reset()`.
- `createMultiSelect(options)`: selection state over a reactive option list. It exposes `options`, `selectedIds`, `allSelected`, `count`, `toggle(id)`, `toggleAll()` and `has(id)`, and pairs with `OptionChips` and `OptionList`.

Shared components own:

- Report page/section structure, spacing, borders, responsive wrapping, state presentation, disabled export affordance, and DataTable section framing.
- Composition with `ui/data-table`, `date-picker`, `field`, `toggle`, `checkbox`, shadcn `button`, `empty`, `alert`, and `spinner`.

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
- If a report needs a reusable new section shape, add it to `patterns/report-workspace` and document it here before route usage.

Consumers:

- All five Calendar reports compose `ReportWorkspace` with `Filters`, `DateRangeField`, `createReportRun` and `State`, and render their results through `Table`. Group availability by day passes a feature-owned `table` state (initial sort by lowest availability) and a `row` snippet whose day cells use the `success`, `warning` and `destructive` tokens at 15% for its availability tones; sorting uses the DataTable sortable header.
- Critical Tasks reports compose `ReportWorkspace` for the readiness trend, expiration cliff, readiness distribution, readiness matrix, at-risk soldiers and tasks-below-threshold sections.
- Training Reports uses a wrapping toolbar for filters and the forecast horizon, page-header actions (secondary Export Excel, primary Print brief), `State`, and `briefing` sections throughout. Its Affected soldiers drill-down puts `DataTable` with a server-backed `table` state (rows, page, page size and total pages from the detail API; sorting off) inside a briefing section, so the table's own Previous/Next pagination drives server pages without client sorting or a scroll box. Type risk renders stacked HTML bars in a semantic table rather than a chart primitive. The normal screen uses shared `ReportWorkspace` composition inside a `print:hidden` wrapper. The feature-owned `TrainingPrintBrief` separately renders the captured loaded report and optional loaded-detail page. Its `data-print-report="training"` root exists only during a print cycle. Scoped rules in `src/app.css` hide app chrome and the sidebar, release shell height and overflow, and select the `training-brief` landscape named page with white margins. Print tables repeat context and headings through `thead` and the matrix key through `tfoot`. The appendix includes only the currently loaded detail page with its exact range and scope; Excel exports all filtered affected requirements. This approved training print composition does not change the shared platform UI architecture.

---

## `patterns/report-chart`

`patterns/report-chart` is the shared shadcn-svelte chart target for operational reports. It composes the generated `ui/chart` container with LayerChart simplified charts so production report routes do not each own axis, grid, legend, and series setup.

Current chart inventory:

- Critical Tasks readiness trend maps to `ReportLineChart` with multiple series.
- Critical Tasks expiration cliff maps to `ReportBarChart layout="stack"`.
- Critical Tasks readiness distribution maps to `ReportBarChart layout="group"` or `layout="overlap"`.
- Training Reports' on-screen forecast maps to `ReportForecastChart`. The print brief renders the feature-owned `TrainingPrintForecast`.
- The platform admin Dashboard's signup chart maps to `ReportBarChart`.
- No current report usage requires a shadcn area chart. Add an area wrapper only when a real route needs cumulative or filled-trend semantics.

Public components:

- `ReportLineChart`: multi-series line chart. Props: `data`, `series`, `ariaLabel`, `yDomain?`, `yTicks?`, `heightClass?`, `class?`.
- `ReportBarChart`: multi-series bar chart. Props: `data`, `series`, `ariaLabel`, `layout?: 'group' | 'stack' | 'overlap'`, `yDomain?`, `yTicks?`, `heightClass?`, `class?`.
- `ReportChartTable`: the screen-reader data table that stands in for a chart. Props: `label` (the table's accessible name), `columns` (header labels, the first for the row-name column) and `rows: { key, cells }[]` (the first cell is the row header). It renders `ui/table` inside `sr-only`. Each Critical Tasks chart renders one beside its chart; `ReportForecastChart` renders its own.
- `ReportForecastChart`: one plot that pairs a readiness line over a shaded area (upper area) with per-interval count bars rising from the shared calendar axis (lower strip), plus a dashed success goal line, an optional highlighted band whose label and caption sit in their own row above the plot, aligned to the band, start and end point labels, and a screen-reader table. Props: `points: { date, label, percent }[]`, `bars: { start, end, count, emphasized }[]`, `goal: { value, label }`, `band: { start, end, label, caption } | null`, `xTicks: { date, label }[]`, `endTone` (text color class, usually from `readinessBandTone`), `ariaLabel`, `heightClass?`, `class?`. Dates are `YYYY-MM-DD` calendar days placed as UTC midnights, so a short final interval and month ticks land exactly. The y domain comes from `readinessTrendDomain` over the points and goal. Axis ticks and bar counts that would overlap a neighbor are dropped; the first and last ticks always stay. Points must not rise over time, so the start label sits above the start point and the end label below the end point, the sides the line never reaches. Each label steps past any gridline or goal line its glyphs would cross. The end label has its own row between the line floor and the bar counts. The goal label sits in the right gutter past the end point, centered on the goal line, and the right padding is sized to fit it, so no plotted mark can reach it. Training Reports uses it for the readiness forecast.

Public helpers:

- `REPORT_CHART_SERIES`: the five series conventions (`--chart-1` to `--chart-5`, each with a line-pattern class and label) so a series stays distinguishable without color.
- `buildReportCountTicks(maxValue, { denseMax?, tickCount? })`: integer y ticks for count charts.
- `readinessTrendDomain(values)`: `[0, 100]` when any value falls below 50, else `[50, 100]`.

Routes configure:

- Data rows, series keys, labels, chart colors, domains, tick values, and surrounding report copy.

Shared components own:

- shadcn chart container usage, LayerChart simplified chart composition, axis baseline, grid styling, legend structure, and responsive chart frame.
- Token paint as classes: axis labels use `fill-muted-foreground`, and grouped or stacked bars separate with `stroke-background`. Series colors are route data and stay as values.

---

## `patterns/requirement-status-badge`

`patterns/requirement-status-badge` owns neutral requirement status visuals. Training owns its badge and status-cell wrappers; Critical Tasks owns its status badge and translates its completion statuses to this shared visual contract. Feature-specific presentation stays with its owner.

```svelte
<script lang="ts">
	import { RequirementStatusBadge } from '$lib/components/patterns/requirement-status-badge';
</script>

<RequirementStatusBadge status="current" label="Current" />
```

Public shared exports are `RequirementStatusBadge` and the `RequirementStatus` type. Routes pass status keys, visible labels and screen-reader labels through the relevant owner component. Keep shared status colors and typography in the neutral base; Training matrix/report cells retain Training's status-cell presentation. `Expiring` uses the `expiring` status token and `Not Required` uses the `status-hatch` utility, both from `src/app.css`.

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

Tier classes live in the typed maps `readinessBandCellPalette` and `readinessBandSwatchFill` in `types.ts`. The ramp colors are `--readiness-band-*` theme colors (`bg-readiness-band-good`, `text-readiness-band-ink`), and the not-applicable hatching is the `readiness-band-stripes` utility. Cells expose `data-tier` for verification.

Semantic palette:

| Tier             | Fill                   | Text                 |
| ---------------- | ---------------------- | -------------------- |
| `good`           | success at 14%         | foreground           |
| `okay`           | warning at 12%         | foreground           |
| `caution`        | warning at 28%         | foreground           |
| `warn`           | destructive at 18%     | foreground           |
| `danger`         | solid destructive      | background, semibold |
| `not-applicable` | none, 1px inset border | muted                |

Public helper:

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

- `Root`, `Viewport`, `Table`, `Header`, `HeaderRow`, `ColumnHeader`, `CornerCell`, `Body`, `RowGroup`, `Row`, `RowHeader`, `Cell`.
- `ColumnGroup` is a foundation part with no production consumer.
- `buildVirtualMatrixWindow(items, { scrollTop, viewportHeight, overscanPx })` positions variable-height rows and returns the visible window. The Critical Tasks matrix uses it.

Public types:

- `OperationalMatrixRow`, `OperationalMatrixColumn`, `OperationalMatrixRowGroup`, `OperationalMatrixCellIdentity`, `OperationalMatrixCellSelection`, `OperationalMatrixSelectHandler`.

Shared component owns:

- Native table structure, compound context, row/column/group identity, selected-cell data attributes, disabled/read-only propagation, accessible cell selection payloads, and stable `data-slot` / `data-matrix-*` styling hooks.
- Optional `ColumnHeader orientation="vertical"` support for narrow training and Critical Tasks task-code columns.

Wrappers own:

- Status colors, legends, toolbars, sorting/filtering, dialogs, date math, training/task semantics, virtualization algorithms, range visuals, and final visual treatment.

Rules:

- Keep domain meaning out of the primitive. Do not add calendar, training, Critical Tasks, DA6, readiness, or status-type assumptions to this layer.
- Dialogs belong in wrappers. `Cell` emits row and column identity; it does not open dialogs itself.
- Color-only cells must provide an accessible label through `ariaLabel`, visually hidden text, or both.
- Production consumers are the Critical Tasks matrix and readiness table, the Training matrix and the Training Reports hot-spot grid. Consumers style its cells and triggers through `data-slot` selectors, as those wrappers do.

---

## `patterns/bulk-import-workspace`

`patterns/bulk-import-workspace` is the shared foundation for operational import workflows. It standardizes upload and paste input panels, validation summaries, preview tables, row selection, progress states, disabled submit reasons, and final result summaries. Feature routes still own parsing, validation rules, duplicate/merge semantics, permissions, and persistence.

```svelte
<script lang="ts">
	import * as BulkImportWorkspace from '$lib/components/patterns/bulk-import-workspace';
	import { useDataTableSelection } from '$lib/components/ui/data-table';
</script>

<BulkImportWorkspace.Root ariaLabel="Personnel import workspace" {step}>
	<BulkImportWorkspace.Header title="Personnel import" step="Step 1" />

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

- `Root`: import workspace shell. Props: `ariaLabel?`, `step?`, `children`. Pass the route's current step key as `step`. When it changes with focus inside this Root, Root holds focus on itself while the step's markup is replaced, so neither the browser nor a dialog's focus trap moves it. Focus then returns to a control that survived the change, or moves to the new step's first `h2` or `h3`. Inside a dialog the whole dialog counts as the Root, because its footer holds the step controls, and focus on the dialog itself counts as held. A step without a heading, such as `ProgressState`, keeps focus held until a later step renders one, unless the user moves focus elsewhere first. Focus outside the Root when the step changes stays where it is. Render one Root around every step so it sees the change.
- `Header`: title, description, step label, and metadata.
- `InputPanel`: shared section for upload, paste, manual, template, or example controls.
- `FileInput`: shared file input presentation using `ui/field` and `ui/input`.
- `PasteInput`: shared textarea presentation using `ui/field` and `ui/textarea`.
- `ValidationSummary`: shared error/warning/ready count summary.
- `PreviewTable`: DataTable-backed preview with optional `useDataTableSelection` row selection. Supports `rowStatus`, `disabledReason`, `statusColumnHeader`, `statusDescriptionMode`, `cellPresentation`, `selectedCountLabel` and `emptyLevel` (forwarded to `DataTable`). Use `cellPresentation="editable-grid"` when route-provided cell snippets render editable inputs in a dense preview; issue-bearing cells should expose a field-level tooltip and `data-cell-state`.
- `ProgressState`: importing/loading state with optional progress value.
- `FooterActions`: footer command region with disabled submit reason.
- `ResultSummary`: final `success`, `partial`, or `failed` result summary. Its title is an `h3`, so a results step without a `Header` still gives Root a focus target.

Shared components own:

- Import workspace structure, file/paste field labels and errors, preview table shell, row status presentation, selectable-row mechanics when `selection` is passed, validation/result state presentation, progress presentation, and responsive layout.

Routes configure:

- Source state, accepted file extensions if needed, pasted text value, examples/templates, parsed rows, validation issues, per-row status data, duplicate/merge decisions, disabled rows, disabled-row reasons, selected-row persistence, submit disabled reasons, retry/back/reset handlers, and API calls.

Import validation/result state guidance:

- Validation errors and warnings should be produced by feature utilities. Shared UI only renders the resulting counts/messages.
- Use `rowStatus` for valid/warning/error/duplicate/disabled/info presentation. It returns a `BulkImportRowStatus` (`tone`, `label?`, `description?`), which `PreviewTable` renders in its status column. Use `disabledReason` for rows that must not be selected; the preview table uses it in the selection label and can render it through the status column.
- `PreviewTable.disabledRow` disables the row's import checkbox, not its cell editors. When the row's `rowStatus` has a description, the checkbox is `aria-invalid` and described by it. Pass the same predicate to `useDataTableSelection` so select-all excludes invalid rows. Editable cells remain available to correct validation errors; use `rowStatus` and `disabledReason` to explain those errors.
- Use `ResultSummary status="partial"` when some rows were saved and some failed.
- Use `ResultSummary status="failed"` when no requested rows were saved.
- Use `ProgressState` for parsing/importing work that blocks closing or submit actions.

Route-level visual override ban:

- Routes must not restyle the import workspace, input panels, validation summary, preview table, footer, or result summary locally.
- If an import workflow needs a durable capability the shared API cannot express, add it centrally, document it here and verify the affected imports.

Consumers: Personnel import, Critical Tasks task import and completion import, Training bulk import and Calendar bulk status import. Each composes `Root`, `PreviewTable` and `ValidationSummary` around its own parsing and mapping. Personnel, Training and Critical Tasks completion import add `Header`, `InputPanel` and `FileInput`; Training adds `PasteInput`. Personnel and Training show `ResultSummary`, and only Personnel uses `FooterActions`.

---

## Public Marketing Shell

Use these for any top-level marketing, legal, or trust page so the public site keeps one shared shell and one navigation/footer contract.

The shared wordmark is `patterns/brand-wordmark`. Public navigation and account-access pages use that same component so its lettering and subtitle stay consistent. It is a pattern rather than a `components/public` file because Identity's AuthShell also renders it, and public routes already depend on Identity. Props: `class?`, `hideSubtitleOnMobile?` (hides the subtitle below the `sm` breakpoint, where the title also steps down from 22px to 18px) and `variant?: 'default' | 'on-chrome'`. `on-chrome` lifts the subtitle to the muted chrome tone; only the public navigation uses it, while it floats over the dark hero. The wordmark paints from `font-heading`, `font-mono`, `text-accent` and the muted text tokens, with no local CSS variables to override.

Public files are Tailwind on central tokens with no `<style>` block or local token set. Amber text on paper uses `text-accent-text` (AA-safe on the light card, the bright accent in dark), the alternating long-form band uses `bg-card-alt`, and the primary amber action is `Button variant="accent"`. Hero grid, page-header noise and scroll reveal are the named utilities `bg-chrome-dots`, `bg-noise` and `reveal` in `src/app.css`. `reveal` hides content only under an ancestor with `.reveal-enabled`, which the landing page sets once its observer is armed; add `.revealed` to show it and `delay-*` to stagger.

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

Props: `label: string`, `meta?: string`, `title: Snippet`, `children: Snippet`

Guidance:

- Keep `label` short, mono, and structural.
- Put supporting copy in `children`. Pass low-emphasis header metadata such as an effective date as `meta`.

### `public/PublicContentSection.svelte`

Shared section framing for legal/trust/public longform pages.

Props: `id?: string`, `label: string`, `alternate?: boolean`, `title: Snippet`, `children: Snippet`

Guidance:

- Alternate sections with `alternate` when you need rhythm across long-form pages.
- Use `PublicContactCard` inside section content for disclosure and support email callouts.

### `public/PublicContactCard.svelte`

Shared email callout for public legal and security pages. `email` is required; `subject` optionally adds an encoded email subject. Keep page-specific instructions in the surrounding section.

### `public/PublicSiteNav.svelte`, `public/PublicCta.svelte`, `public/PublicFooter.svelte`

Lower-level shell primitives used internally by `PublicShell`. Reach for these directly only if you have a compelling reason to diverge from the standard public page wrapper. The navigation's theme toggle and access links and the CTA link are `Button`; the footer wordmark stays hand-set because its sizes differ from `BrandWordmark`.

The landing page FAQ is `ui/accordion` (`type="single"`, one answer open, the open one closes on a second press).

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
- `AppDialog.Content`: shared shell with close button, constrained viewport and mobile-safe width. It reads `busy` and `closeBlocked` from Root. Props: `size?: 'default' | 'wide' | 'fullscreen'`, `showCloseButton?: boolean`. The built-in close button is named `Close`; set `showCloseButton={false}` whenever the footer shows its own `Close` button, so the dialog never offers two.
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

---

## `ui/confirm-dialog`

Shared alert-dialog confirmation built on `ui/alert-dialog`. It handles internal async loading during `onConfirm` and also supports externally controlled `loading` and `disabled` states.

```svelte
{#if showConfirm}
	<ConfirmDialog
		title="Archive Personnel"
		message="Archived personnel leave active rosters and reports. Records are not erased."
		confirmLabel="Archive"
		variant="default"
		onConfirm={handleArchive}
		onCancel={() => (showConfirm = false)}
	/>
{/if}
```

Props: `title: string`, `message: string`, `confirmLabel?: string`, `cancelLabel?: string`, `variant?: 'destructive' | 'default' | 'secondary'` (default `destructive`), `disabled?: boolean`, `loading?: boolean`, `onConfirm: () => void | Promise<void>`, `onCancel: () => void`, `children?: Snippet`. The variant is the confirm `Button` variant. `children` renders between the description and the footer, for example an inline failure `Alert`.

Guidance:

- Keep the default `destructive` for delete, permanent remove, revoke, and irreversible actions.
- Use `variant="default"` for archive, retire, transfer, bulk change, or workflow changes that preserve data but alter active state.
- Use `variant="secondary"` only for a low-emphasis, non-destructive confirmation.
- Return the mutation's promise from `onConfirm` and keep the confirmation mounted until it settles: close it from the success path, not before the await. While the promise is pending both actions are disabled, a spinner renders inside the confirm button, `aria-busy` is set and Escape is ignored. An outside click never closes a confirmation.
- Routes may pass labels, state, handlers, and disabled/loading flags only. Do not pass visual classes or wrap this component to change appearance for one route.

Consumers: confirmations in Calendar, Critical Tasks, Onboarding, Personnel, Rating Scheme, Sign-in rosters, Training, Ranks settings and platform admin announcements.

---

## `ui/button`

Shadcn-svelte button primitive. Variants are `default`, `outline`, `accent`, `secondary`, `ghost`, `destructive` (soft red tint with `text-destructive-text`), `link` and `cell`; sizes are `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg` and `none`. Use `buttonVariants({ variant, size })` when a non-`Button` element needs the same classes.

Use `variant="accent"` for the filled amber call to action on the public site (nav Request Access, CTA and landing hero actions); it lightens on hover through `bg-accent-hover`.

Use `variant="cell" size="none"` for a flat, square button that fills a grid or table cell, such as a Calendar date header, person row header, group band control or long-range day number. `cell` drops the radius, border and press offset, uses normal weight and leading, keeps the ghost hover colors, and draws a 2px inset focus ring so neighboring cells cannot cover it. `none` adds no height, padding or gap, so the cell keeps its own geometry. Callers pass layout utilities and token colors for states such as weekend, today or pinned. They do not restyle the variant's shape, focus ring or press behavior.

```svelte
<Button variant="cell" size="none" class="h-full justify-start gap-2 border-r border-b border-border bg-card px-2 py-1">
	SPC Able, Synthetic
</Button>
```

The month DateCell stays a native `<button>` with its own classes. Each month renders 651 or more of them, and both `ui/button` and the `cell` classes measurably slowed month load (Phase 10 D03 evidence).

---

## `ui/badge`

Shadcn-svelte badge primitive. Use semantic variants for route status instead of local badge color classes.

```svelte
<Badge variant="success">Ready</Badge>
<Badge variant="warning">Review</Badge>
<Badge variant="info">Info</Badge>
<Badge variant="danger">Blocked</Badge>
```

Admin and route status labels map product state to semantic badge variants, not raw color strings.

Props: native anchor/span attributes, `variant?: 'default' | 'secondary' | 'destructive' | 'danger' | 'warning' | 'info' | 'success' | 'outline' | 'ghost' | 'link'`

Badge guidance:

- Use `success`, `warning`, `info`, and `danger` only for real status or classification.
- Use `destructive` for destructive UI states. Prefer `danger` for general status labels such as blocked, overdue, or risk.
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

Import `{ Spinner }` from `$lib/components/ui/spinner`.

---

## Shared Form Controls

Forms use the shadcn-svelte-backed shared control system. The durable public API is compound and explicit: routes compose labels, controls, descriptions, errors, values, disabled state, and handlers. Routes must not restyle controls locally.

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
- `Field.Set` with `Field.Legend` (`variant?: 'legend' | 'label'`): a fieldset for related controls. Rating Scheme entries use it.
- `Field.Title`: a non-label heading for a choice row. Calendar assignment and status settings and Sign-in rosters use it.
- `Field.Group`, `Field.Content` and `Field.Separator` are foundation parts with no production consumer.
- `Field.Control`: control slot wrapper that keeps shared controls full-width without route-local styling.
- `Field.Label`, `Field.Description`, `Field.Error`: label, hint, and error text. Wire the label with `for` or `aria-labelledby`. Each rendered Description and Error inside a `Field.Root` registers its ID (generated unless the caller passes `id`), and the contained `Input`, `Textarea`, `NativeSelect`, `Select.Trigger`, `Combobox.Trigger` and `DatePicker` add those IDs to `aria-describedby` and set `aria-invalid="true"` while an Error is shown. A caller's own `aria-describedby` IDs come first and a caller's `aria-invalid` wins. Popover content starts outside the Field, so a search box in a popup is not described by the trigger's Field. Registration happens on mount; a server-rendered form whose errors must be associated before hydration still wires its IDs explicitly, as `AuthField` does.
- `Input`, `Textarea`, `Select.Root/Trigger/Content/Item`, `NativeSelect.Root/Option/OptGroup`, `Checkbox` and `RadioGroup.Root/Item` are the shared controls.

Rules:

- Use `Select` when an option list needs the shared popup presentation across Windows, macOS, Linux, and browser engines.
- Name every `Select.Trigger` with a `<label for>`, `aria-labelledby` or `aria-label`. The open `Select.Content` listbox takes the same name from its trigger, in that accessible-name order (`aria-labelledby`, then `aria-label`, then the `for` labels). The trigger's text is its selected value and never names the listbox. A name passed to `Select.Content` wins.
- Use `NativeSelect` for plain form choices, including forms that post natively before hydration such as Account Profile's rank list. Calendar, Critical Tasks, Personnel import, platform admin and Ranks settings use it.
- Use `Checkbox` for selection, inclusion or batch choices.
- Use validation errors over hints when both exist. Render the error as `Field.Error` inside the control's `Field.Root` so the association and `aria-invalid` follow it; an alert elsewhere in the dialog is not associated.
- Required markers are visual only with `aria-hidden="true"`; keep native `required` on native controls where submission validation matters.
- Disabled and read-only states come from the shared controls. Do not add local opacity, colors, borders, spacing, or typography to route code.
- Toolbar-compact usage should compose the same controls inside `WorkspaceToolbar.Group`, using shared active counts rather than visual route overrides.

## `ui/combobox`

Compound shadcn-style combobox primitives for searchable selection. Production uses single selection: Calendar assignment dialogs, Critical Tasks completion, Onboarding start, Personnel and Rating Scheme.

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

Props: `Root` accepts `items: readonly (string | { value: string; label?: string; description?: string; group?: string; disabled?: boolean })[]`, `value?: string | string[]` (bindable), `defaultValue?: string | string[]`, `name?: string`, `multiple?: boolean`, `autoHighlight?: boolean`, `disabled?: boolean`, `loading?: boolean`, `loadingText?: string`, `open?: boolean` (bindable), `label?: string`, `onValueChange?: (value) => void`. `Trigger` supports `clearable?: boolean`. `Search` wraps the command input and keeps filtering inside the shared primitive. `Item` requires `value: string` and can also receive `label`, `description`, and `searchValue`. `Value` renders the selected values through its `children` snippet.

- Use for large option lists, searchable personnel/template/type lookup, clearable and non-clearable search selection, and no-results states.
- Pass string items for simple lists. Pass object options when routes need stable ids, display labels, descriptions, group headings, or disabled options.
- When `name` is provided, `Combobox.Root` renders hidden inputs for native form submission. Single-select renders one hidden input; multi-select renders one hidden input per selected value using the same name.
- Use `loading` and `loadingText` for async option fetches. Keep the loading copy generic and route-owned; the visual loading state stays in the shared component.
- `Combobox.Trigger` opens by ArrowDown, Enter or Space. Popup search (or the option container when search is omitted) receives focus; Arrow keys navigate enabled options, Enter commits the option's value and closes single selection, and Escape dismisses without a value change and returns focus to the trigger. The popup is nonmodal by default: outside interaction dismisses without stealing focus; an explicit Content `trapFocus` override remains available.
- `multiple` with `Chips`, `ChipsInput` and `Chip` is a foundation mode with no production consumer. Production multi-selects use `WorkspaceToolbar.MultiSelect` or `ReportWorkspace.OptionChips`. In that mode one Command context owns both the inline input and the popup. Do not move the context into Content or add a second Command root.
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

`Empty.Title` renders a heading. `level?: 2 | 3 | 4` defaults to `2` for a page-level empty state; pass the next level below the nearest section heading when the state sits inside one. `Empty.Media` (`variant?: 'default' | 'icon'`) holds an icon above the header. `Empty.Content` holds actions and supporting content below it.

The root, Organization and platform admin error boundaries and `WorkspaceAccessRestricted` compose `ui/empty` for their status, message and recovery action. The admin boundary renders inside the admin navigation and offers `Try again` for a 5xx. A non-admin denied by the admin layout still reaches the root boundary's 403. A page's `h1` stays a heading element inside `Empty.Header` where the page needs one. `Empty.Root` is full width, so a caller that adds outer margins also sets `w-auto` to keep the margins inside its column.

On Dashboard, Training, Onboarding, Calendar, Personnel, Critical Tasks and Evals, a streamed workspace source that rejects renders `WorkspaceLoadError` (a destructive `Alert` with a `Retry` button that reloads the page) from its route layout, and their pages do not throw from an `{#await}` catch. SvelteKit's root has no boundary to catch a render-time throw, so the loading state would stay up. Critical Tasks Reports and the person record load in blocking page loads, so `critical-tasks/+error.svelte` renders `WorkspaceLoadError` for a 5xx and the Organization error page otherwise.

---

## File Upload Pattern

No shared upload component exists. Upload workflows compose `Field`, `Input type="file"`, `Button`, `Spinner`, `Alert`, and `Progress` as needed, keeping endpoint behavior in the owning feature. Sign-in roster signed scans and Personnel counseling PDFs follow this pattern.

**States**: empty file input or drop zone, uploading progress, selected-file display, file exists, remove, and error feedback.
**Endpoint contract** for sign-in roster signed scans, all on `/org/[orgId]/api/sign-in-rosters/[id]/upload`:

- `POST` with `FormData(file)` returns `{ filePath: string }`
- `GET` returns `{ url: string }`
- `DELETE` returns `200 OK`

**Storage path convention**: `{orgId}/sign-in-rosters/{rosterId}/{uuid}-{sanitized-filename}`

---

## `patterns/type-management-workspace`

Shared shadcn-aligned workspace chrome for manage-type pages. Training Types (with Training's `ApplicabilityEditor`), Training Views and Onboarding templates use it. Another configuration list can use it when it needs a list-detail layout, create/edit mode, row actions, form sections, detail facts, progressive disclosure, or a mobile list/detail flow.

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
			<TypeWorkspace.ItemList aria-label="Training types">
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
					<!-- route-owned chip/button controls -->
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

- `Root`, `Layout`, `List`, `ItemList`, `ListItem`, `Detail`, `Stack`, `FormSection`, `Choice`, `Disclosure`, `Description`, `ColorInput`, `MobileBack`, `DetailHeader`, `FactList`, `Fact`, `FooterActions`, `ActionSpacer`.

Key props:

- `List` and `Detail`: `mobileHidden?: boolean` hides that pane below the large breakpoint while preserving the shared desktop split.
- `ItemList`: renders the `grid` and owns its keyboard model. The selected row (or the first) is the single Tab stop. Up, Down, Home and End move between rows; Right and Left move between a row and its actions. Bind the instance and call `focusSelected()` to restore focus after a row is removed.
- `ListItem`: `title`, `description?`, `color?`, `selected?`, `disabled?`, `onselect?` and an `actions` snippet. It renders a `row` named by its title and described by its description; Enter, Space or a click selects it, and clicks inside `actions` do not.
- `ColorInput`: requires a bound `value`; the route supplies the default color.
- `Disclosure`: `title`, `description?`, and `open?` for shared progressive reveal around larger option groups. Closed content stays mounted but hidden, so route-owned control state survives a toggle.

Rules:

- Do not restyle the workspace from route code. Add shared variants here when a repeated manage-type need appears.
- Use `ListItem` for selectable type rows instead of rebuilding row chrome in each route. Do not add list roles from route code; `ItemList` and `ListItem` own the grid semantics.
- Use `FormSection` for repeated edit/create sections instead of route-local bordered fieldset classes; the shared layout renders them as ruled sections, not stacked cards.
- Use `Choice` for repeated radio/checkbox option rows instead of route-local bordered option classes.
- Use `ColorInput`, `Description`, and `ActionSpacer` when those repeated manage-type details are needed.
- Use `Fact` for configuration facts such as expiration policy, permission state, ordering, and applicability. Facts render as scan-friendly rows, not individual cards. Do not put readiness/report metrics in a type manager.
- Use `Disclosure` for large applicability, targeting, or exclusion option sets instead of route-local chip wrappers. Training's applicability editor owns its searchable `GroupSelector`.
- Use `MobileBack` with `List mobileHidden` and `Detail mobileHidden` when a route needs a mobile list-first flow.
- Keep color swatches accessible by pairing color with labels, summaries, badges, or visible text.

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

Preserve loading-state dimensions with Tailwind utilities on `Skeleton` and mark grouped skeleton-only placeholders with `aria-hidden="true"` when a parent status region already announces loading.

---

## `ui/data-table`

Composable shadcn-svelte DataTable foundation built from the calibrated `ui/table`, `checkbox`, `dropdown-menu`, `skeleton`, `empty`, `input-group` and `button` primitives. Calendar, Critical Tasks, Personnel, Rating Scheme, Training and Organization settings tables use it, as do `ReportWorkspace.Table` and `BulkImportWorkspace.PreviewTable`.

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

`DataTable` props: `data?: T[]`, `columns?: ColumnDef<T>[]`, `table?: DataTableState<T>`, `initialSortKey?: string`, `initialSortDirection?: SortDirection`, `pageSize?: number`, `groupBy?: GroupDef<T>`, `filterFn?: (row: T, query: string) => boolean`, `ariaLabel?: string`, `emptyMessage?: string`, `emptyLevel?: 2 | 3 | 4` (heading level of the empty message, default `3`), `showSearch?: boolean`, `searchPlaceholder?: string`, `rowKey?: (row: T, index: number) => string | number`, `onRowClick?: (row: T) => void`, `rowActionLabel?: (row: T) => string`, `disabledRow?: (row: T) => boolean`, `rowDetailVisible?: (row: T) => boolean`, `loading?: boolean`, `loadingRows?: number`, `density?: 'default' | 'dense'`, `compact?: boolean`, `striped?: boolean`, `stickyHeader?: boolean`, `stickyFirstColumn?: boolean`, `maxHeight?: string`, `scrollRegionLabel?: string`

Pass `scrollRegionLabel` when a wide table can scroll sideways. It names the scroll container as a focusable `region` (`Table.Root` takes the same prop) so keyboard users can scroll it.

Snippets: `cell?: (row: T, col: ColumnDef<T>)`, `row?: (row: T, cols: ColumnDef<T>[])`, `rowDetail?: (row: T)`, `headerCell?: (col: ColumnDef<T>)`, `groupHeader?: (ctx: GroupHeaderContext)`, `toolbar?: (table: DataTableState<T>)`, `footer?: (table: DataTableState<T>)`

`ColumnDef<T>`: `key`, `header`, `value`, `headerAriaLabel?`, `searchValue?`, `compare?`, `searchable?`, `sortable?`, `align?`, `width?`, `rowHeader?`. A `rowHeader` column renders its body cells as `th scope="row"`, so each row is announced by that cell.

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
- If a table needs a new durable visual state or behavior primitive, add it under `src/lib/components/ui/data-table/**`, document it here and verify the affected tables.
- Use `RowActions` for dropdown row commands and `SelectionCheckbox` plus `useDataTableSelection` for selectable rows.
- Mark action/display-only columns with `sortable: false` and `searchable: false`.
- Provide `rowActionLabel` whenever rows are clickable so keyboard and screen-reader users get a clear action name.
- Use `compact` only for dense operational tables. Use `stickyHeader` and `maxHeight` for constrained workspaces.
- Grouped rows are supported for simple collapsible sections. Matrices with sticky axes or heat-map cells use [`ui/operational-matrix`](#uioperational-matrix), not DataTable.

---

## CSS Design System (`app.css`)

### Current Token API

Use shadcn-svelte and Tailwind v4 semantics from `src/app.css`: `@theme inline`, shadcn CSS variables, Tailwind utility classes, and shared component source under `src/lib/components/ui/**`.

Do not introduce route-local variables or token aliases. If a durable visual decision is needed, put it in shadcn semantic tokens, a Tailwind theme mapping, or the smallest shared component boundary that owns the behavior.

### Palette

Use these semantic tokens and Tailwind utilities:

`--background` / `bg-background` | `--foreground` / `text-foreground` | `--card` / `bg-card` | `--muted` / `bg-muted` | `--muted-foreground` / `text-muted-foreground` | `--accent` / `text-accent` | `--destructive` / `text-destructive` | `--border` / `border` | `--ring` / `ring-ring`

Status colors have their own raw tokens, separate from the amber brand `--accent` and the chart series:

`success` -> `--success`
`warning` -> `--warning`
`info` -> `--info`
`danger` -> `--destructive`

Status text uses `text-*-foreground`, backed by separate `--danger-foreground`, `--warning-foreground`, `--success-foreground` and `--info-foreground` tokens that meet WCAG AA on page and muted status surfaces; the base status colors are fills, not text. Raw values live once in `:root` and once in `:root[data-theme='dark']`; each `--color-*` mapping is declared once in `@theme inline`. Chrome and the stepped readiness ramp (`--readiness-band-*`, including `--readiness-band-ink` for text on the ramp) are identical in both themes and are declared only in `:root`. The `--expiring` fill is shared by both themes; `--expiring-foreground` has light, dark and print values. Shared fills that need a pattern are utilities in `src/app.css`: `status-hatch` and `readiness-band-stripes`. Global element defaults sit in `@layer base`, so primitive variants and utilities override them.

Use `bg-success-muted`, `text-success-foreground`, `bg-warning-muted`, `text-warning-foreground`, `bg-info-muted`, `text-info-foreground`, `bg-danger-muted`, and `text-danger-foreground` through shared components where possible.

Small amber text on paper, including plain links, uses `text-accent-text`; the bright `text-accent` is about 3:1 on the light card. Red text on a destructive tint uses `text-destructive-text`, which stays above 4.5:1 at the hover tint; the destructive Button and DropdownMenu item variants read it. Text over a user-chosen color (a training type color) renders in foreground beside a color swatch.

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

`--focus-outline` | `--focus-outline-offset` | `--transition-fast`

These support native controls while the shared component system remains the preferred path for new interactions.

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
