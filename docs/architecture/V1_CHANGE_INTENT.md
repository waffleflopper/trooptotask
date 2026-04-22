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
- Why this is unsatisfying:
  - it is coarse, harder to audit cleanly, and forces adjacent features to borrow permission lanes
- Intended v1 direction:
  - move toward app-owned roles, presets, grants or capabilities, scopes, and clearer policy decisions while keeping `Organization` and `Group` as v1 nouns
- Constraints to preserve:
  - v1 data model reality
  - existing organizations and memberships
  - current route and feature surface availability
- Open questions:
  - final capability taxonomy
  - migration shape from current booleans to the replacement model
- Suggested next skill or planning mode:
  - `grill-me` then an authz-focused remediation PRD

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
  - some feature permission lanes still piggyback on adjacent features
- Why this is unsatisfying:
  - feature boundaries and audits stay muddy
- Intended v1 direction:
  - each major feature gets its own permission lane
- Constraints to preserve:
  - no fake feature split that the rest of the codebase cannot support yet
- Open questions:
  - initial feature-lane map and migration order
- Suggested next skill or planning mode:
  - `grill-me`

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
