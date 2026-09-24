# Feature And Module Conventions

This document describes the conventions that fit the current v1 repo. It is intentionally specific to this codebase.

## Current-State Shape

- Route shells live under `src/routes/**`.
- Product feature modules live under `src/features/*`.
- Shared UI lives under `src/lib/components/**` and `src/lib/components/ui/**`.
- Server entities, ports, use cases, and adapters live under `src/lib/server/**`.

The codebase already trends toward:

- thin route shells
- feature-owned page views, contexts, stores, and utilities
- shared UI primitives instead of one-off shared markup
- use-case-based server logic

That trend is real, but not finished. Contributors should strengthen it instead of branching away from it.

For stabilization, apply the [program decisions](ARCHITECTURE.md#stabilization-decisions): each declared module or UI migration includes all affected consumers and deletion of replaced implementations, old-path wrappers, aliases and configuration. A migrated example component or a compatibility facade does not complete a cutover.

## Chosen module and delivery contract (07-01d)

This is the target for the existing SvelteKit application, not a description of an already enforced import graph. The [ownership ledger](CURRENT_OWNERSHIP.md) assigns today's capabilities and data even where their code still lives in routes or central server files. [ADR 0013](adrs/0013-v1-module-and-delivery-contract.md) records why the existing `src/features/<owner>` roots remain the module roots. Create or move files only with a consuming cutover; do not create empty entrypoints or directories.

The current `src/features/groups/` folder is a physical UI split of Personnel-owned Group behavior, not a separate policy or persisted-data owner. D02 must classify its existing imports in the real graph; 08-M04 moves its complete current consumer into the Personnel root. The owner contract remains one Personnel authority throughout.

| Surface  | Target seam and allowed dependencies                                                                                                                                                                                                                                                                                                                                                         | Current reason to exist                                                                                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portable | Owner-held `contracts.ts` or a similarly narrow explicit export under `src/features/<owner>/`. Plain data shapes, validation and pure rules may depend on domain-neutral leaves and declared portable exports of another owner. No Svelte/runes, `$app`, DOM/storage, provider SDK, raw database rows, Node-only code or credentials.                                                        | Personnel's leader-note shape is used by page data, JSON routes and Svelte views today. D03 must put its one authoritative representation under Personnel and make these actual consumers import it. Do not manufacture a contract for a future client. |
| Web      | Owner-held browser-safe `index.ts` and feature UI/state exports. They may use their own portable contracts, neutral UI primitives and declared public exports of another owner, but never a privileged module. A web barrel may export Svelte code and is **not** a portable entrypoint.                                                                                                     | Existing Personnel detail and notes views and their draft/fetch logic are web consumers. Other feature UI must not reach foreign mutable stores or private files.                                                                                       |
| Server   | Owner-held `index.server.ts` (and other `*.server.ts` files where needed) exposes authorized operations to server routes and declared server collaborators. Implementation may use owner-held typed ports and provider adapters, shared trusted-access infrastructure and owned SQL; it does not export a raw provider client, universal request context or arbitrary table/query interface. | Current leader-note operations are in `src/lib/server/core/useCases/personnelLeaderNotes.ts`; the page loads and JSON handlers call them directly. D03 moves this seam and D03/07-04 cuts over every current caller before deleting the replaced path.  |

`src/routes/**` owns SvelteKit page, form and JSON transport composition; `src/hooks.server.ts` owns request admission. Server loads and `+server.ts` handlers establish the trusted actor and requested Organization/resource access, then invoke the same owner operation directly. Server-rendered routes do not call their own JSON endpoints over HTTP. Browser code uses authorized page data or the existing JSON routes for interactions. Routes may import an owner's public web, portable or server seam appropriate to their execution context, but cannot treat a deep private feature file as public merely because it is reachable. Shared UI/utilities and provider infrastructure are leaves or lower-level collaborators; they do not import product modules. Cross-owner dependencies must be declared, point only to the other owner's public seam and form an acyclic graph. The source owner retains policy and mapping; a dashboard or report may compose its reads without taking over its tables or mutable stores.

The following **target public source-module import graph** covers every logical owner in the ledger. It is a design decision for D02 to declare and check, not a claim that current imports comply. An arrow means a permitted direct dependency on a consumed public seam; dependencies are not transitively public. Account Preferences is part of Identity, Groups/rank catalog is part of Personnel, and Provider Storage Access/shared database mechanics are named responsibilities within Provider Infrastructure, not additional product modules.

| Owner                                                                                           | Additional permitted owner dependencies and current reason                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared Utilities                                                                                | None; domain-neutral leaves only.                                                                                                                                                                                                                                                   |
| Web UI Foundation                                                                               | Shared Utilities; neutral web primitives/state.                                                                                                                                                                                                                                     |
| Provider Infrastructure                                                                         | Shared Utilities; connection, storage transport/configuration and database mechanics. No product imports.                                                                                                                                                                           |
| Access Platform                                                                                 | Shared Utilities, Provider Infrastructure; trusted-fact evaluation and throttling. No product imports; request composition supplies membership/scope facts.                                                                                                                         |
| Audit                                                                                           | Access Platform, Provider Infrastructure, Shared Utilities; authorized recording, safe reads and retention. No imports from event producers.                                                                                                                                        |
| Identity / Account Preferences                                                                  | Access Platform, Audit; admission, setup/recovery and self-policy. Auth email/outbox delivery stays Identity-owned, not an in-app Notifications dependency.                                                                                                                         |
| Notifications                                                                                   | Identity, Access Platform, Audit; self-policy and notification/dismissal delivery. Receives recipient facts; no Organization or Platform Administration import.                                                                                                                     |
| Organization                                                                                    | Identity, Notifications, Access Platform, Audit; account lookup/setup, membership/invitation policy and membership-change notifications.                                                                                                                                            |
| Personnel / Groups / rank catalog                                                               | Organization, Access Platform, Audit; member-label reads and scoped records. No Calendar or Resource Deletion Requests import.                                                                                                                                                      |
| Calendar                                                                                        | Personnel, Access Platform, Audit; roster scope and Calendar policy.                                                                                                                                                                                                                |
| Sign-in Rosters                                                                                 | Personnel, Access Platform, Audit; rank/roster scope. Its current Training capability is evaluated from trusted grants by Access Platform; no Training module import.                                                                                                               |
| Training                                                                                        | Personnel, Sign-in Rosters, Access Platform, Audit; roster/rank reads and the roster modal workflow.                                                                                                                                                                                |
| Critical Tasks                                                                                  | Personnel, Access Platform, Audit; roster scope and its own permission lane.                                                                                                                                                                                                        |
| Onboarding                                                                                      | Personnel, Training, Notifications, Access Platform, Audit; roster/training lookup, Personnel creation and progress/expiry notifications.                                                                                                                                           |
| Rating Scheme                                                                                   | Personnel, Access Platform, Audit; roster scope and rating policy.                                                                                                                                                                                                                  |
| Resource Deletion Requests                                                                      | Identity, Organization, Personnel, Training, Rating Scheme, Notifications, Access Platform, Audit; requester/reviewer policy and source-owned approved effects.                                                                                                                     |
| Dashboard                                                                                       | Organization, Personnel, Calendar, Training, Onboarding, Rating Scheme, Access Platform; composed source reads, without ownership of source policy.                                                                                                                                 |
| Feedback                                                                                        | Organization; admitted submitter facts come from delivery; Organization supplies context for feedback submission/support projections.                                                                                                                                               |
| Platform Administration                                                                         | Identity, Organization, Personnel, Audit, Notifications, Feedback, Access Platform; privileged support projections/commands, announcement content and feedback review. Source owners keep their rules.                                                                              |
| Data Export                                                                                     | Identity, Organization, Resource Deletion Requests, Personnel, Calendar, Training, Critical Tasks, Onboarding, Rating Scheme, Sign-in Rosters, Dashboard, Audit, Notifications, Feedback, Access Platform; the current manifest's source-owned export reads plus its own lifecycle. |
| Scheduled Maintenance                                                                           | Identity, Organization, Personnel, Calendar, Critical Tasks, Onboarding, Audit, Notifications, Access Platform; the four configured cleanup routes and source-owned retention effects.                                                                                              |
| App Shell                                                                                       | Identity, Organization, Personnel, Dashboard, Platform Administration, Notifications, Access Platform; navigation, roster/setup support and announcement composition.                                                                                                               |
| Public Web                                                                                      | Identity, Web UI Foundation, Shared Utilities; reviewed-access presentation and public pages.                                                                                                                                                                                       |
| Delivery composition (`src/routes/**`, request setup and their server-only composition helpers) | All owners above through the appropriate public seam; assembles current pages, commands and scheduled adapters. No owner imports delivery composition.                                                                                                                              |

In addition to the table, each product/operational owner's **server adapter** may consume Provider Infrastructure and Shared Utilities, and its **web surface** may consume Web UI Foundation and Shared Utilities. These lower-level edges do not permit portable/web code to import privileged code. An unused edge is not a reason to create an export. D02 must classify each current file under exactly one logical owner and record nonconforming imports as unfinished owning cutovers; neither broad directory globs nor injected collaborators exempt code from scanning.

**Deletion-request cycle decision.** Today Personnel UI imports `lib/utils/deletionRequests.ts`, and `personnel.ts` bulk archive calls `createDeletionRequest` when `manageRecords` allows the person but `archiveRecords` denies with `denied:missing-capability`. The request workflow in turn calls Personnel's owned-artifact archive effect and writes Training/Rating Scheme resources. In the target, server delivery composition owns the bulk result aggregation: it calls Personnel's authorized per-record archive/eligibility operation and, only for the same eligible missing-capability outcome, calls Resource Deletion Requests. Preserve denied Group scope, both policy checks, `approvalRequestedIds`, already-pending 409 handling and per-record failures. Source UI receives a delivery-owned request callback instead of importing the request client. Resource Deletion Requests consumes source-owned approved effects; those effect operations retain the authorized review context and do not reimpose the ordinary requester's direct-archive permission. Preserve approval's current source-effect-before-request-status ordering; it is not an atomic transaction today. The full request-workflow cutover belongs to 08-M02 with source consumers in 08-M04/07/10. D03 only migrates the note effect consumed by this still-live workflow and must not claim the entire cycle repaired.

**Notification cycle decision.** Organization owns administrator-recipient membership selection; Notifications owns delivery to resolved recipients and self/dismissal policy. Current `server/notifications.ts` and `retentionSupport.ts` read Organization memberships for `notifyAdmins`, while Organization commands call Notifications. During their owning cutovers, Organization/delivery supplies recipient IDs (or a narrowly typed, composition-bound recipient lookup); Notifications imports no Organization owner and does not gain a generic store to rediscover recipients. Caller-owned callback types keep this wiring explicit, with no service locator or hidden reverse import. Platform announcement reads and user dismissal state are composed at delivery; Notifications does not import Platform Administration. Platform Administration's invitation-origin projection (`platformAccessRequestAdministration.ts`, `supabasePlatformAccessRequestAdministration.ts`) consumes Organization facts through the declared Platform Administration → Organization direction; its existing cross-owner SQL transaction retains its authority.

**Audit enrichment decision.** Current `auditLogQuery.ts` reads Organization actor emails and Personnel/Training/Calendar labels. Audit owns safe event recording/query and masking; audit delivery composition supplies source-owned label reads and composes the display result, preserving current UUID stripping and email/label disclosure rules. Producers may import Audit, but Audit must not import those producers. Access Platform's injected audit sink is supplied by composition under its own narrow collaborator type; it does not introduce an Access Platform → Audit import that cycles with Audit → Access Platform. These cuts belong to 08-M13/15 and keep actual code/SQL dependencies visible until completed.

Today `orgProvisioning.ts` imports Personnel rank seeds and Calendar holidays, while `supabaseOrgProvisioning.ts` writes Personnel Group/rank and Calendar defaults after the Organization-and-owner RPC. The target Organization operation keeps the atomic Organization/owner transition; server-side creation composition calls Personnel- and Calendar-owned default-seeding operations after it. Those later steps are **not** part of that RPC transaction today, and this contract does not make them atomic. Organization member management stores Group-scope IDs, while Personnel owns the Group catalog; the IDs alone do not make Organization a Personnel-module consumer. Delivery composition can obtain Group choices without moving membership policy or trusting browser state. Personnel's current shared artifact helper reads `organization_memberships` directly for contributor labels. D03 cuts the leader-note path over to the narrow Organization read above; counseling, documents and follow-ups still use that helper until their complete 08-M04 cutovers. D03 must not delete or claim to replace their still-used path. These current imports/reads are unfinished implementation work, not part of D02's accepted graph.

Access Platform owns common policy evaluation, not Organization memberships or Personnel Groups. Its TypeScript evaluator receives trusted membership/Group-scope facts supplied by request composition and does not import either product owner. Its existing SQL `member_access_*` helpers intentionally read Organization membership facts and participate in feature RLS; those database dependencies and current grants remain authoritative and are recorded in the ownership ledger. D02's acyclicity rule applies to declared module imports, while SQL/table/function relationships receive their separate owner and security review. Shared UI/utilities and provider connection mechanics remain lower-level collaborators and cannot import product owners. D02 must reject source-module cycles without hiding current violations or treating SQL cross-references as permission to import foreign internals.

SvelteKit recognizes `.server.ts` and `$lib/server` as server-only, including transitive imports; an arbitrary `server/` or `infrastructure/` directory under `src/features` does **not** provide that protection. Current feature `server/*.ts` files therefore remain a known placement gap until their owning cutovers. The D02 governance rule and production build must check the route/client/portable import paths as well as owner dependencies; Vitest alone does not prove this restriction. See the [SvelteKit server-only module contract](https://svelte.dev/docs/kit/server-only-modules).

Use one machine-readable declaration at `scripts/module-boundaries.json` for D02's module roots, permitted public dependencies and object ownership instead of one manifest per partly migrated module. The ledger remains the human-readable inventory and must agree with that declaration. D02 creates the declaration and checker together; its absence today is unfinished enforcement, not an exception or a passing gate. Do not change the current alias or create speculative packages to achieve this layout.

### Current JSON and page contract to preserve in the Personnel pilot

The existing `leader-notes` GET returns an array of `PersonnelLeaderNote`; POST and PATCH return one note; DELETE returns `{ success: true }`. The same note is present in Personnel detail/notes page data and the archived-artifact union. Its `id` and `personnelId` are the current stored identifiers as strings; `date` is a `YYYY-MM-DD` date-only string derived from `createdAt`, `createdAt` and non-null `archivedAt` are timestamp strings, and `archivedAt: null` means active. `author` normally resolves from the Organization membership to a display label. If no membership label resolves, the mapper returns the stored author unchanged: this can be an auth-user UUID or historical literal text. A null or empty author maps to `Unknown leader`; a membership row with no display fields also falls back to its user UUID. D03 preserves this current authorized response behavior; masking or changing the fallback needs a separate product/security decision. Preserve these names and null meanings, the existing archive/restore actions and input text limit of 4,000 characters. The feature's portable shape describes these JSON values directly; it must not rely on SvelteKit page serialization or raw SQL row types.

**Current errors and lifecycle, retained by D03:** the explicit invalid-text, missing/mismatched route-ID and unsupported-action checks return 400; missing admitted identity returns 401; denied feature/Group policy returns 403; an absent scoped person/note returns 404. Before route dispatch, Organization admission returns 403 for suspension, 404 for an absent/inaccessible Organization and 503 when its status cannot be verified (`hooks.server.ts`, `supabaseOrganizationAdmission.ts`). Archive of an already archived note and deletion of an active note return 409. Restore has no archived-state precondition: restoring an already active note succeeds, writes `archived_at: null` and emits the restore audit event. Malformed JSON on POST/PATCH currently throws from their custom `parseInput` and becomes sanitized **500**, bypassing `httpAdapter.ts`'s default-parser 400 catch. POST with a JSON `null` body also returns 500 when its parser accesses body properties. These are known transport defects, not a recommended error design; D03 preserves it in this bounded migration rather than silently introducing a response change. Unexpected failures also return sanitized 500. These route outcomes remain subject to the existing hook admission/rate-limit responses; this list does not replace the hook's auth/MFA/recovery or throttling contract. Missing fields must not silently acquire new public meanings.

**Current collection behavior versus the D03 change:** note lists have no explicit application limit except the detail card's single-note read, but `supabaseDataStore.findMany` already issues offset pages of 1,000 rows. Ordering is only `created_at DESC`; equal timestamps spanning pages can duplicate or omit notes. Thus GET's intended complete-array meaning is not proof of complete traversal today. D03 deliberately fixes that ordering/traversal defect with stable cursor pages of at most 100 notes per persistence read, ordered by `created_at DESC, id DESC`. On an unchanged dataset with tied timestamps, every row must appear exactly once; concurrent mutations are not promised snapshot isolation. Page and archived-artifact consumers must reach every note. Existing JSON GET without paging retains the complete-array response shape, with bounded reads/label lookups internally; an opt-in cursor on that same route may return one bounded array with continuation. A large legacy JSON response remains a known cost, not a performance improvement claim. Cursor parameters/continuation headers and meaningful traversal tests belong to D03. Binary document uploads/downloads remain outside this note contract.

**Required reverse-consumer cutover before deleting the old note path:**

- Detail/notes page loads, existing JSON endpoints, Svelte views and the archived-artifact union consume the Personnel-owned note contract and authorized operations.
- `PERSONNEL_LEADER_NOTE_SPEC.ownedArchive` feeds `personnelOwnedArchiveSpecs()` and `archivePersonnelOwnedArtifacts`/`restorePersonnelOwnedArtifacts`. Callers are Personnel single archive, bulk archive and restore (`personnel.ts`), plus Resource Deletion Requests approval (`deletionRequests.ts`). D03 must migrate this note cascade before removing its old registration. Archive only currently active notes, keep earlier archive timestamps intact, and restore only notes whose archive timestamp matches the parent's archived timestamp. Keep the other artifact families' still-live registrations/helper until 08-M04. Existing `personnelArchivedArtifacts.test.ts`, `personnel.test.ts` and `deletionRequests.test.ts` protect these lifecycle outcomes and must survive the cutover at their stable boundaries.
- Data Export's `organizationDataExportManifest.ts` reads actual `leader_notes` rows for its JSON section and workbook sheets; Scheduled Maintenance's `archiveRetention.ts` deletes expired archived notes. Preserve these distinct authorized export/retention meanings through Personnel-owned source operations; neither uses the page DTO. The source owner retains retention policy while Maintenance owns dispatch.
- Separately, `personnelExport.ts`'s optional Personnel Info “Leader Notes” row and `organizationDataExportManifest.ts`'s Personnel-sheet `leader_notes` field read `personnel_extended_info.leader_notes`, dropped by `20260515000100_create_leader_notes.sql`. They are blank in the verified target, not current note exports. D03 removes these obsolete property reads and explicitly retains their existing blank output shape (including the individual workbook row's extended-info condition). Do not populate them from sensitive note text, recreate the dropped column or add a compatibility mapper. Actual note exports remain the separate source above; removing these visible blank fields would be a distinct export contract change.

D03's acceptance includes each named caller, authorization/denied scope, archive/restore effects, both export meanings, retention, exact transport behavior and tied-timestamp traversal. This complete map governs deletion of the replaced note implementation; a passing note-page test alone is insufficient.

Colocate behavior tests with the owner operation and web interaction they exercise. Keep route admission/HTTP mapping tests with routes and SQL/RLS contracts under `supabase/tests`; D02's import-rule fixtures belong beside its checker. Test each rule at its cheapest stable interface, with real admission and SQL proof separate from synthetic actor tests. Do not duplicate source definitions as test expectations or use documentation checks as implementation proof.

## Frontend Conventions

### Route shells

- Prefer route files that mainly:
  - gather route data
  - wire feature contexts
  - render feature page views
  - coordinate streaming or hydration concerns
- Avoid turning route files into the long-term home for feature orchestration or business rules.

### Feature modules

Within `src/features/*`, prefer this shape when it fits:

- `components/` for feature UI
- `contexts/` for page-level orchestration
- `stores/` for feature state containers
- `utils/` for focused calculations or transformations
- feature types near the feature root

Keep feature-specific logic inside the feature module unless it is truly shared across multiple features.

### Shared UI

- Use shared UI primitives before building new one-off controls.
- Keep generic shared UI in `$lib/components/ui/*`.
- Keep layout or shell primitives in `$lib/components/*`.
- Keep public marketing primitives in `$lib/components/public/*`.
- Follow `docs/component-catalog.md` for shared UI usage and styling expectations.
- The current UI foundation is shadcn-svelte, Tailwind v4, and TroopToTask compound components. Shared components own appearance; route-level changes are behavioral only.
- Visual changes happen in tokens, generated/shared component source, or documented shared component variants. Resolve component fit gaps within authorized UI work through shared APIs and affected consumers, following the [UI contract](../agents/ui-system.md).
- When production routes are explicitly migrated or revised, replace obsolete route CSS with Tailwind utility composition that matches the shared baseline instead of preserving route-specific legacy visuals.

### Contexts and stores

- Page contexts are valid in v1, but they should not silently become god objects.
- If a context starts to own too many unrelated concerns, that is a signal to deepen module boundaries rather than keep stuffing logic into it.
- Prefer pushing stable calculations and business rules into smaller modules with thinner public interfaces.
- The `Roster Read Model` currently sits under `$lib/stores` and `$lib/server/core/useCases/rosterReadModel.ts` because Calendar, Training, Dashboard, Onboarding, Rating Scheme, settings archives and shell hydration read the same Organization roster. The [ownership ledger](CURRENT_OWNERSHIP.md) assigns this retained read contract to Personnel; shared placement does not make its policy ownerless. Its current `full`/`scoped` and `active`/`archived`/`all` meanings remain in [Roster Read Model](ROSTER_READ_MODEL.md) until the owning consumer cutover.

### Client read models

For orchestration-heavy frontend pages, prefer a feature-owned client read model when a context or tab component starts combining many hydrated stores, route payloads, grouping preferences, formatting rules, and display-row calculations.

A client read model should:

- live inside the owning feature module
- consume already-authorized route data and hydrated stores
- expose pre-shaped view data for the page or tab components
- keep browser persistence behind tiny local adapters when needed
- preserve route, provider, and authorization boundaries

This pattern is appropriate for dashboard-style surfaces where components should mostly render stable rows, counts, sections, and labels instead of re-deriving business-facing screen state. It is not a reason to move provider access or route permissions into frontend modules.

`CalendarRangeCoordinator` owns calendar range expansion, request de-duping, range-store merging and retry state. Its former computed duty event merging is removed; ordinary Calendar behavior and persisted facts in R6 remain.

Phases 05–06 removed Duty Roster generation, Calendar event hydration, computed overlays, manual conflict/provenance handling, remaining application consumers and active-schema Duty objects. Calendar assignment responses retain ordinary facts and metadata without duty provenance. Historical migration text remains provenance; it is not a reason to restore duty hydration.

## Server Conventions

### Default path

Current server code commonly follows this sequence, with central placement still to be cut over where it belongs to a feature:

1. entities for schema mapping and validation
2. use cases for business logic
3. ports for abstract dependencies
4. adapters for provider-specific behavior
5. route wrappers for request/load glue

For new or migrated feature work, put the owner operation behind its server-only seam above. Reuse retained entity mapping, typed ports, provider adapters and route wrappers without adding a second central public path.

### Route handlers and loads

- Prefer `handle()`, `entityHandlers()`, and `loadWithContext()` / streaming workspace loaders when they fit.
- Avoid ad hoc request parsing, permission checking, and persistence logic inside route files when an existing wrapper or use-case path already exists.

### Provider access

- Treat route-level direct provider usage as tolerated legacy, not the default pattern.
- Auth-specific provider calls remain acceptable where they are genuinely auth-provider-specific.
- Outside auth, new business logic should prefer use cases and adapters.

## Performance

Keep common workflows responsive as an Organization's data grows. Inspect the actual loading path before optimizing: avoid serial waits for independent requests, repeated queries per row, unnecessary payloads and repeated full-list calculations. A linear pass over a bounded collection can be the simplest efficient implementation.

Use optimistic updates when failure can be rolled back clearly and the operation's consequences allow it. Keep server authorization authoritative. Consider prefetching on hover or focus when it reduces likely navigation waits without excessive requests or crossing access boundaries. Keep optional data from blocking useful content and provide clear pending, success and failure feedback.

Reuse the existing data and state mechanisms. Add caching, background work or another abstraction only for an observed need, with explicit invalidation and failure behavior. For performance claims or dedicated optimization work, follow the [performance evidence contract](DEFINITION_OF_DONE.md#reproducible-performance-evidence).

## Deepening Guidance

The v1 repo has several large orchestration-heavy modules. Those are not failures to hide; they are candidates for deliberate module-deepening work.

Use explicit architecture-review work when a slice is intended to:

- shrink a broad interface
- hide coordination complexity behind a smaller public API
- reduce file-jumping to understand one concept
- replace shallow helper sprawl with a deeper module boundary

Keep deepening work within the requested boundary and finish its consumer cutover. Use an available module-design skill when useful; ordinary fixes do not require a separate architecture workflow.

## Current Hotspots

The following areas are especially likely to benefit from deepening rather than surface-level cleanup:

- calendar contexts, range loading, and page orchestration
- dashboard bootstrapping and context orchestration
- personnel page orchestration and bulk flows
- training reports and applicability flows
- organization settings and membership-management flows

## Conventions For Drift

- If current code and desired architecture disagree, record the disagreement and bounded remediation in the stabilization queue.
- Do not normalize a contradiction into precedent just because it already exists.
- Complete every seam required by the authorized cutover. Record unrelated discoveries for their owning tasks; do not use drift documentation to close an unfinished migration.
