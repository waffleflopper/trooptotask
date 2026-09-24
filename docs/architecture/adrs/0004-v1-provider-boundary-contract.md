# ADR 0004: V1 Provider Boundary Contract

Status: Accepted
Date: 2026-04-27

## Context

TroopToTask v1 uses Supabase for auth, database access, RLS, storage-adjacent flows, and service-role operations. The repo already has an app-owned backend shape through `src/lib/server/core/useCases/*`, `src/lib/server/core/ports.ts`, `src/lib/server/entities/*`, and `src/lib/server/adapters/*`, but route-local `locals.supabase` logic still exists in auth, admin/platform, layout, and some edge workflows.

The conflict is intentional current-state drift rather than an architecture option: some code still talks directly to Supabase because it has not been remediated yet. [ADR 0013](0013-v1-module-and-delivery-contract.md) now owns feature-module placement and public exports; this ADR continues to govern provider ownership and narrow provider access.

## Decision

Business policy should not receive raw provider clients or arbitrary query access. Reusable server behavior belongs to owner-held operations and domain rules, provider-specific persistence belongs behind owned adapters and intentional SQL, and route files primarily compose request admission, transport mapping and authorized operation calls. Current Supabase Auth and SQL/RLS/Storage transaction guarantees remain authoritative.

Supabase-aware code is allowed in:

- auth-provider edges such as login, logout, MFA, invite acceptance, password reset, session establishment, and hook-level session construction
- owner-held provider adapters and retained implementations under `src/lib/server/adapters/*` until their owning cutovers
- provider setup helpers and narrowly scoped platform utilities such as audit logging, notifications, storage, cleanup and service-role operations
- explicitly approved remediation slices that are moving a provider boundary rather than adding new drift

New product feature logic should not depend directly on Supabase query syntax, table APIs, RPC wiring, or `locals.supabase` unless it is inside an owned provider edge or adapter. When a current operation needs persistence, use a typed collaborator and owner-held provider adapter where that seam adds value; preserve SQL/RLS and transaction rules that the operation depends on.

## Rejected Or Deferred Alternatives

- Treat SvelteKit routes as the main business-logic layer because they already receive `locals.supabase`; rejected because it spreads provider coupling into every feature.
- Require every current route-level Supabase call to move immediately; deferred because v1 has production behavior and the repo is intentionally remediating high-risk seams in slices.
- Hide auth-provider integration behind a fully provider-neutral abstraction now; deferred because Supabase Auth is a real current dependency and auth edges need provider-specific behavior for the near term.
- Treat service-role access as a general shortcut for feature logic; rejected because it bypasses ordinary authorization boundaries and should stay limited to narrowly authorized platform, audit, cleanup and migration-style work.

## Consequences

Provider-boundary changes should reduce tolerated drift instead of spreading it. The current goal is narrow, owned feature operations with explicit provider and SQL authority; replacing Supabase is outside stabilization. Existing route-level leaks remain tolerated only where documented in governance baseline and drift docs, and remediation slices should update those docs when they retire an exception.

## Links

- Current drift: `D-02`, `D-09`; [historical Organization-settings repair D-08](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/architecture/DRIFT_LEDGER.md#d-08-route-level-membership-and-settings-logic-resolved-for-org-settings-governance).
- Related docs:
  - `docs/architecture/ARCHITECTURE.md`
  - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
  - `docs/architecture/DRIFT_LEDGER.md`
  - `docs/architecture/GOVERNANCE_BASELINE.json`
