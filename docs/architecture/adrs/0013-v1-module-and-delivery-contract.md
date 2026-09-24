# ADR 0013: V1 Module And Delivery Contract

Status: Accepted
Date: 2026-09-23

## Context

The current SvelteKit app has `src/features/*` UI modules, central `src/lib/server` use cases/adapters, and page and JSON routes that often import private files directly. The [ownership ledger](../CURRENT_OWNERSHIP.md) assigns surviving capabilities, tables and permission lanes, but those assignments are not yet executable import restrictions. Phase 07 D01 must choose the module seam before D02 enforcement and D03's Personnel pilot.

## Decision

Keep `src/features/<owner>` as the module root. Each owner exposes only surfaces used by current callers: a narrow portable contract such as `contracts.ts`, a browser-safe web entrypoint such as `index.ts`, and privileged operations through `index.server.ts` or other `*.server.ts` files. Portable code contains no framework, browser, provider, raw-row or privileged dependency. Web code cannot import server code. Server operations keep feature policy and typed collaborators; current Supabase Auth, SQL/RLS and owner-held provider adapters retain their authority. `src/routes/**` composes pages, forms and existing JSON transport around those operations. Shared leaves cannot depend on product modules. Cross-owner calls use declared public seams in an acyclic graph.

The current `src/features/groups/` folder is a physical split of Personnel-owned Group UI, not another persisted-data or policy owner. D02 classifies that folder's real imports; 08-M04 moves its consumer into the Personnel owner root. No separate permanent Groups public contract is implied.

D02 will create one `scripts/module-boundaries.json` declaration and checker for module roots, dependencies and object ownership. The current ownership ledger remains the reviewable inventory; the two must agree. A partly migrated module needs no empty manifest, directory or export. D03 must place the one leader-note data contract under Personnel and make existing page, JSON and Svelte consumers use it. The [module conventions](../MODULE_CONVENTIONS.md#chosen-module-and-delivery-contract-07-01d) specify current response meanings, bounded persistence reads with complete legacy JSON results and test placement.

Cross-owner imports flow from composition to source-owned public seams; routes may compose multiple owners directly. Organization owns membership and a narrow member-label read consumed by Personnel's leader notes. Organization creation's later Personnel Group/rank and Calendar default seeding belongs in server-side delivery composition calling those source owners, not in a lasting Organization → Personnel/Calendar module import. This preserves the current Organization/owner RPC transaction and does not claim that subsequent seeds are atomic. Calendar may consume Personnel's scope contract; Personnel views compose Calendar facts at delivery. Organization and these feature owners may use Access Platform policy evaluation supplied with trusted membership/Group facts; Access Platform imports no product owner. Its intentional SQL membership reads and RLS relationships are documented separately from the acyclic **source-module import graph** that D02 checks. A source owner cannot import a composer merely to obtain a view, and neutral infrastructure cannot import product owners. The [module conventions](../MODULE_CONVENTIONS.md#chosen-module-and-delivery-contract-07-01d) record the full direction and current violations. D02 verifies this target against the actual graph while recording unfinished Phase 08 migrations.

## Alternatives Considered

- The parent issue's proposed `src/lib/modules/<feature>` tree with a `module.json` in every module would duplicate existing feature roots and create scaffolding before current consumers move. A single declaration is simpler during the staged migration.
- Retaining central use-case and entity files as permanent public owner interfaces would leave policy and table ownership split from the feature and preserve deep imports. They remain current placement only until their owning cutovers.
- Routing server page loads through the local JSON endpoint would add a request waterfall and duplicate transport work. Both adapters call the owned operation directly.

## Consequences

D01 records the target without claiming implementation. D02 proves dependency and privilege restrictions in the real source graph, including SvelteKit's recognized server-only paths. D03/Phase 08 move each authorized capability and all its consumers, then delete replaced internal paths. Current authentication, membership, stored identifiers and supported route behavior stay authoritative throughout. No future provider, native client, SDK or new general API is implied.

## Links

- [Phase 07 parent #1280](https://github.com/waffleflopper/trooptotask/issues/1280); [D01 #1335](https://github.com/waffleflopper/trooptotask/issues/1335)
- [Module conventions](../MODULE_CONVENTIONS.md#chosen-module-and-delivery-contract-07-01d)
- [Architecture](../ARCHITECTURE.md#current-state-truth); [trusted identity and access](../AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md#trusted-identity-and-access-contract-07-01c)
