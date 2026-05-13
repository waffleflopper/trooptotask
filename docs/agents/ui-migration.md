# UI And Design-System Migration

Use this file for UI component work, route migration, shared styling, or shadcn-svelte/Tailwind v4 migration tasks.

## Source Documents

- `docs/plans/2026-05-06-shadcn-svelte-tailwind-v4-ui-migration-rfc.md` is the controlling contract for shadcn-svelte and Tailwind v4 UI migration work.
- `docs/component-catalog.md` documents shared UI component props, CSS variables, utility classes, and usage patterns.
- Shared component source, `docs/component-catalog.md`, `components.json`, and `src/app.css` are the active references for shared component visuals, states, and variants.

## Route Migration Boundary

- Do not migrate production routes unless the task explicitly asks for route migration.
- During route migration, styling outside shadcn/shared components should be converted to Tailwind CSS and aligned with the shared component baseline.

## Visual Authority

- Shared components are visually authoritative. Route code consumes them; it does not restyle them.
- Route-level visual overrides are forbidden unless Robert explicitly approves that specific visual change.
- Visual changes belong in tokens (`src/app.css`, `components.json`, theme variables) or shared component source files under `src/lib/components/**`.
- Prove shared UI changes in shared component source and focused production migration slices before relying on them broadly.

## Allowed Route-Level Variation

- Route-level variation is behavioral only: data, labels, validation, permissions, filters, columns, actions, open/closed state, and similar interaction configuration.
- Behavioral changes must not affect other areas that consume the shared component.
- Stop and ask permission before wrapping a shared component for one route to change behavior.
- If a shared component does not fit a route, report the design-system gap and propose the shared component/API extension instead of patching the route locally.
