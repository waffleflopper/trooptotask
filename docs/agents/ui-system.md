# UI System

Use this file for UI component work, shared styling, route UI changes, app-shell work, or shadcn-svelte/Tailwind v4 usage.

## Current-State Sources

- `docs/component-catalog.md` is the active shared UI reference. Use it for component APIs, composition rules, styling expectations, states, and known replacements.
- Shared UI source under `src/lib/components/ui/**` owns generated shadcn-svelte primitives and TroopToTask compound UI.
- Shared app and layout primitives under `src/lib/components/**` own product shell and reusable layout behavior.
- `src/app.css` and `components.json` own global Tailwind v4, shadcn-svelte, token, and generated-component configuration.
- `PRODUCT.md` and `DESIGN.md` describe the product and visual direction for design-heavy UI work.

## Default UI Rules

- Use shared UI primitives before building route-local controls.
- Shared components are visually authoritative. Route code consumes them; it does not restyle them.
- Visual changes belong in tokens, generated/shared component source, or documented shared component variants.
- Route-level visual overrides are forbidden unless Robert explicitly approves that specific visual change.
- Route-level variation is behavioral only: data, labels, validation, permissions, filters, columns, actions, state, and event handlers.
- If a shared component does not fit a route, report the design-system gap and propose the shared component/API extension instead of patching the route locally.
- Stop and ask permission before creating a route-specific wrapper around a shared component to change behavior.

## Route Work

- Do not migrate or redesign production routes unless the task explicitly asks for it.
- When route UI work is in scope, use Tailwind utility composition that matches the shared component baseline.
- Remove obsolete route-local CSS only when the route slice owns that surface and the shared replacement is already available.
- Keep business rules in feature modules, contexts, stores, server use cases, or shared services. Do not enforce important rules only through UI state.

## Current UI Foundation

- The active shared foundation is shadcn-svelte, Tailwind v4, and TroopToTask compound components.
- `components.json` records the implementation-time shadcn-svelte style and aliases.
- Dark mode currently uses `documentElement[data-theme]`; Tailwind v4 dark variants also support `.dark` for shadcn compatibility.
- Public marketing primitives live in `src/lib/components/public/**` and may have product-site-specific composition, but they should still avoid one-off route styling when a shared primitive exists.
