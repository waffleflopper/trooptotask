# Coding Standards

These are TroopToTask's current review standards. They are intentionally repo-specific and should be read alongside `AGENTS.md`, `docs/architecture/ARCHITECTURE.md`, `docs/architecture/MODULE_CONVENTIONS.md`, `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`, `docs/architecture/DEFINITION_OF_DONE.md`, and `docs/component-catalog.md`.

## Core Standards

- Prefer correctness, reliability, performance, and maintainability over short-term convenience.
- Keep changes tightly scoped to the requested issue or slice. Do not mix unrelated refactors into feature work.
- Preserve current v1 reality. Do not document or code desired future architecture as if it already exists.
- Use canonical v1 domain language: `Organization` and `Group`. Do not back-port v2 `Account`, `Unit`, or `Element` terminology into v1 code or docs unless the task is explicitly about migration mapping.
- Prefer Army/military-oriented wording in new UX copy and docs. Preserve legacy schema/API names only where compatibility requires them.
- Treat demo/sandbox code as deprecated. Do not expand it unless explicitly asked; if touched, preserve or add a clear deprecation note.

## TypeScript And Svelte

- Use TypeScript for app code and keep types as narrow as practical.
- Do not use `any`. Use `unknown` plus narrowing; if an exception is unavoidable, add a targeted ESLint disable with a reason.
- Prefer named exports for reusable helpers, types, and modules.
- Keep Svelte components focused on rendering, local UI state, event wiring, and feedback orchestration.
- Use Svelte 5 patterns already present in the repo. Do not introduce a different state-management style for one-off convenience.
- Keep derived calculations in focused helpers or feature-owned read models when components start re-deriving business-facing screen state.
- Avoid hidden global side effects. Browser persistence, downloads, and similar effects should sit behind small adapters.

## File Organization

- Route shells live under `src/routes/**`.
- Product feature modules live under `src/features/*`.
- Shared UI lives under `src/lib/components/**` and `src/lib/components/ui/**`.
- Server entities, ports, use cases, and adapters live under `src/lib/server/**`.
- Import feature code through `$features/feature-name/...` and shared code through `$lib/...`.
- Keep feature-specific components, contexts, stores, utilities, and types inside the owning feature module unless the behavior is truly shared.
- Do not create route-local wrapper components, helpers, or CSS when a suitable feature module or shared primitive already exists.

## Frontend And UI

- For UI work, follow `docs/component-catalog.md` and use the `impeccable` skill.
- Use shared UI primitives before building one-off controls.
- Authenticated workspaces should feel dense, clear, and operational rather than like a marketing dashboard.
- Do not redesign the app shell unless the task explicitly asks for shell work.
- Keep route toolbars inside the shared `Toolbar` family when applicable. Filters, search, toggles, and view modes are stateful controls; command actions belong in `ToolbarActions`.
- Use lucide icons where an icon exists. Prefer familiar icon buttons for tool actions, with accessible labels/tooltips where needed.
- Ensure UI text fits at mobile and desktop sizes. Controls should not resize unpredictably when labels, counts, hover states, or loading states change.
- Avoid generic purple-gradient AI styling, decorative blobs, and card-heavy layouts where the product calls for focused operational UI.
- Use semantic HTML and accessible labels for interactive controls.

## Server Architecture

- Prefer the app-owned backend path: entities for schema mapping and validation, use cases for business logic, ports for abstract dependencies, adapters for provider-specific behavior, and route wrappers for request/load glue.
- Keep SvelteKit route handlers and loads thin. Prefer existing wrappers such as `handle()`, `entityHandlers()`, and `loadWithContext()` when they fit.
- Do not add new direct `locals.supabase` business logic outside auth-provider edges, ports/adapters, or an explicitly approved remediation slice.
- Service-role Supabase usage must stay limited to appropriate platform, adapter, webhook, cleanup, audit, notification, or deprecated sandbox paths. Never use it as a shortcut for ordinary feature behavior.
- Do not run, reset, delete, or mutate local or remote database state outside the requested task. Remote migrations must be called out for the user to run before merge.

## Authorization And Permissions

- Organization membership is the v1 authorization anchor.
- Persisted membership roles are `owner`, `admin`, and `member`; UI presets are convenience labels, not durable auth roles.
- Do not invent partial-admin shapes or treat presets such as `Full Editor`, `Team Leader`, `Viewer`, or `Custom` as persisted domain roles.
- Each product feature should own its permission lane. Do not create new cross-feature permission piggybacking.
- Respect scope semantics. `Group` scope is a real access boundary; do not accidentally widen it in route data, client read models, exports, or bulk actions.
- If an unrelated task encounters authz, provider-boundary leaks, membership modeling, or scope-evaluation drift, document the seam and stop unless remediation is explicitly in scope.

## Data, Validation, And Errors

- Prefer schema-first validation and existing entity helpers for inbound and persisted data.
- Keep business rules out of formatting adapters and browser-only download helpers.
- Preserve auditability for sensitive flows such as membership, permissions, billing, exports, destructive operations, and admin actions.
- Prefer explicit error states and user-facing recovery paths over silent failure.
- Do not leak provider-specific error details into user-facing copy unless they are intentionally actionable.

## Testing

- Use `npm run test` for Vitest tests.
- Add or update the closest sensible tests when behavior changes.
- Prefer behavior-focused tests around the changed surface instead of broad snapshot churn.
- Cover permission, scope, provider-boundary, and persistence behavior when those contracts are touched.
- Use Playwright e2e tests only when the slice changes browser flows that Vitest cannot sensibly cover.
- Do not remove or weaken tests to make a change pass without explaining and replacing the lost coverage.

## Documentation And Governance

- Docs must separate current-state truth, intended guardrails, known drift, and deferred cleanup.
- Update architecture docs when a change affects architecture, authorization, provider ownership, canonical terminology, or tolerated drift.
- Update `docs/architecture/GOVERNANCE_BASELINE.json` when a slice adds, removes, or reclassifies tolerated provider leaks, permission couplings, or demo/sandbox exceptions.
- If a lasting architectural decision is created or changed, add or queue an ADR using the repo's ADR guidance.

## Required Verification

Before considering work complete, run the required repo checks unless there is a clear blocker:

- `npm run format`
- `npm run lint`
- `npm run governance:check`
- `npm run check`
- `npm run test`

If any required verification is skipped or cannot run, state the blocker clearly in the handoff.
