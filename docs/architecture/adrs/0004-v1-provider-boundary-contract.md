# ADR 0004: V1 Provider Boundary Contract

Status: Accepted
Date: 2026-04-27

## Context

TroopToTask v1 uses Supabase for auth, database access, RLS, storage-adjacent flows, and service-role operations. The repo already has an app-owned backend shape through `src/lib/server/core/useCases/*`, `src/lib/server/core/ports.ts`, `src/lib/server/entities/*`, and `src/lib/server/adapters/*`, but route-local `locals.supabase` logic still exists in auth, admin/platform, layout, and some edge workflows.

The conflict is intentional current-state drift rather than an architecture option: some code still talks directly to Supabase because it has not been remediated yet, while new business logic is expected to move through use cases, ports, entities, and adapters.

## Decision

Business logic should be provider-agnostic by default. Reusable server behavior belongs in app-owned use cases and domain-shaped helpers, provider-specific persistence belongs behind adapters, and route files should primarily compose request handling, authorization context, and use-case calls.

Supabase-aware code is allowed in:

- auth-provider edges such as login, logout, MFA, invite acceptance, password reset, session establishment, and hook-level session construction
- adapter implementations under `src/lib/server/adapters/*`
- provider setup helpers and narrowly scoped platform utilities such as audit logging, webhooks, notifications, storage, cleanup, and service-role operations
- explicitly approved remediation slices that are moving a provider boundary rather than adding new drift

New product feature logic should not depend directly on Supabase query syntax, table APIs, RPC wiring, or `locals.supabase` unless it is inside an approved provider edge or adapter. If a feature needs persistence, the durable path is to define or reuse a port and place the Supabase-specific work behind an adapter.

## Rejected Or Deferred Alternatives

- Treat SvelteKit routes as the main business-logic layer because they already receive `locals.supabase`; rejected because it spreads provider coupling into every feature.
- Require every current route-level Supabase call to move immediately; deferred because v1 has production behavior and the repo is intentionally remediating high-risk seams in slices.
- Hide auth-provider integration behind a fully provider-neutral abstraction now; deferred because Supabase Auth is a real current dependency and auth edges need provider-specific behavior for the near term.
- Treat service-role access as a general shortcut for feature logic; rejected because it bypasses ordinary authorization boundaries and should stay limited to platform, audit, webhook, cleanup, and migration-style work.

## Consequences

Provider-boundary changes should reduce tolerated drift instead of spreading it. A future database-provider swap should primarily affect adapters and connection wiring, not feature modules or route business logic. Existing route-level leaks remain tolerated only where documented in governance baseline and drift docs, and remediation slices should update those docs when they retire an exception.

## Links

- Related drift IDs: `D-02`, `D-08`, `D-09`
- Related docs:
  - `docs/architecture/ARCHITECTURE.md`
  - `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
  - `docs/architecture/DRIFT_LEDGER.md`
  - `docs/architecture/V1_CHANGE_INTENT.md`
  - `docs/architecture/GOVERNANCE_BASELINE.json`
