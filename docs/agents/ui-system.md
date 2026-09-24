# UI System

Use this file for UI component work, shared styling, route UI changes, app-shell work, or shadcn-svelte/Tailwind v4 usage.

## Current-State Sources

- The [component catalog index](../component-catalog.md#find-the-relevant-component) routes to shared APIs, states and known replacements. Read the foundation and relevant component sections.
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
- For a component fit gap within authorized UI work, implement the smallest shared API extension and update its consumers and catalog. Preserve existing consumer behavior.
- Feature-owned behavioral composition can use existing primitives within the requested scope. Keep visual ownership shared and avoid duplicate primitive APIs or compatibility wrappers. Ordinary behavioral composition and shared API extensions do not need renewed approval when already authorized.
- The component system is web-specific. Feature owners compose Svelte views and scoped client state around shared primitives; a shared primitive does not own feature policy, persisted data or another feature's mutable store. Keep responsive web behavior and the existing accessible interaction contract. No native or universal component API is implied by the module's portable data contract.

This guide owns the visual and composition policy; the catalog owns component usage. Document reusable variants there and verify affected consumers when changing a shared API or appearance.

## Route Work

- Do not migrate or redesign production routes unless the task explicitly asks for it.
- When route UI work is in scope, use Tailwind utility composition that matches the shared component baseline.
- Remove obsolete route-local CSS only when the route slice owns that surface and the shared replacement is already available.
- Keep business rules in owner-held feature operations or domain rules, using retained central use cases only until their owning cutover. Contexts and stores support presentation; they do not authorize operations or become a second home for feature policy. Do not enforce important rules only through UI state.

## Consistent screens and interactions

Before building a screen, find the nearest page family and reuse its navigation, header, content width, grouping, forms, action placement and save/error behavior. For example, settings pages should use one settings composition and feedback pattern. Carry the approved design into shared tokens and components; confirmed behavior takes precedence over limitations in an older mockup.

When no suitable pattern exists, use the direction already authorized to establish the smallest reusable composition and document its intended use. If the visual direction is consequential and unsettled, ask Robert whether to prototype, use a supplied direction or research comparable products. Continue independent work while that decision is pending.

Use accessible shared controls, dialogs and menus. Preserve labels, keyboard/focus behavior, loading/empty/error states and save feedback. Inspect the rendered interaction against an analogous screen at narrow and wide widths, with long and short dynamic content. Use wrapping, truncation or overflow intentionally so content remains usable; a cosmetic adjustment alone does not require a new runtime test. Follow the [testing strategy](../architecture/TESTING.md) for uncovered interaction or accessibility behavior.

## Current UI Foundation

- The active shared foundation is shadcn-svelte, Tailwind v4, and TroopToTask compound components.
- `components.json` records the implementation-time shadcn-svelte style and aliases.
- Dark mode currently uses `documentElement[data-theme]`; Tailwind v4 dark variants also support `.dark` for shadcn compatibility.
- Public marketing primitives live in `src/lib/components/public/**` and may have product-site-specific composition, but they should still avoid one-off route styling when a shared primitive exists.
