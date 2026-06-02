# shadcn-svelte And Tailwind v4 Component Inventory

Source of truth: `docs/plans/2026-05-06-shadcn-svelte-tailwind-v4-ui-migration-rfc.md`

## Purpose

This inventory defines the shadcn-svelte component set TroopToTask should plan around before building the component catalog or migrating production routes.

The goal is not to adopt every upstream component. The goal is to identify the smallest complete set that supports the real app: organization settings, Critical Tasks, training, duty rosters, personnel, calendar, onboarding, admin-style flows, public/auth support surfaces, and shared app shell work.

The RFC rule applies here:

> After shared components are visually calibrated, route-level code owns behavior only. Shared visual appearance belongs to the shared UI layer and component catalog.

## Audit Basis

Current docs and files reviewed:

- `docs/plans/2026-05-06-shadcn-svelte-tailwind-v4-ui-migration-rfc.md`
- `docs/component-catalog.md`
- `docs/architecture/MODULE_CONVENTIONS.md`
- `PRODUCT.md`
- `DESIGN.md`
- `src/lib/components/**`
- `src/lib/components/ui/**`
- `src/routes/org/[orgId]/settings/**`
- `src/routes/org/[orgId]/critical-tasks/**`
- `src/routes/org/[orgId]/training/**`
- `src/routes/org/[orgId]/duty-rosters/**`
- `src/routes/org/[orgId]/personnel/**`
- `src/routes/org/[orgId]/calendar/**`
- `src/routes/org/[orgId]/onboarding/**`
- `src/routes/org/[orgId]/admin/**`
- `src/features/critical-tasks/**`
- `src/features/training/**`
- `src/features/duty-roster/**`
- `src/features/personnel/**`
- `src/features/calendar/**`
- `src/features/onboarding/**`
- `src/features/groups/**`
- `src/features/rating-scheme/**`
- `src/features/dashboard/**`

## Current UI Shape Summary

The app already has a meaningful shared UI layer:

- `Toolbar` family for dense authenticated route controls.
- `DataTable` and `useDataTable` for sortable/searchable/paged tables.
- `Modal` and `ConfirmDialog` for dialog workflows.
- `FormField`, `SearchSelect`, and `MultiTagSelect` for common forms.
- `Badge`, `EmptyState`, `Spinner`, `Skeleton*`, `Stepper`, `FileUpload`, `ToastContainer`, and shell components.

The app also has route-local UI that should become shared before broad migration:

- organization settings workspace, activity rail, member ledger, access editor, and danger panels
- duty roster wizard, template settings ledger, preview review table, DA6 matrix, and manual-change panel
- calendar report configuration panels and report tables
- bulk import flows for personnel, training, Critical Tasks, and calendar status import
- custom matrix/grid surfaces for training, Critical Tasks, calendar, and duty roster
- admin search, gifting, suspension, ownership transfer, and platform invite workflows

## Required Components

These are required for the first production-grade shadcn-svelte migration track. Each one should appear in the component catalog before any production route depends on the calibrated version.

| Component | shadcn-svelte basis | Project wrapper likely needed | Known future consumers | Gaps before route migration |
| --- | --- | --- | --- | --- |
| Button | `button` | `Button`, `IconButton`, shared button variants | All routes, modals, toolbars, settings, duty rosters, imports, onboarding cards | Replace `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-amber`, `.btn-sm`, link-command, and route-local icon buttons with shared variants. |
| Button group | `button-group` | `ActionGroup`, toolbar action grouping | duty roster preview output actions, calendar report quick ranges, settings command groups, admin actions | Define when grouped commands are visual grouping versus toolbar behavior. |
| Toggle | `toggle` | `ToolbarToggle`, `StateToggle` | calendar display toggles, training filters, Critical Tasks gap filters, duty roster table toggles | Keep toggle styling central. Route may only set pressed state and label. |
| Toggle group | `toggle-group` | `SegmentedControl`, `ToolbarViewToggle` | training A-Z/group mode, personnel A-Z/group mode, Critical Tasks status/view modes, duty roster preview list/matrix mode | Consolidate current `SegmentedControl`, toolbar view toggles, and route-local segmented controls. |
| Input | `input` | `TextInput`, `SearchInput`, field-owned input | settings forms, personnel modal, training records, calendar reports, duty roster setup, auth pages | Remove route-local `.input` styling and inline widths. Show compact and dense states. |
| Textarea | `textarea` | `Textarea`, field-owned textarea | notes, feedback, suspension reason, duty roster manual-change reason, import paste boxes | Standardize min-height, resize behavior, support text, and error placement. |
| Label | `label` | used inside `Field` and `FormField` wrapper | every form-heavy surface | Mono label treatment must be central, not route-local. |
| Field | `field` | `FormField`, `FieldRow`, `FieldGroup` | settings, modals, training, personnel, imports, auth | Replace old `FormField` gradually with a shadcn-backed field system. Preserve error/hint accessibility. |
| Formsnap | `formsnap` | form validation adapter where form libraries are introduced | future complex settings, auth, onboarding template editor, duty roster wizard | Decide if the migration uses Formsnap broadly or keeps app-owned form state for now. Do not mix form patterns randomly by route. |
| Native select | `native-select` | `NativeSelectField`, `ToolbarFilterSelect` where simple | settings access presets, policies, danger transfer select, calendar reports, duty roster simple selects | Needed for dense forms and browser-native behavior. Calibrate alongside `Select`. |
| Select | `select` | `SelectField`, `ToolbarFilterSelect` | toolbar filters, report filters, member access levels, assignment/status managers | Define when to use native select versus custom select. Mobile behavior and keyboard behavior need component catalog coverage. |
| Combobox | `combobox` | `SearchSelect` replacement | personnel rank/group, duty roster assignee replacement, rating scheme personnel lookup, onboarding start person/template selection | Replace current `SearchSelect` with a shared combobox wrapper. Needs large-list performance and clearable/non-clearable modes. |
| Command | `command` | backing primitive for search select, command menu if used | comboboxes, global admin search, possible future command menu | Treat as implementation primitive first. Avoid adding a global command palette unless explicitly scoped. |
| Checkbox | `checkbox` | `CheckboxField`, `CheckboxList`, `RowCheckbox` | settings access scope groups, onboarding checkbox steps, calendar report group/status filters, duty roster exclusion rows, bulk import checked rows | Current app uses native checkboxes in many layouts. Need shared checkbox row/list patterns before settings and reports migrate. |
| Radio group | `radio-group` | `RadioFieldGroup`, `ScopeSelector` | settings organization/groups scope choice, future wizard choices | Convert current scope radio inputs into a shared pattern. |
| Switch | `switch` | `SwitchField` | boolean settings, show excluded only, show baseline counts only, display preferences | Decide switch versus checkbox semantics. Use switch only for immediate on/off settings, not batch selection. |
| Dialog | `dialog` | `Modal`, `AppDialog` | all current `Modal` usages, personnel modal, training record modal, onboarding report, group manager, feedback, whats new | Rebuild current `Modal` shell on shadcn dialog while keeping footer conventions and async close blocking. |
| Alert dialog | `alert-dialog` | `ConfirmDialog`, destructive confirmation wrapper | delete/archive/restore/revoke/cancel/transfer confirmations across settings, onboarding, personnel, training, Critical Tasks, calendar, admin | Preserve async confirm state, disabled buttons, danger/warning variants, and accessible copy. |
| Sheet | `sheet` | `MobilePanel`, `ToolbarPanel`, `FilterSheet` | compact toolbar panels, mobile filters, settings activity rail on smaller screens, duty roster manual-change panel | Component catalog already notes true mobile sheet panel mode is deferred. Resolve before mobile-heavy route migration. |
| Drawer | `drawer` | optional mobile drawer wrapper around sheet behavior | mobile account/menu, mobile command panels, long forms on small screens | Use only if sheet is insufficient for mobile ergonomics. Decide before duplicating sheet/drawer patterns. |
| Popover | `popover` | `PopoverPanel`, date/help/filter popovers | toolbar compact search/filter panels, date pickers, account menu internals, inline help | Define focus behavior and collision handling once. |
| Dropdown menu | `dropdown-menu` | `OverflowMenu`, `ToolbarOverflowMenu`, `AvatarMenu` | toolbar command overflow, avatar/account menu, row action menus, admin menus | Replace current overflow/avatar menus with shared menu primitives and lucide icons. |
| Tooltip | `tooltip` | `Tooltip`, icon button tooltip | icon-only toolbar actions, navigation rail icons, compact controls, help affordances, disabled action reasons | Current catalog lists shared tooltip as deferred. This blocks polished icon-only migration. |
| Badge | `badge` | `Badge`, `StatusBadge`, `MetaBadge` | status labels across training, duty roster, onboarding, personnel, settings, admin, reports | Preserve mono uppercase label style. Define semantic variants and ban decorative color use. |
| Alert | `alert` | `NoticeBanner`, `InlineAlert`, `Callout` | onboarding configuration warnings, calendar load errors, settings form errors, admin warnings, duty roster review warnings | Replace route-local `notice-banner`, `admin-alert`, `warning-box`, `context-box`, and `error-box` patterns. |
| Sonner | `sonner` | toast adapter replacing `ToastContainer` and `toastStore` view | all toast feedback, personnel award tracking, calendar export failure, form save errors | Decide whether to keep the store API and swap renderer, or migrate callers. |
| Progress | `progress` | `ProgressBar`, onboarding progress, loading progress | onboarding cards, import progress, readiness/progress summaries | Current progress bars are route-local. Need semantic progress with labels and color-independent meaning. |
| Skeleton | `skeleton` | `Skeleton` | training matrix loading, calendar loading, duty roster loading, dashboard widgets, reports | Use shadcn skeleton directly with Tailwind dimensions. Show dense grid variants. |
| Spinner | `spinner` | `Spinner`, button loading indicator | async buttons, modals, onboarding resync, imports, saves | Keep or wrap existing spinner. Calibrate size/color against button variants. |
| Empty | `empty` | `EmptyState` | personnel, training, Critical Tasks, onboarding, DataTable, reports, sign-in rosters, imports | Preserve action button support and simple/box variants. |
| Table | `table` | base `Table` primitives | settings archived table, calendar reports, duty roster DA6 matrix, report export previews | Define base table styling for native table surfaces that are not full `DataTable`. |
| Data table | `data-table` | `DataTable`, `useDataTable`; legacy `BulkImportTable` removed | personnel roster, rating scheme, future training reports, Critical Tasks tables, settings members/archive, import previews | Existing `DataTable` is strong but must be shadcn-backed or deliberately retained as app wrapper. Add mobile, row actions, sticky headers, dense cells, and bulk selection cases to component catalog. |
| Pagination | `pagination` | `TablePagination`, `PagedListControls` | personnel DataTable, future settings/member tables, audit logs, admin lists, report pages | Required because several current large lists will not stay route-local forever. |
| Tabs | `tabs` | `Tabs`, `RouteTabs` | settings sections, admin sections, onboarding history/templates, duty roster generate/history/settings, dashboard tabs, calendar reports | `SubNav` has been removed because no production usage remained. Decide tab versus toolbar nav versus side nav by surface. Avoid multiple visual tab styles. |
| Breadcrumb | `breadcrumb` | app-shell breadcrumb wrapper | `TopHeader`, nested duty roster/template/report routes, admin detail pages | Current breadcrumbs are shell-local. Move to shared calibrated component. |
| Sidebar | `sidebar` | `AppSidebar`, settings side nav, admin side nav | authenticated app rail, settings workspace nav, admin shell, future component catalog navigation | Must preserve current desktop rail and mobile bottom nav behavior. Do not adopt a generic SaaS sidebar look. |
| Navigation menu | `navigation-menu` | public nav or admin navigation where needed | public marketing nav, admin shell, possibly account/security routes | Authenticated route nav likely uses sidebar/tabs instead. Keep public/auth expression distinct. |
| Avatar | `avatar` | `AvatarMenu`, member avatar | top header account menu, settings member ledger, admin user/org lists | Replace current initials circles with shared avatar treatment. |
| Separator | `separator` | `Separator`, `SectionRule` | modals, settings sections, detail panels, report sections, menus | Hairline rules are central to the field-ledger system. |
| Scroll area | `scroll-area` | `ScrollArea`, table/workspace scroll wrappers | data tables, calendar, duty roster panels, modal bodies, settings rails | Needed for predictable dense workspaces and sticky headers. |
| Calendar | `calendar` | `DatePickerCalendar`, not main availability calendar | date picker internals for forms/reports | Do not replace the main operational calendar with shadcn Calendar. Treat app calendar as project-specific. |
| Date picker | `date-picker` | `DateField`, `DateRangeField`, quick range wrapper | calendar reports, duty roster generate range, training record completion dates, personnel ETS/PCS fields | Current date inputs are native. Decide whether date picker improves or harms dense operational work. |
| Chart | `chart` | `ReportChartSection`, chart tooltip/legend conventions | Critical Tasks charts, dashboard, calendar reports, future readiness reports | Existing chart wrappers should become project wrappers over shadcn chart conventions. |
| Typography | `typography` | prose/heading utility wrappers or classes | docs-like public pages, legal pages, dense explanatory settings copy | Product UI should not scatter one-off type classes. Keep display typography out of dense controls. |

## Optional Or Later Components

These are not first-wave requirements. They may be useful, but they should not block the foundation, component catalog, or first app-area migrations.

| Component | Likely timing | Possible consumers | Reason to defer |
| --- | --- | --- | --- |
| Accordion | Later | settings help, security/legal FAQs, mobile dense sections | Current core workflows rely more on tabs, sheets, and inline panels. |
| Aspect ratio | Later | public marketing media, empty-state illustrations if any | Not central to authenticated product UI. |
| Carousel | Avoid unless explicitly approved | marketing only | Not appropriate for dense operational app surfaces. |
| Collapsible | Later | settings activity rail, onboarding card detail, duty roster panels | Current expansion patterns exist, but migration can use app wrappers first. |
| Context menu | Later | DataTable row actions, calendar cells, duty roster matrix cells | Powerful but easy to hide actions. Prefer visible row actions first. |
| Hover card | Later | personnel hover summaries, status explanations | Hover-only behavior is weak on mobile. Use popover/details first unless justified. |
| Input group | Later but likely | search inputs with icons, invite code copy controls, file/link copy fields | Useful after base input and button variants settle. |
| Input OTP | Later | MFA verification or invite codes | Only relevant if auth/MFA screens are migrated into this system. |
| Item | Later | command/search results, account menus, admin search results | Implementation detail for command/menu/search patterns. |
| Kbd | Later | admin shortcuts, help docs | No current core workflow depends on visible keyboard shortcut docs. |
| Menubar | Avoid for now | none obvious | Desktop menubar does not fit current app shape. |
| Range calendar | Later | reports and duty roster date ranges | Use only if native/date-picker range UX is not enough. |
| Resizable | Later | duty roster preview/manual panel, dashboard/report layouts | Adds complexity and persistence questions. Not needed for first migration. |
| Slider | Later | thresholds, warning windows | Numeric fields are clearer for operational settings. |
| Card | Use only through wrappers | dashboard widgets, bounded repeated records, modals, public page cards | The design system warns against card soup. Do not expose generic Card as a route styling escape hatch. |

## Project-Specific Wrappers Needed

These wrappers should be designed in shared UI before production route migration. Most should be represented in the component catalog.

| Wrapper | Likely base components | Known consumers | Notes |
| --- | --- | --- | --- |
| `AppShell` / `AppSidebar` / `MobileNav` | `sidebar`, `avatar`, `breadcrumb`, `dropdown-menu`, `tooltip` | `TopHeader`, `BottomTabBar`, org layout | Preserve desktop rail plus mobile bottom nav. shadcn sidebar may inform structure, but TroopToTask visual chrome remains calibrated centrally. |
| `PageShell` | `separator`, `scroll-area`, typography tokens | all authenticated route pages | Standardize page padding, overflow, loading, permission states, and route body density. |
| `PageHeader` / `BreadcrumbHeader` | `breadcrumb`, `separator` | top header, settings, admin detail, duty roster nested views | App shell should own route identity. Avoid repeating large in-body titles on dense pages. |
| `Toolbar` family | `button`, `toggle`, `toggle-group`, `select`, `dropdown-menu`, `popover`, `sheet`, `tooltip` | current toolbar users across personnel, training, Critical Tasks, calendar, onboarding, rating scheme | Existing family should survive as a project wrapper. Add mobile sheet panel mode and tooltip support before broad migration. |
| `DataTable` | `table`, `checkbox`, `dropdown-menu`, `pagination`, `scroll-area`, `empty`, `skeleton` | personnel, rating scheme, settings archive/member lists, future reports, imports | Keep behavior API app-owned. Use shadcn table parts for visuals and interaction primitives. |
| `BulkImportWorkspace` | `field`, `input`, `textarea`, `button`, `alert`, `progress`, `data-table`, `file upload` | personnel bulk manager/merge, Critical Tasks imports, training imports, calendar bulk status import | Current import flows repeat step cards, upload/paste choices, preview tables, results, and error lists. |
| `FileUpload` | `button`, `input`, `progress`, `alert` | sign-in rosters, future document uploads, imports | Existing component is app-specific because endpoint contract and signed-download behavior matter. |
| `FormField` / `FormSection` | `field`, `label`, `input`, `select`, `textarea`, `checkbox`, `radio-group`, `switch` | settings, training/personnel modals, duty roster wizard, admin modals, auth pages | Should bridge current simple bindable fields and future Formsnap usage. |
| `SearchSelect` / `ComboboxField` | `combobox`, `command`, `popover`, `input` | personnel rank/group, duty roster replacement, rating scheme, onboarding start/switch templates | Must handle large lists, compact mode, clearable mode, and keyboard navigation. |
| `MultiSelectField` | `combobox`, `command`, `badge`, `popover` | duty roster filters, training reports, Critical Tasks reports, MOS/rank/role filters | Replaces `MultiTagSelect`; must support active count, removable tags, and toolbar compact mode. |
| `StatusBadge` / `MetaBadge` / `ReadinessBand` | `badge` | training statuses, onboarding step types, duty roster review states, member roles, subscription state, Critical Tasks report readiness tiers | Create semantic variants before routes migrate. Do not pass arbitrary colors from routes unless representing domain data. Readiness report heat-cell colors and hatching belong in `ui/readiness-band`. |
| `NoticeBanner` / `InlineAlert` | `alert`, `button` | onboarding sync/configuration, settings warnings, calendar load errors, duty roster manual review warnings, admin callouts | Replaces route-local notice, error, warning, and context boxes. `ui/alert` now carries shared `info`, `success`, `warning`, and `destructive` tones. |
| `ConfirmDialog` | `alert-dialog`, `spinner`, `button` | all destructive and warning confirms | Keep async confirm behavior and danger/warning variants. |
| `AppDialog` / `Modal` | `dialog`, `button`, `separator`, `scroll-area` | all modal workflows | Current Modal API may remain as compatibility wrapper while internals move to shadcn dialog. |
| `SettingsWorkspace` | `sidebar` or tabs, `field`, `table`, `badge`, `alert`, `dialog` | organization settings, possibly admin org detail | Extract member ledger, access editor, policy sections, activity rail, and danger zone into shared or feature-owned wrappers. |
| `AccessEditor` | `select`, `radio-group`, `checkbox`, `field`, `alert` | settings members, invitations, admin/member flows | The capability/scope editor is too complex for route-local markup during migration. |
| `RouteTabs` | `tabs`, `toolbar nav`, `badge` | onboarding, duty roster, settings, admin, dashboard, calendar reports | `SubNav` has been removed. Decide one route-level navigation treatment for dense workspaces before recreating this pattern. |
| `Wizard` / `StepIndicator` | `button`, `progress`, `separator`, maybe `tabs` | duty roster new template, onboarding setup, import flows | Existing `Stepper` is onboarding-stage-specific. Duty roster wizard needs a shared stepper/wizard pattern. |
| `WorkflowPanel` | `alert`, `field`, `button`, `empty`, `separator` | onboarding setup/workflow panels, training type manager, task library/configuration panels | Shared list-detail and two-panel workflow chrome. Routes own behavior and form content; shared components own panel radius, borders, selected-row treatment, spacing, and alert tones. |
| `OperationalMatrix` | `table`, `scroll-area`, `tooltip`, `badge`, `popover` | Critical Tasks matrix, training matrix, DA6 matrix, calendar long range | These are not generic DataTables. They need shared grid/matrix rules for sticky axes, cell status, legends, and mobile overflow. Readiness-tier cells should compose `ui/readiness-band` instead of embedding report-local colors. `ColumnHeader orientation="vertical"` supports narrow task-code columns, and `IctMatrix` should retire into the training-matrix parity path. |
| `ReportSection` / `ChartSection` | `chart`, `table`, `tabs`, `toolbar`, `empty`, `skeleton` | Critical Tasks reports, calendar reports, dashboard reports | Current reports mix config panels, charts, native tables, and export actions. |
| `DateRangeControls` | `date-picker`, `native input`, `button group` | calendar reports, duty roster generate, export filters | Must decide native date fields versus date picker before report migration. |
| `AdminSearch` | `combobox`, `command`, `popover`, `badge` | platform admin search | Current admin search is local and dropdown-like. Good candidate for Command-backed wrapper later. |
| `ToastProvider` | `sonner` | root layout and toast store callers | Keep current `toastStore` API if possible to avoid churn. Swap renderer centrally. |
| Shared catalog guidance | most required components | component catalog guidance | The component catalog should cover light/dark, desktop/mobile, all required states, and route-like dense examples. |

## App-Area Consumption Notes

### Organization Settings

Current needs:

- settings side navigation
- member ledger rows
- avatar/initials treatment
- access preset select
- capability matrix
- organization/groups scope radio controls and checkbox lists
- invite form
- pending invitation list
- activity rail with tabs
- policy numeric fields
- archived personnel table
- data export command groups
- danger zone destructive forms
- delete/transfer/permanent-delete confirmations

Required components:

- `sidebar`, `tabs`, `button`, `input`, `native-select` or `select`, `checkbox`, `radio-group`, `field`, `badge`, `alert`, `table`, `dialog`, `alert-dialog`, `avatar`, `separator`, `scroll-area`, `tooltip`

Wrappers to resolve first:

- `SettingsWorkspace`
- `AccessEditor`
- `MemberLedger`
- `ActivityRail`
- `DangerZonePanel`
- `PolicyFormSection`

Gaps:

- Permission capability editing needs a first-class shared pattern before deeper visual migration.
- Activity rail tabs and mobile behavior need a shared pattern before reuse outside organization settings.

### Critical Tasks

Current needs:

- matrix grid with sticky axes and status cells
- report charts and report data tables
- task library split view
- toolbar filter groups, search, view toggle, multi-select filters
- completion modal with searchable person/task selects
- bulk task and completion import flows
- readiness/status badges, legends, and empty states

Required components:

- `toolbar`, `button`, `toggle-group`, `select`, `combobox`, `multi-select`, `table`, `data-table`, `badge`, `empty`, `dialog`, `alert-dialog`, `field`, `textarea`, `chart`, `skeleton`, `tooltip`, `popover`, `scroll-area`

Wrappers to resolve first:

- `OperationalMatrix`
- `ReportSection`
- `BulkImportWorkspace`
- `SearchSelect`
- `StatusBadge`

Gaps:

- Matrix cells and legends are highly custom. Treat them as project-specific, not generic shadcn DataTable.
- Critical Tasks report readiness bands are centralized in `ui/readiness-band`; future matrix migration should compose that component inside `OperationalMatrix.Cell`.
- `IctMatrix` should go away in favor of visual parity with the training matrix through `ui/operational-matrix`; keep support for rotated task-code headers so columns stay narrow.
- Bulk import has repeated step/workspace UI that should become shared before migration.
- Reports need consistent chart/table shells and export toolbar behavior.

### Training

Current needs:

- training matrix
- toolbar filters and report filters
- training view selector/manage views
- training type manager
- training record modal
- person training editor
- bulk importer
- sign-in roster modal and file upload
- reports with multi-select filters and export actions

Required components:

- `toolbar`, `button`, `toggle-group`, `select`, `multi-select`, `combobox`, `data-table`, `table`, `badge`, `empty`, `dialog`, `alert-dialog`, `field`, `textarea`, `file upload`, `skeleton`, `chart`

Wrappers to resolve first:

- `OperationalMatrix`
- `FormSection`
- `BulkImportWorkspace`
- `FileUpload`
- `ReportSection`
- `TypeManager`

Gaps:

- `TrainingMatrix` and training report surfaces should line up with `ui/operational-matrix`, `RequirementStatusBadge`, `ui/readiness-band`, and `ui/report-workspace` rather than retaining route-local panel/background/status decisions.
- `ViewEditorModal` and `TrainingTypesPage` contain reusable type-management and workflow-panel patterns that should move behind `ui/type-manager`, `ui/workflow-panel`, and shared `ui/alert` variants.
- Report filters already use toolbar pieces but need shared report-page structure.

### Duty Rosters

Current needs:

- template register/list
- duty roster route tabs
- new template wizard
- template settings ledger
- multi-select pool filters
- resolved pool tables
- exclusion checkboxes
- manual baseline count tables
- generate form
- preview review list
- DA6 matrix
- manual-change side panel
- warning summaries and review badges
- history view and correction actions

Required components:

- `button`, `button-group`, `tabs`, `field`, `input`, `textarea`, `multi-select`, `checkbox`, `table`, `badge`, `alert`, `skeleton`, `combobox`, `sheet`, `scroll-area`, `tooltip`, `separator`

Wrappers to resolve first:

- `Wizard`
- `OperationalMatrix`
- `SettingsWorkspace` or `LedgerForm`
- `ManualChangePanel`
- `DateRangeControls`
- `RouteTabs`

Gaps:

- Duty roster has the largest local visual system. It should not be migrated by sprinkling shadcn classes into route files.
- The DA6 matrix and preview review workflow need explicit shared grid/matrix rules.
- The manual-change panel is a good candidate for `Sheet` on constrained screens.

### Personnel

Current needs:

- toolbar search and view toggle
- personnel DataTable with row actions
- grouped roster performance guard
- personnel modal
- group manager modal
- bulk personnel manager and merge import
- award tracking row action
- empty states and read-only state

Required components:

- `toolbar`, `button`, `toggle-group`, `input`, `combobox`, `field`, `data-table`, `pagination`, `empty`, `dialog`, `alert-dialog`, `badge`, `alert`, `skeleton`, `file upload`

Wrappers to resolve first:

- `DataTable`
- `BulkImportWorkspace`
- `FormField`
- `GroupManager`
- `PermissionState`

Gaps:

- Personnel DataTable is the best baseline for app-wide table migration.
- Bulk personnel merge has local upload/paste/results UI that should join the import wrapper.
- The grouped roster scale guard should become a shared large-list state or DataTable state.

### Calendar

Current needs:

- main operational calendar grid
- long-range view
- toolbar filter/search/actions
- availability modal
- daily assignment modal
- status legend
- month/year picker
- status and assignment type managers
- special day manager
- calendar reports with date ranges, quick ranges, group/status filters, report tables, exports
- bulk status import

Required components:

- `toolbar`, `button`, `select`, `combobox`, `field`, `date-picker` or native date fields, `checkbox`, `badge`, `dialog`, `alert-dialog`, `table`, `data-table`, `alert`, `empty`, `skeleton`, `chart`, `tooltip`, `scroll-area`

Wrappers to resolve first:

- `OperationalCalendar`
- `DateRangeControls`
- `ReportSection`
- `BulkImportWorkspace`
- `StatusLegend`
- `TypeManager`

Gaps:

- Do not replace the main calendar grid with shadcn Calendar. It is an app-specific operational calendar.
- Calendar reports have several route-local table/config patterns that should become shared report components.
- Special day and assignment/status managers use inline styles and local form/list patterns.

### Onboarding

Current needs:

- toolbar nav/actions/meta
- active onboarding cards with expandable detail
- progress bars
- checkbox steps
- paperwork stepper
- notes panels
- configuration and sync notices
- start onboarding modal
- template manager and template pages
- history page
- report modal
- confirm dialogs for cancel/delete/remove steps

Required components:

- `toolbar`, `button`, `tabs` or route nav, `progress`, `checkbox`, `badge`, `empty`, `alert`, `dialog`, `alert-dialog`, `combobox`, `field`, `textarea`, `stepper/wizard wrapper`, `skeleton`, `tooltip`

Wrappers to resolve first:

- `OnboardingCard`
- `ProgressBar`
- `Stepper`
- `TemplateManager`
- `NoticeBanner`

Gaps:

- Onboarding uses many card/detail local styles. Shared progress, note, and expandable-detail patterns should land before migration.
- Current `Stepper` is useful but should be recalibrated for shadcn tokens and maybe separated from wizard step indicators.

### Admin-Style Flows

This includes org admin routes under `src/routes/org/[orgId]/admin/**`, settings admin-like flows, `src/features/groups/**`, and platform admin components under `src/lib/components/admin/**`.

Current needs:

- admin search
- user/org lists and result dropdowns
- member/invite managers
- permission/preset forms
- gift tier modal
- suspend modal
- transfer ownership modal
- platform invite modal
- destructive confirmations
- status badges and alerts

Required components:

- `button`, `input`, `select`, `textarea`, `field`, `badge`, `alert`, `dialog`, `alert-dialog`, `combobox`, `command`, `dropdown-menu`, `table`, `data-table`, `empty`, `avatar`, `tooltip`

Wrappers to resolve first:

- `AdminSearch`
- `AdminModal`
- `AccessEditor`
- `MemberLedger`
- `StatusBadge`

Gaps:

- Admin components currently use local `admin-*` classes and modal-local form patterns.
- Admin search should become a Command/Combobox-backed shared wrapper if it remains prominent.
- Platform admin should inherit the same component baseline but may keep its own more utilitarian shell.

### Public And Auth Support Surfaces

Current needs:

- public shell, nav, content sections, CTA, pricing tier, legal/trust longform
- auth shell, auth notices, login/register/reset/request-access forms
- account security surface

Required components:

- `button`, `input`, `field`, `alert`, `dialog` where needed, `navigation-menu`, `separator`, `typography`, `badge`, `card` through public wrappers only

Wrappers to resolve first:

- `PublicShell`
- `PublicPageHeader`
- `PublicContentSection`
- `AuthShell`
- `AuthForm`

Gaps:

- Public/auth visual expression can be more editorial than product UI, but it must share token calibration.
- Generic `Card` should remain wrapped. Public pages should not teach authenticated product routes to use decorative card grids.

## Component Catalog Requirements From Inventory

The component catalog should include these minimum example groups:

1. Buttons: default, primary, secondary, danger, amber/signal, ghost if retained, icon-only, loading, disabled, links styled as buttons.
2. Forms: input, textarea, native select, custom select, combobox, multi-select, checkbox, radio group, switch, number/date fields, hints, errors, disabled, required.
3. Toolbar: full width, compact search, compact filter group, multi-select filters, nav/meta/metric items, command overflow, protected primary action, disabled action reason, mobile sheet/panel.
4. Tables: simple table, DataTable, sticky header, row action, row click, grouped rows, pagination, empty, loading, bulk selection, dense matrix-like table.
5. Matrices: Critical Tasks matrix sample, Training matrix sample, DA6 matrix sample, Calendar long-range sample.
6. Dialogs: normal dialog, destructive alert dialog, async confirm, modal with sticky footer, modal with scrollable body.
7. Navigation: app sidebar, mobile nav, breadcrumbs, route tabs, subnav, settings side nav.
8. Feedback: alert/notice, toast, inline error, skeletons, spinner, progress, empty states.
9. Status: badges, semantic status rows, legends, warning summaries, permission/read-only states.
10. Reports: chart section, report toolbar, report filter panel, export action, no-data state.
11. Imports: upload/paste choice, preview table, validation errors, importing, results summary.
12. Theme: every above group in light and dark mode, plus mobile and desktop widths.

## Design-System Gaps To Resolve Before Production Route Migration

1. **Token mapping**
   - Map TroopToTask paper/ink/amber/semantic tokens into shadcn/Tailwind v4 token names.
   - Decide `data-theme`, `.dark`, or dual support during migration.
   - Preserve TroopToTask's tight radius and low-shadow product style.

2. **Shared component ownership**
   - Decide which generated shadcn components are raw primitives and which are wrapped by project components.
   - Do not let feature routes import raw primitives for visual changes before wrappers exist.

3. **Visual override governance**
   - Define a lint or review rule for route-local visual overrides.
   - Allow route-level layout only where the route owns layout responsibility, not component appearance.

4. **Toolbar mobile behavior**
   - Finish true mobile sheet/panel mode.
   - Add shared tooltip support for icon-only toolbar actions.
   - Confirm disabled action reason behavior across full, compact, and overflow states.

5. **DataTable and matrix split**
   - DataTable should own sortable, searchable, paginated data lists.
   - OperationalMatrix should own grid/matrix surfaces such as Critical Tasks, Training, DA6, and long-range Calendar.
   - Do not force matrix workflows into generic DataTable if it harms scanability.

6. **Forms and validation**
   - Settle native select versus custom select rules.
   - Decide how Formsnap is used, if at all.
   - Standardize hint/error rows, required markers, disabled state, and async save state.

7. **Combobox and multi-select**
   - Replace current `SearchSelect` and `MultiTagSelect` with shadcn-backed wrappers.
   - Ensure large-list performance, keyboard navigation, active count, removable tags, and compact toolbar use.

8. **Dialogs and confirmations**
   - Rebuild current `Modal` and `ConfirmDialog` APIs on shadcn primitives before migrating modal-heavy routes.
   - Preserve current footer convention and async close blocking.

9. **Settings and access editor**
   - Organization settings is too custom to migrate directly.
   - Extract access editor, member ledger, activity rail, and policy sections first.

10. **Bulk import pattern**
   - Personnel, training, Critical Tasks, and calendar status imports need one shared import workspace pattern.
   - Include upload, paste, preview, validation, partial success, and final result states.

11. **Report pattern**
   - Calendar and Critical Tasks reports need shared report configuration, toolbar, chart/table, export, and no-data states.
   - Avoid route-local report tables after calibration.

12. **Status and semantic color**
   - Define semantic badge and alert variants centrally.
   - Domain-driven colors can remain data-driven only when they truly represent domain data, such as configurable status type color.

13. **App shell**
   - Preserve the operational rail and mobile bottom nav.
   - Calibrate sidebar, avatar menu, notification, breadcrumbs, help, feedback, and banners together.

14. **Admin style**
   - Admin can remain denser and more utilitarian, but should not run a separate visual system.
   - Admin modals/forms/search should use the same calibrated primitives.

15. **Public/auth split**
   - Public/auth wrappers may have different composition, but should use the same tokens and component baseline.
   - Keep generic Card wrapped so it does not become an authenticated-route styling escape hatch.

## Recommended Inventory Decision

Adopt the required components as the Phase 2 component set, but expose most of them to routes only through TroopToTask wrappers.

Priority order:

1. token mapping and shadcn install shape
2. button, field, dialog, alert dialog, badge, alert, tooltip, toast
3. toolbar, select, combobox, multi-select
4. DataTable, table, pagination, empty, skeleton
5. AppShell, PageShell, RouteTabs, settings/access wrappers
6. OperationalMatrix, report, import, calendar/date controls
7. optional components only when a real route need appears

The first production route migration should not begin until the component catalog proves the required components and the gaps above have an owner or an explicit deferral.
