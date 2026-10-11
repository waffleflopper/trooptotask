# UI System

Use this file for UI component work, shared styling, route UI changes, app-shell work, or shadcn-svelte/Tailwind v4 usage.

## Current-State Sources

- The [component catalog index](../component-catalog.md#find-the-relevant-component) lists every shared family with its parts and production consumers. Read the foundation and relevant component sections.
- The [foundation provenance and family contract](../ui-foundation-provenance.md) records each primitive's provenance and retained deviations and the layer decisions D02 executed.
- `src/lib/components/ui/**` holds canonical primitives and central variants. `src/lib/components/patterns/**` holds shared neutral compositions such as page shell, workspace toolbar, report workspace and charts, bulk import and type management. `scripts/module-boundaries.json` enforces the direction: patterns may import `ui` and shared code, `ui` may not import patterns, and neither may import a feature.
- The app shell (sidebar navigation, header and `BannerStack`) lives in `src/features/app-shell`.
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

## Three-layer contract

Use `components/ui` for canonical primitives and centrally owned variants. Use `components/patterns` for a shared neutral composition when current consumers justify it. Keep feature workflows and domain-specific presentation with their feature owner. Move a component's imports together with it. Do not add a second primitive API or retain old-path re-exports.

The [family mapping](../ui-foundation-provenance.md#project-family-apis-and-target-layers) records where each family landed. Preserve a component's props, bindings, snippets and events unless the authorized work changes them. Authoritative validation, authorization and saved state remain in the owning feature/server operations.

## Current UI Foundation

- The active shared foundation is shadcn-svelte, Tailwind v4, and TroopToTask compound components.
- `components.json` selects Nova, Stone and the aliases. The CLI is not installed and the registry is not pinned. The provenance reference uses the immutable 1.2.7 registry tag for source comparison.
- `themeStore` is the only theme source. It sets `documentElement[data-theme]`, persists the `theme` key, and the `app.html` pre-paint script applies the same key before hydration. Tailwind's `dark:` variant and the dark token block select on `[data-theme='dark']` only. Sonner reads `themeStore.current`, so toasts follow the app selection rather than the system preference. `src/app.css` is the single token source; see the [token contract](../ui-foundation-provenance.md#token-and-theme-contract).
- Public marketing primitives live in `src/lib/components/public/**` and may have product-site-specific composition, but they should still avoid one-off route styling when a shared primitive exists.
