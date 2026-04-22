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
- Why this is unsatisfying:
  - provider swap blast radius is still too large
- Intended v1 direction:
  - business logic outside auth and adapters should not depend on provider query APIs
- Constraints to preserve:
  - current auth-provider integration
  - working production flows
- Open questions:
  - which route clusters should move first
  - what intermediate adapter shapes make the migration safest
- Suggested next skill or planning mode:
  - `improve-codebase-architecture`

## C-03 Legacy Clinic Language Migration

- Current-state truth:
  - clinic-era names such as `clinicRole` still exist in schema and code
- Why this is unsatisfying:
  - those names no longer fit the intended Army-wide product shape
- Intended v1 direction:
  - preserve compatibility while shifting docs, UX copy, and future abstractions toward Army/military-oriented canonical language such as `Duty Role`
- Constraints to preserve:
  - schema compatibility and existing data
- Open questions:
  - where compatibility aliases should live during migration
- Suggested next skill or planning mode:
  - `ubiquitous-language`

## C-04 Feature-Lane Separation

- Current-state truth:
  - the core route/auth contract still only exposes coarse feature lanes
  - Critical Tasks currently piggybacks on Training
  - Rating Scheme currently renders inside the Personnel page while spanning borrowed lanes across Leaders Book and Personnel-adjacent enforcement
  - `Leader's Book` is hidden from primary nav during redesign, but its permissions and compatibility paths still exist
- Why this is unsatisfying:
  - feature boundaries and audits stay muddy
- Intended v1 direction:
  - the intended first-class v1 lanes are `calendar`, `personnel`, `training`, `critical-tasks`, `onboarding`, and `rating-scheme`
  - the lane map covers product feature surfaces only; governance, billing, member-management, and platform concerns stay outside it
  - `Leader's Book` remains a documented transitional compatibility lane until its remake or replacement is decided, and it is not part of the durable first-class lane map
  - temporary screen placement does not define lane ownership
  - `Rating Scheme` owns its own lane and should be independently grantable from `Personnel` even if temporary UI nesting persists during migration
  - each first-class lane should own its own capability levels inside the shared member capability map
- Constraints to preserve:
  - no fake feature split that the rest of the codebase cannot support yet
  - do not let the transitional `Leader's Book` state block the approved authz direction
  - do not treat temporary page nesting as permission precedent
- Open questions:
  - exact Rating Scheme versus Leader's Book record boundary during the remake / replacement decision
- Suggested next skill or planning mode:
  - `tdd` for `#621`, then `grill-me` plus `adr-from-retrofit-decision` for `#620`, then `tdd` for `#627`

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
