# Feature Organization

Use this file when adding or moving feature code.

## Path Aliases

- `$features/*` maps to `src/features/*`.
- `$lib/*` maps to `src/lib/*`.

## Feature Module Shape

- `src/features/<owner>/` is the chosen module root. Keep feature UI, client state, domain rules and server operations with the owner when a current consumer needs them; no directory or export is required solely to match a diagram.
- Domain-specific presentation belongs with its feature. Shared UI goes in `src/lib/components/ui/` for primitives or `src/lib/components/patterns/` for neutral compositions with real consumers; neither may import a feature.
- Import another owner's code only through its declared public portable, web or server seam. The `$features` alias resolves a path; it does not make a deep private import public.
- Keep privileged operations in SvelteKit-recognized `*.server.ts` files or `$lib/server`; a folder named `server/` under a feature is not a privilege boundary. Routes compose current page and JSON delivery around owned operations without calling their own endpoints over HTTP.
- Use the [module and delivery contract](../architecture/MODULE_CONVENTIONS.md#chosen-module-and-delivery-contract-07-01d) and [current ownership ledger](../architecture/CURRENT_OWNERSHIP.md) when moving code. Move every consumer with the code and delete the replaced path. `npm run governance:check` enforces the module boundaries.
