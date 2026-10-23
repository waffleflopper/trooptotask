# UI system

Use this file for UI component work, shared styling, route UI changes, app-shell work, or shadcn-svelte/Tailwind v4 usage. Read a component's source and its consumers for its API.

## Where UI lives

`src/lib/components/` holds three layers, and the `foundation-placement` check in `scripts/ui-foundation.ts` rejects anything else there.

- `ui/` holds canonical primitives and centrally owned variants.
- `patterns/` holds shared, domain-neutral compositions that current consumers justify.
- `public/` holds the marketing site shell.

Feature UI lives with its owner under `src/features/`, including the app shell (`src/features/app-shell`) and domain presentation such as Calendar's date cells. Import a family through its barrel, `$lib/components/<layer>/<family>`. `scripts/module-boundaries.json` enforces the direction. Patterns may import `ui` and shared code, `ui` may not import patterns, and neither may import a feature. Move a component's imports with it. Do not add a second primitive API or keep old-path re-exports.

`PRODUCT.md` and `DESIGN.md` describe the product and visual direction for design-heavy work.

## Default UI rules

- Use shared primitives before building route-local controls.
- Shared components are visually authoritative. Route code consumes them and does not restyle them.
- Visual changes belong in tokens, shared component source, or a shared variant.
- Route-level visual overrides are forbidden unless Robert explicitly approves that specific visual change.
- Route-level variation is behavioral only: data, labels, validation, permissions, filters, columns, actions, state, and event handlers.
- For a component fit gap within authorized UI work, add the smallest shared API extension, update its consumers, and preserve their behavior. This needs no renewed approval.
- Feature operations own validation, authorization and saved state. A shared component shows caller-provided results and does not decide feature policy. Do not enforce an important rule only through UI state.
- Do not migrate or redesign production routes unless the task asks for it.

## Consistent screens and interactions

Before building a screen, find the nearest page family and reuse its navigation, header, content width, grouping, forms, action placement and save/error behavior. Settings pages, for example, use one settings composition and feedback pattern. Carry an approved design into shared tokens and components. Confirmed behavior takes precedence over an older mockup.

When no suitable pattern exists, build the smallest reusable composition the authorized direction supports. If the visual direction is consequential and unsettled, ask Robert whether to prototype, use a supplied direction or research comparable products. Continue independent work while that decision is pending.

Use accessible shared controls, dialogs and menus. Preserve labels, keyboard and focus behavior, loading/empty/error states and save feedback. Inspect the rendered interaction against an analogous screen at narrow and wide widths, with long and short content. Follow the [testing strategy](../architecture/TESTING.md) for uncovered interaction or accessibility behavior.

## Choose a component

| Need                       | Use                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons and links          | `Button`, with `href` for navigation. Plain content links stay anchors.                                                                |
| Form fields                | `Field.*` around `Input`, `Textarea`, `Select`, `NativeSelect`, `Checkbox` or `RadioGroup`.                                            |
| Searchable selection       | `Combobox.*`. Use `multiple` with chips only to pick a set of records inside a form.                                                   |
| Toolbar and report filters | A `WorkspaceToolbar` item (`select`, `multiSelect`, `toggle`) or `ReportWorkspace.OptionChips`.                                        |
| Small inline single choice | `ToggleGroup.*`, or `SegmentedFilter.Root` for a list filter. Use a toolbar `select` when options are many or data-driven.             |
| Dialogs                    | `AppDialog.*` for content and forms, `ConfirmDialog` for confirmations. Raw `Dialog` and `AlertDialog` are their primitives.           |
| Dates                      | `DatePicker` (ISO `YYYY-MM-DD` binding) and `ReportWorkspace.DateRangeField`. Not `input type="date"`.                                 |
| Tables                     | `DataTable.DataTable` for records, `Table.*` for static content, `OperationalMatrix.*` for sticky-axis or heat-map grids.              |
| Tabs                       | `PageShell.Tabs` for route navigation, `Tabs.*` for in-page views.                                                                     |
| Page layout                | `PageShell.*`. `SectionNav` for an area with several pages. `TypeWorkspace.*` for list-detail type management.                         |
| Reports and imports        | `ReportWorkspace.*` with `ReportChart` charts; `ImportFlow`.                                                                |
| Feedback                   | `toastStore` for transient results; `Empty.*`, `Skeleton`, `Spinner` and `Alert` variants for page states.                             |
| Public pages               | `PublicShell` with `PublicPageHeader` and `PublicContentSection`. Public files use Tailwind on central tokens with no `<style>` block. |

## Composition rules

- **Toolbars.** Every route toolbar is one `WorkspaceToolbar`. Do not compose a toolbar from raw `ButtonGroup`, `Toggle`, `Select` or `InputGroup` controls. `items` order is the only ranking, and the toolbar folds what does not fit into More. Use `menuOnly` for rare or destructive commands and display toggles. Keep a disabled action visible when it explains unavailable work, and give it a `disabledReason`.
- **Page commands.** Page commands go in the page's `WorkspaceToolbar`, not in `PageShell.Header`. The shell owns the page's only `main` landmark, so route content renders a `div` root. Settings pages use one untitled `FactSection` of `display` rows for their body.
- **Dialog saves.** Pass `busy` to `AppDialog.Root` while a save is in flight. Use `PendingSave` and a disabled `fieldset` so a repeated submit sends nothing, and keep the draft when the save fails. Pass `closeBlocked` when dismissal would lose an unsaved draft or an outcome the user must read. Set `showCloseButton={false}` when the footer has its own Close button.
- **Confirmations.** Return the mutation's promise from `onConfirm` and close the `ConfirmDialog` from the success path. Keep the default `destructive` variant for delete, revoke and irreversible actions. Use `default` for archive, transfer or bulk changes that keep data. Use `secondary` only for a low-emphasis confirmation.
- **Destructive emphasis.** `Button variant="destructive-solid"` and `AppDialog.Root tone="destructive"` are only for permanently destroying a unit or its data, such as Delete unit. Every other destructive action uses the soft `destructive` tint, or `ghost-destructive` beside quieter actions.
- **Grid cells.** Use `Button variant="cell" size="none"` for a button that fills a grid or table cell. The Calendar month `DateCell` stays a native `<button>`, because a month renders over 650 of them and `Button` measurably slowed month load.
- **Status badges.** Map product state to `Badge` semantic variants. Use `danger` for status such as blocked or overdue, and `destructive` for destructive UI state.
- **Field errors.** Render a validation error as `Field.Error` inside the control's `Field.Root`, so `aria-describedby` and `aria-invalid` follow it. A server-rendered form whose errors must be associated before hydration wires its IDs explicitly, as `AuthField` does. Use `NativeSelect` for forms that post before hydration.
- **Readiness tiers.** `patterns/readiness-band` presents tiers and does not calculate them. Each feature computes its tier in one place. Never re-derive a tier from a rounded display percent.
- **Streamed loads.** A streamed workspace source that rejects renders `WorkspaceLoadError` from its route layout. Pages do not throw from an `{#await}` catch, because no boundary catches a render-time throw and the loading state would stay up.
- **Toasts.** A toast reports a result and does not establish persistence. Keep a failed save's draft visible for retry.
- **Color.** Pair any color-only cell or swatch with a label or visible text.

## Tokens and theme

`src/app.css` is the only token source. Raw values live once in `:root` and once in `:root[data-theme='dark']`, and each `--color-*` mapping is declared once in `@theme inline`. Chrome tokens and the readiness ramp are the same in both themes and live only in `:root`. Global element defaults sit in `@layer base`, so component variants and utilities override them. Do not add route-local variables or token aliases. Calendar sizing variables such as `--calendar-cell-width` stay inside Calendar.

- The status fills (`--success`, `--warning`, `--info`, `--destructive`) are not text colors. Status text uses `text-*-foreground`, which meets 4.5:1 on page and muted surfaces.
- Small amber text on paper, including links, uses `text-accent-text`, because `text-accent` is about 3:1 on the light card. Red text on a destructive tint uses `text-destructive-text`.
- Fixed layers use `z-banner` and `z-sheet` below shadcn's `z-50` overlays. A sheet sits below the dialogs it can open. Bits portals mount on component mount, not on open, so same-layer overlays paint in mount order. Do not add new z-values. Use the `below-banner` utility rather than reading `--banner-height`.

`themeStore` is the only theme source. It sets `documentElement[data-theme]` and persists the `theme` key, and the `app.html` pre-paint script applies the same key before hydration. Tailwind's `dark:` variant and the dark token block select on `[data-theme='dark']` only. Sonner reads `themeStore.current`, so toasts follow the app theme rather than the system preference.

`components.json` selects Nova, Stone and the aliases. The shadcn-svelte CLI is not installed and the registry is not pinned, so local `ui` families are adapted source, not regenerable stock.
