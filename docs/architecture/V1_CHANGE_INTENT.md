# V1 Change Intent

Use this file when the current v1 implementation is real enough to document, but clearly not the system we want to preserve long-term.

This is the repo's place to capture:

- current-state truth
- why that truth is unsatisfying
- intended v1 direction
- open questions that still need a `grill-me` session

## How To Use This File

- Do not rewrite current-state docs to match desired future architecture.
- Instead, keep current-state docs honest and record the desired direction here.
- When a future slice is explicitly about remediation, use the entries here to shape the next planning or grilling session.

## Reusable `grill-me` Prompt

```md
Use:
- grill-me
- improve-codebase-architecture
- ubiquitous-language

Read:
- AGENTS.md
- docs/architecture/ARCHITECTURE.md
- docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md
- docs/architecture/MODULE_CONVENTIONS.md
- docs/architecture/DRIFT_LEDGER.md
- docs/architecture/V1_CHANGE_INTENT.md
- UBIQUITOUS_LANGUAGE.md

Goal:
Review the selected v1 drift entries and design an explicit remediation slice.

Requirements:
1. Summarize current-state truth first.
2. Separate current-state truth from intended direction.
3. Ask one `grill-me` question at a time.
4. Do not infer product or architecture intent from implementation alone when the code is contradictory.
5. If the slice affects authz, provider boundaries, or canonical language, update the relevant docs and ledgers.

Focus entries:
- [list ledger IDs here]
```

## Entry Template

```md
## C-XX Short Name

- Current-state truth:
- Why this is unsatisfying:
- Intended v1 direction:
- Constraints to preserve:
- Open questions:
- Suggested next skill or planning mode:
```

## Current Entries

## C-01 Authorization Replacement

- Current-state truth:
  - v1 authorization is membership-role plus boolean permissions plus optional group scope
  - `owner`, `admin`, and `member` are the persisted organization roles
  - current UI presets are convenience shapes over booleans and optional single-group scope
  - current scoped access storage/runtime is still single-group via `scoped_group_id`
- Why this is unsatisfying:
  - it is coarse, harder to audit cleanly, and forces adjacent features to borrow permission lanes
  - it encourages reverse-engineered labels instead of durable access concepts
  - it creates pressure toward hidden partial-admin patterns instead of explicit governance rules
- Intended v1 direction:
  - keep `owner`, `admin`, and `member` as the fixed organization-governance roles
  - keep `admin` as a fixed high-trust role below `owner`, not a decomposable member preset
  - model member access as an assigned preset plus a per-lane capability map, shared scope set, and explicit policy overlays
  - use `Viewer`, `Operator`, and `Editor` as the starter member presets
  - use per-lane capability levels of `none`, `view`, `operate`, and `configure`
  - make shared member scope target `organization-wide` or `1..n` groups, without allowing per-feature scope matrices
  - keep governance actions such as member management, org settings, and billing with `admin` / `owner`, while ownership transfer and destructive org-danger operations stay `owner`-only
- Constraints to preserve:
  - v1 data model reality
  - existing organizations and memberships
  - current route and feature surface availability
  - the first implementation wave may preserve current single-group compatibility while the storage and RLS migration lands later
  - `Leader's Book` remains a documented transitional compatibility lane while remake decisions are still pending
- Open questions:
  - exact per-feature mapping of `operate` versus `configure`
  - exact migration shape from current booleans into the replacement capability map
  - exact storage and RLS rollout for true multi-group scope
- Suggested next skill or planning mode:
  - `adr-from-retrofit-decision` then `tdd` for staged implementation slices

## C-02 Provider Boundary Hardening

- Current-state truth:
  - many business paths already use use cases and adapters, but route-level `locals.supabase` logic still exists in important seams
  - org settings rename, ownership transfer, and delete now run behind an app-owned use case and Supabase adapter
  - billing organization-state reads and writes plus the shared export-record lifecycle now run through app-owned store-backed helpers in `#619`
  - billing cancellation now documents the two-phase provider reality by treating post-Stripe local reset failures as deferred reconciliation through the Stripe deleted-subscription webhook in `#637`
  - several admin/platform routes remain route-local drift
- Why this is unsatisfying:
  - provider swap blast radius is still too large
- Intended v1 direction:
  - business logic outside auth and adapters should not depend on provider query APIs
- Constraints to preserve:
  - current auth-provider integration
  - working production flows
- Open questions:
  - which remaining route clusters should move first after admin/platform operations
  - what intermediate adapter shapes make the migration safest
- Suggested next skill or planning mode:
  - `safe-provider-boundary-change`

## C-03 Legacy Clinic Language Migration

- Current-state truth:
  - clinic-era names such as `clinicRole` still exist in schema and code
  - some user-facing surfaces still describe that field as `clinic role` or the generic label `Role`
- Why this is unsatisfying:
  - those names no longer fit the intended Army-wide product shape
  - the generic label `Role` is also overloaded with membership and admin access semantics
- Intended v1 direction:
  - preserve compatibility while shifting docs, UX copy, filters, forms, and export/import templates toward Army/military-oriented canonical language such as `Duty Role`
  - keep `clinicRole` / `clinic_role` as compatibility runtime and schema names until a deliberate migration slice changes them
  - continue accepting legacy import labels such as `role` or `clinic role` as tolerated compatibility aliases while canonical copy says `Duty Role`
- Constraints to preserve:
  - schema compatibility and existing data
  - existing API and runtime field shapes
- Open questions:
  - where a future runtime compatibility alias or abstraction should live during migration
  - when API and schema naming should be eligible for a real rename plan
- Suggested next skill or planning mode:
  - `legacy-compat-rename`, then `grill-me` if a repo-wide rename plan becomes in scope

## C-04 Feature-Lane Separation

- Current-state truth:
  - the core route/auth contract still only exposes coarse feature lanes
  - Critical Tasks now owns its dedicated lane across the shared route/auth contract, membership flags, and RLS
  - Rating Scheme now owns its dedicated lane across the shared route/auth contract, membership and invitation flags, first-class Evals route access, and RLS-backed scoped record checks
  - Rating Scheme already stores evaluation-tracking records that are distinct from counseling and development-goal records
  - Rating Scheme now renders through the Evals primary nav route instead of the Personnel page
  - `Leader's Book` is hidden from primary nav and redirected during redesign, but its permissions and compatibility paths still exist
- Why this is unsatisfying:
  - feature boundaries and audits stay muddy
- Intended v1 direction:
  - the intended first-class v1 lanes are `calendar`, `personnel`, `training`, `critical-tasks`, `onboarding`, and `rating-scheme`
  - the lane map covers product feature surfaces only; governance, billing, member-management, and platform concerns stay outside it
  - `Leader's Book` remains a documented transitional compatibility lane until its remake shape is settled, and it is not part of the current durable first-class lane map
  - `Rating Scheme` owns evaluation-tracking records and workflows and should be independently grantable from both `Personnel` and `Leader's Book`
  - `Leader's Book` owns counseling records, development goals, and the remade per-Soldier leader-reference or administrative surface
  - `Personnel` owns roster administration, but Rating Scheme may use app-owned roster reference queries without borrowing the Personnel lane
  - route placement and current primary-nav visibility do not define lane ownership during the current transition
  - each first-class lane should own its own capability levels inside the shared member capability map
- Constraints to preserve:
  - no fake feature split that the rest of the codebase cannot support yet
  - do not let the transitional `Leader's Book` state block the approved authz direction
  - do not treat route placement or current `Leader's Book` compatibility wiring as permission precedent
- Open questions:
  - when the remade `Leader's Book` should re-enter the durable lane taxonomy through a later ADR or equivalent review
- Suggested next skill or planning mode:
  - `retrofit-slice-audit` for `#627`, then `grill-me` plus `adr-from-retrofit-decision` again if the remade `Leader's Book` needs a later lane-taxonomy review

## C-05 Deep Module Reviews

- Current-state truth:
  - multiple orchestration-heavy modules exist in calendar, dashboard, duty roster, personnel, and training
- Why this is unsatisfying:
  - understanding one concept still requires too much file-jumping and too many broad surfaces
- Intended v1 direction:
  - progressively deepen modules with thinner public interfaces
- Constraints to preserve:
  - user-visible behavior and current route contracts
- Open questions:
  - which cluster should be deepened first for the best leverage
- Suggested next skill or planning mode:
  - `improve-codebase-architecture`

## C-06 Demo And Sandbox Decommissioning

- Current-state truth:
  - `/demo` already redirects to login with `demo_unavailable`, and `/api/create-demo-sandbox` now rejects requests instead of minting sandboxes
  - the repo still keeps demo cookies, cookie-driven org-shell bypass, and cleanup paths alive
  - sandbox requests can still switch to service-role plus no-op auth contexts instead of a real membership row
- Why this is unsatisfying:
  - these deprecated exceptions still shape how contributors reason about auth, org shells, and provider ownership
  - the runtime still carries cookie-driven bypasses and no-op auth contexts that imply "re-enable demo later" instead of "contain and remove"
- Intended v1 direction:
  - stage 1: keep the remaining exception files explicit in governance and disable standalone sandbox bootstrap entirely
  - stage 2: remove cookie-driven org-shell and auth bypasses and retire `/demo` as a product path rather than rebuilding it
  - stage 3: remove `demo_type`, sandbox RPCs, and cleanup jobs after no runtime route depends on them
- Constraints to preserve:
  - do not expand demo/sandbox behavior or invent a new v1 trial architecture
  - keep current production auth, org, billing, and membership behavior outside the deprecated demo paths
  - accept that demo may remain unavailable during the decommission transition
- Open questions:
  - whether any remaining stakeholder need justifies a later non-demo replacement such as seeded org setup or recorded walkthroughs
  - when schema and RPC cleanup can land without blocking support or ops workflows
- Suggested next skill or planning mode:
  - `adr-from-retrofit-decision` once ADR-05 is concrete enough to ratify the staged removal order
