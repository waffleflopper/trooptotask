# Architecture

TroopToTask v1 is one SvelteKit application backed by Supabase. **Organization** is the tenancy and workspace boundary; **Group** subdivides its roster and scopes restricted access. [Authorization and provider boundaries](AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md) owns the security contract.

## Stabilization decisions

- Billing and the retired Duty Roster (templates, runs and the `duty_*` tables) are removed end to end. Do not add plan, tier, quota or commercial gates, billing scaffolding, roster templates or runs, or a roster entity separate from the assignment type. Calendar availability, special days, types and persisted daily assignments, Personnel Duty Role (`clinicRole`) and Sign-in Rosters remain.
- A duty roster is a set of settings on a person-assigned assignment type, owned by Calendar ([#1723](https://github.com/waffleflopper/trooptotask/issues/1723)). Counts are derived from assignments and statuses by `src/features/calendar/roster`, which owns the count engine, never stored for an open DA 6 form. Starting numbers typed from a paper DA 6 change only through the server's roster write path, and only until the first detail on the form is served.
- A persisted daily assignment keeps one slot per Organization, assignment type and date, with a Person or Group assignee. Manual edits, exports and audit behavior stay.
- Retention windows, export lifecycle and audit, file size limits and batch bounds are safety limits, not entitlements.
- There is no repository browser-test suite and no runtime test bypass. Real user journeys are verified with [verify-trooptotask](../../.agents/skills/verify-trooptotask/SKILL.md).
- A migration or cutover is finished only when every consumer moves and the replaced code, wrappers, aliases and configuration are deleted. Compatibility facades and partial migrations are not completion.

## Modules and delivery

Each product owner lives under `src/features/<owner>/` and exposes up to three public seams:

- **Portable:** `contracts.ts`, the owner's only portable entrypoint. Plain data shapes, validation and pure rules. No Svelte, `$app`, browser globals, provider SDKs, raw database rows, Node-only code or UI.
- **Web:** `index.ts`. Browser-safe UI and client state. Never imports privileged code.
- **Server:** `index.server.ts` and other `*.server.ts` files. Authorized operations for routes and declared server collaborators. No raw provider client, universal request context or arbitrary query interface leaves the owner.

A folder named `server/` is not a privilege boundary; only SvelteKit's `*.server.ts` and `$lib/server` rules are. Shared primitives live in `src/lib/components/ui`, shared neutral compositions in `src/lib/components/patterns`, and neither imports a feature.

Import another owner only through its public seam. Cross-owner dependencies are declared in `scripts/module-boundaries.json` and must stay acyclic. `npm run governance:check` enforces ownership, seams, cycles, privileged imports, the UI foundation rules, route provider access and permission-lane coupling, and fails on any finding. There is no exception file: do not add allowlists, exceptions or manifest declarations to make a violation pass. Treat a change to `module-boundaries.json` as a policy change.

`src/routes/**` composes delivery. `src/hooks.server.ts` admits the request; loads and `+server.ts` handlers check the actor and the requested Organization and resource, then call the owner operation directly. Routes never call their own JSON endpoints over HTTP and never use a Supabase or admin client directly. Delivery adapters bind provider-backed ports after authorization.

## Not precedent

- Provider access from route or business logic instead of an owner's port.
- Service-role access for ordinary feature logic.
- A feature permission borrowing another feature's lane.
- Clinic-era names in new domain language; use **Duty Role** for `clinicRole` ([ADR 0006](adrs/0006-legacy-terminology-compatibility-policy.md)).
- Treating Settings presets (`Viewer`, `Operator`, `Editor`) as persisted roles.
- Cookie-driven authorization or Organization-shell bypasses.

## Performance

Keep common workflows responsive as an Organization's data grows. Inspect the actual loading path before optimizing: avoid serial waits for independent requests, repeated queries per row, unnecessary payloads and repeated full-list calculations. A linear pass over a bounded collection can be the simplest efficient implementation.

Use optimistic updates when failure can be rolled back clearly. Keep server authorization authoritative. Keep optional data from blocking useful content, and give clear pending, success and failure feedback.

Reuse the existing data and state mechanisms. Add caching, background work or another abstraction only for an observed need, with explicit invalidation and failure behavior. Review a change on a measured journey's path against the [regression budgets](DEFINITION_OF_DONE.md#regression-budgets). Measure only when Robert asks.
