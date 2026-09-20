# V1 Change Intent

Use this file when the current v1 implementation is real enough to document, but clearly not the system we want to preserve long-term.

This is the repo's place to capture:

- current-state truth
- why that truth is unsatisfying
- intended v1 direction
- open questions that need a product or architecture decision

## How To Use This File

- Do not rewrite current-state docs to match desired future architecture.
- Instead, keep current-state docs honest and record the desired direction here.
- When a future slice is explicitly about remediation, use the entries here to shape the next planning or grilling session.

## Reviewing an open decision

Use the entry that matches the requested boundary and the relevant references from the [architecture reading map](../agents/architecture-governance.md). Identify the current behavior, intended outcome, constraints and consequential unresolved choice. Resolve routine details from existing contracts; ask a focused question only when the answer changes the authorized result. Follow the [decision boundaries](AI_AGENT_OPERATING_MODEL.md#decision-boundaries).

An available design/domain skill can help stress-test a tradeoff when that is the task. There is no mandatory skill stack, blanket documentation itinerary or automatic issue publication for these entries.

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
  - v1 authorization is membership-role plus stored member preset, capability map, shared scope set and sensitive-action checks
  - `owner`, `admin`, and `member` are the persisted organization roles
  - settings UI presets are convenience shapes over the stored member-access model
  - scoped access uses the shared member scope set
- Why this is unsatisfying:
  - it is coarse, harder to audit cleanly, and forces adjacent features to borrow permission lanes
  - it encourages reverse-engineered labels instead of durable access concepts
  - it creates pressure toward hidden partial-admin patterns instead of explicit governance rules
- Intended v1 direction:
  - keep `owner`, `admin`, and `member` as the fixed organization-governance roles
  - keep `admin` as a fixed high-trust role below `owner`, not a decomposable member preset
  - model member access as an assigned preset plus a per-lane capability map, shared scope set and explicit sensitive-action checks
  - use `Viewer`, `Operator`, and `Editor` as the starter member presets
  - use per-lane capability levels of `none`, `view`, `operate`, and `configure`
  - make shared member scope target `organization-wide` or `1..n` groups, without allowing per-feature scope matrices
  - keep governance actions such as member management and org settings with `admin` / `owner`, while ownership transfer and destructive org-danger operations stay `owner`-only
- Constraints to preserve:
  - v1 data model reality
  - existing organizations and memberships
  - current route and feature surface availability
- Open questions:
  - exact per-feature mapping of `operate` versus `configure`
  - exact audit treatment for suspicious denied access; owner-only actions and suspension remain explicit, and commercial read-only was removed under D03
- Suggested next skill or planning mode:
  - resolve consequential policy choices, then implement bounded slices with meaningful behavioral tests

## C-02 Provider Boundary Hardening

- Current-state truth:
  - many business paths already use use cases and adapters, but route-level `locals.supabase` logic still exists in important seams
  - org settings rename, ownership transfer, and delete now run behind an app-owned use case and Supabase adapter
  - historical `#619` moved billing and export lifecycles behind store-backed helpers; D05 03-05b removes billing delivery helpers while retaining the export lifecycle
  - historical `#637` handled partial billing cancellation; D05 03-05b removes that cancellation/recovery path, and 03-05c removes the webhook/provider and webhook-ledger cleanup
  - several admin/platform routes remain route-local drift
- Why this is unsatisfying:
  - provider swap blast radius is still too large
- Intended v1 direction:
  - business logic outside auth and adapters should not depend on provider query APIs
  - beta **Access Request** setup uses app-owned **Account Setup Links** while Supabase Auth remains the authentication provider
- Constraints to preserve:
  - current auth-provider integration
  - working production flows
- Open questions:
  - which remaining route clusters should move first after admin/platform operations
  - what intermediate adapter shapes make the migration safest
- Suggested next skill or planning mode:
  - `tdd` for approved provider-boundary implementation slices

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
  - resolve naming and data-contract decisions if a repo-wide rename becomes authorized

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
  - module design within an authorized boundary
