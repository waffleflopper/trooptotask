# Floating Page Toolbar System Plan

## Purpose

TroopToTask needs a reusable floating toolbar system for dense feature pages. The current `FloatingPageToolbar` gives the project a useful visual shell, but its API still leaves too much responsive behavior to page-local composition, CSS breakpoints, and one-off action lists.

The target system should behave like a real toolbar: page authors compose toolbar items as subcomponents, while the toolbar coordinates responsive layout, compact rendering, overflow, active state, and accessibility.

Critical Tasks is the Phase 1 smoke test because it combines the hardest current toolbar requirements:

- group filtering
- personnel search
- view-mode switching
- export and import actions
- privileged-only navigation
- reports navigation
- a primary record-training action
- disabled states
- mobile width pressure

## Current-State Truth

- `src/lib/components/FloatingPageToolbar.svelte` currently provides the shell, leading slot, action slot, optional overflow slot, and breakpoint-based collapse classes.
- Existing supporting primitives include `ToolbarSearch`, `ToolbarSelect`, `SegmentedControl`, `ProgressiveToolbarActions`, `ToolbarOverflowMenu`, and `ToolbarIconButton`.
- `ProgressiveToolbarActions` already uses measurement to collapse lower-priority action labels into overflow, but the behavior is action-list-specific and does not cover filter groups, compact icon states, active badges, search triggers, or toolbar-wide coordination.
- Critical Tasks currently uses `FloatingPageToolbar` with a leading group of select/search/view controls and a `ProgressiveToolbarActions` action list.
- There is no reusable shared tooltip primitive ready for toolbar icon controls. Current matrix/chart tooltip-like behavior is route-specific or chart-layer-specific.

## Design Goals

1. Keep page authoring composable: toolbar items should be subcomponents, not hard-coded entries in a single mega-config.
2. Make responsive behavior explicit in the public API.
3. Prefer measurement-driven collapse over arbitrary viewport breakpoints.
4. Keep the resting toolbar to a single row.
5. Preserve visible controls as long as possible by compacting eligible items before overflowing commands.
6. Treat actions, search, filters, and view controls as distinct item types with distinct defaults.
7. Make active hidden state visible through trigger styling, labels, and badges.
8. Put most behavioral test coverage in the toolbar system itself so route tests can stay parity-focused.
9. Use Critical Tasks to prove the system before migrating other pages.

## Non-Goals

- Do not migrate every existing toolbar usage in Phase 1.
- Do not build a full drawer/sheet system in Phase 1.
- Do not create a new generic tooltip primitive as part of Phase 1 unless implementation discovers an existing shared primitive that can be reused cleanly.
- Do not put stateful filters/search/view controls into the command overflow by default.
- Do not allow multi-row toolbar wrapping as the resting layout.
- Do not introduce route-specific hacks into the shared toolbar family.

## Component Family

Create the new toolbar family under a dedicated shared path such as:

`src/lib/components/ui/toolbar/`

Recommended initial components:

- `FloatingPageToolbar`: public shell and measurement coordinator.
- `ToolbarGroup`: group boundary for related controls, active count, compact trigger, and compact panel.
- `ToolbarAction`: constrained button/link action that supports icons, variants, disabled reasons, compact display, and overflow.
- `ToolbarSearchItem`: search input that can render full-width or compact to a search trigger with inline/popover panel.
- `ToolbarFilterSelect`: select filter primitive with full and compact behavior.
- `ToolbarViewToggle`: segmented/view-mode control with explicit compact behavior.
- `ToolbarOverflowMenu`: command overflow surface, likely reusing or replacing the existing primitive.

Existing primitives should remain during Phase 1 and be migrated later. The new family should become the target API. If a current toolbar does not fit the new API during migration, add a deliberate primitive or policy instead of creating page-local exceptions.

## Canonical Zones

The toolbar has three zones:

- `leading`: filters, search, view modes, lightweight context controls.
- `actions`: primary and secondary page commands.
- generated `overflow`: command overflow menu plus optional author-supplied extra commands.

The toolbar should coordinate groups first, then item priority inside each group.

## Responsive Model

The resting toolbar should remain one row. Hidden or compacted stateful controls may open panels, but the toolbar chrome should not wrap into multiple rows.

Collapse ladder:

1. Render the full controls where space allows.
2. Compact eligible visible items into icon-only or trigger form.
3. If the group still cannot fit, collapse eligible stateful controls into a group trigger/panel.
4. If actions still cannot fit, move lower-priority overflow-eligible commands into overflow.
5. Re-expand in reverse order as width increases.

Actions use command overflow. Stateful controls do not enter command overflow by default.

## Measurement Strategy

The system should be measurement-driven, not breakpoint-driven.

Phase 1 should measure action layout from the start:

- observe toolbar/container width with `ResizeObserver`
- measure full and compact widths for actions
- reserve overflow trigger width when hidden actions exist
- compute full, compact, and overflow states from deterministic layout utilities
- re-run measurement as width changes so items return from overflow when space comes back

Filter/search group compaction may begin with simpler measured thresholds if needed, but the public API should support the same measurement-first direction.

CSS breakpoints may still control touch sizing, mobile panel styling, or small-screen polish. They should not be the main collapse decision mechanism.

## Item Policies

Item policies should be explicit, with sensible defaults.

Recommended shared policy fields:

```ts
type ToolbarPriority = 'low' | 'normal' | 'high' | 'critical';
type ToolbarDisplayMode = 'auto' | 'full' | 'compact';
type ToolbarOverflowPolicy = 'auto' | 'last' | 'never';
```

Defaults:

```ts
{
	priority: 'normal',
	displayMode: 'auto',
	overflow: 'auto'
}
```

Semantics:

- `displayMode="auto"` means full when space allows, compact if a compact representation exists.
- `displayMode="full"` means do not render compact; the item may still overflow if overflow policy allows.
- `displayMode="compact"` means prefer compact rendering; if no compact representation exists, warn in development and render full as fallback.
- `overflow="auto"` means the item may move into command overflow according to priority.
- `overflow="last"` means the item may overflow only after normal eligible items.
- `overflow="never"` means the item must remain visible. If impossible, respect the contract and emit a development warning rather than silently hiding it.
- `priority` controls yield order within a group and policy bucket.

Visual variant is separate from layout priority:

```ts
type ToolbarActionVariant = 'default' | 'primary' | 'danger' | 'ghost';
```

## Ordering Rules

- Author order defines the normal visual order.
- Priority controls collapse/overflow decisions.
- Within the same priority, earlier items yield before later items.
- Overflow menu entries preserve original author order, not yield order.
- Re-expanded items return to their original positions.

## Action Behavior

`ToolbarAction` should support both link and button actions:

- `href` renders an anchor.
- `onclick` renders a button.
- providing both is invalid and should warn in development.

Action props should include:

- `id`
- `label`
- `icon`
- `href`
- `onclick`
- `variant`
- `disabled`
- `disabledReason`
- `priority`
- `displayMode`
- `overflow`
- `testId`

Icons should be passed as Svelte component constructors using the lucide v1 import style:

```ts
import Download from '@lucide/svelte/icons/download';
```

`ToolbarAction` owns icon sizing, spacing, `aria-hidden`, and compact rendering. Phase 1 should not support arbitrary action render snippets unless a real current use case requires it.

Icon-only actions must always preserve:

- accessible name through `aria-label`
- native `title`, using `disabledReason` when disabled or `label` otherwise
- disabled state
- disabled reason in overflow where possible

## Stateful Control Behavior

Stateful controls should be typed separately from command actions.

Recommended categories:

- `ToolbarSearchItem`
- `ToolbarFilterSelect`
- `ToolbarFilterMultiSelect` when needed later
- `ToolbarViewToggle`
- `ToolbarGroup`

Stateful controls default to compact triggers or panels, not command overflow.

Compact triggers should expose active state:

- search trigger active when search text is non-empty
- filter trigger active when filters differ from defaults
- filter group trigger shows active count
- view trigger exposes current mode in visible text when possible and always in accessible label/title

Search and filter state should live in page state. Compact panels should not move live DOM instances between containers. Instead, items/groups should render full and compact/panel snippets against the same controlled state.

## Group Behavior

Groups are first-class responsive boundaries.

Recommended `ToolbarGroup` props:

- `id`
- `label`
- `icon`
- `activeCount`
- `priority`
- `compactStrategy`
- `panelMode`
- optional trigger snippet for unusual cases
- `full` snippet
- `panel` snippet

Recommended compact strategies:

```ts
type ToolbarGroupCompactStrategy = 'items-first' | 'group-trigger' | 'never';
```

- `items-first`: compact individual controls first, then fall back to a group trigger.
- `group-trigger`: jump directly from full controls to one trigger when constrained.
- `never`: keep full controls visible.

The standard group trigger should handle icon, label, active count badge, active state styling, expanded state, disabled state, and accessible attributes. Custom trigger snippets should be allowed only for unusual cases.

## Panel Behavior

Panel mode should be configured per item/group:

```ts
type ToolbarPanelMode = 'inline' | 'popover';
```

Defaults:

- search: `inline`
- filter group: `inline`
- simple select: may use `popover`
- command overflow: menu/dropdown, not panel

Phase 1 should defer true `sheet` behavior. The API should leave room for a future `mobilePanelMode="sheet"` if user feedback supports it.

Only one compact panel should be open per toolbar at a time:

- opening Search closes Filters
- opening Filters closes Search
- opening command overflow closes open panels
- Escape closes the active panel
- closing a panel does not clear its filter/search state

`FloatingPageToolbar` should own open-panel coordination internally in Phase 1. Controlled open-panel props can be added later if a real page needs them.

## Critical Tasks Target Configuration

Critical Tasks Phase 1 should model the intended API.

Leading zone:

- group filter
- personnel search
- A-Z / By Group view toggle

Recommended behavior:

- leading controls are one group with `compactStrategy="items-first"`
- search compacts to a search trigger and opens inline by default
- filters/view collapse to a filter group trigger when needed
- active group filter contributes to filter active count
- active search highlights the search trigger separately

Actions zone:

- `Export CSV`: low priority, default variant, icon `download`, overflow auto
- `Import Completions`: normal or low priority, default variant, icon `upload`, overflow auto, disabled reason
- `Task Library`: normal priority, default variant, icon such as `book-open` or `library`, overflow auto
- `Reports`: normal or high priority, default variant, icon such as `chart-no-axes-column`, overflow auto or last
- `Record Training`: critical priority, primary variant, icon such as `clipboard-check` or `plus`, overflow never, display mode full or auto depending on final visual decision, disabled reason

Permission and disabled behavior must match the current Critical Tasks page.

## Phase 1 Test Contract

Most behavior tests should live with the toolbar family, not route pages.

### Pure Layout Utility Tests

Test deterministic collapse decisions:

- full items fit without compacting
- icon-capable actions compact before overflowing
- label-only actions skip compact and overflow if allowed
- `displayMode="full"` skips compact but can overflow
- `overflow="never"` remains visible
- low priority yields before normal/high/critical
- author order breaks ties
- overflow menu preserves author order
- items re-expand predictably when width increases
- impossible protected layouts produce a detectable warning path

### Component Tests

Test rendered behavior:

- `ToolbarAction` renders anchor or button based on `href` or `onclick`
- invalid `href` + `onclick` warns in development
- icon-only action keeps accessible name and title
- disabled action preserves disabled state and disabled reason in compact and overflow render paths
- search compact trigger opens inline panel and preserves bound state
- filter group trigger shows active count
- only one compact panel opens at a time
- Escape closes active compact panel

### Critical Tasks Smoke Tests

Keep route tests parity-focused:

- toolbar still has accessible name `Critical Tasks controls`
- group filter remains accessible
- search remains accessible and bound
- view toggle remains accessible
- export, import, task library, reports, and record-training controls remain accessible according to current permissions
- disabled states match current behavior
- one constrained-width test proves compact/overflow integration without duplicating the full layout utility matrix

## Migration Strategy

Phase 1:

1. Build the new toolbar family and layout utility tests.
2. Implement component behavior tests for actions, groups, search, filters, panels, and overflow.
3. Migrate the Critical Tasks main page to the new API.
4. Add Critical Tasks parity/smoke tests.
5. Update `docs/component-catalog.md` with the new toolbar API, policies, examples, accessibility guidance, and migration guidance.

Later migration passes:

1. Training pages.
2. Calendar pages.
3. Personnel and related roster pages.
4. Rating Scheme and Evals pages.
5. Critical Tasks subpages.
6. Remove or deprecate superseded toolbar primitives after the last usage migrates.

If a page does not fit the new API, use that as evidence for a deliberate new toolbar primitive or policy.

## Documentation Requirements

Updating `docs/component-catalog.md` is part of the implementation, not optional cleanup.

The catalog update should happen at the end of the Phase 1 implementation after the Critical Tasks smoke test proves the API. It should include:

- import paths
- public component list
- policy terminology
- examples for actions, search, filters, groups, and Critical Tasks-style mixed toolbars
- active-state expectations
- accessibility requirements
- icon import guidance for lucide v1
- migration notes for old `FloatingPageToolbar`, `ProgressiveToolbarActions`, `ToolbarSearch`, `ToolbarSelect`, and `ToolbarIconButton`
- known deferred items: true sheet mode and shared tooltip primitive

## Verification Requirements

Implementation issues created from this plan should run the standard repo verification before completion:

- `npm run format`
- `npm run lint`
- `npm run governance:check`
- `npm run check`
- `npm run test`

Because this is a reusable UI system, implementation slices should also include focused component/unit tests before route migration tests.

## Suggested Issue Slices

### Issue 1: Toolbar Layout Model And Policy Utilities

Build the pure layout utility layer for priorities, display modes, overflow policies, item measurements, and collapse decisions.

Acceptance criteria:

- utility functions decide full, compact, and overflow states deterministically
- named priorities and policies are typed
- tests cover compact-first and overflow-second behavior
- impossible `overflow="never"` layouts produce a detectable warning path

### Issue 2: Toolbar Action And Overflow Primitives

Build `ToolbarAction` and command overflow support using lucide component icons.

Acceptance criteria:

- actions support `href` or `onclick`
- icon+label actions can compact to icon-only
- disabled reasons survive full, compact, and overflow states
- visual variant is separate from layout priority
- component tests cover accessibility and invalid prop combinations

### Issue 3: Toolbar Groups, Search, Filters, And Panels

Build stateful control primitives and group-level compact behavior.

Acceptance criteria:

- search can compact to a trigger and open inline by default
- groups can use `items-first` or `group-trigger`
- active counts and active trigger states render correctly
- only one compact panel opens at a time
- stateful controls do not enter command overflow by default

### Issue 4: FloatingPageToolbar Coordinator

Wire the shell, zones, group coordination, measurement, panel coordination, and generated overflow together.

Acceptance criteria:

- resting toolbar remains one row
- measurement drives action compact/overflow behavior
- groups collapse before item overflow where configured
- Escape and overflow interactions close compact panels
- component tests cover shell coordination behavior

### Issue 5: Critical Tasks Phase 1 Migration

Migrate the Critical Tasks main page to the new toolbar family as the smoke test.

Acceptance criteria:

- current Critical Tasks controls remain accessible and behaviorally equivalent
- icons are added only for Critical Tasks toolbar actions in this slice
- primary record-training action stays visible according to configured policy
- filters/search compact into trigger/panel behavior under constrained width
- route tests assert parity without duplicating the toolbar utility test matrix

### Issue 6: Catalog Update And Migration Guidance

Update the component catalog after the API is proven by Critical Tasks.

Acceptance criteria:

- `docs/component-catalog.md` documents the new toolbar family
- old primitives are documented as legacy or migration-only where appropriate
- examples show Critical Tasks-style mixed filters/search/actions
- known follow-ups for sheet mode and shared tooltip primitive are named
