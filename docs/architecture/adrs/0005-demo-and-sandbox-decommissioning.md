# ADR 0005: Demo And Sandbox Decommissioning

Status: Accepted
Date: 2026-04-27

## Context

TroopToTask v1 still contains demo and sandbox compatibility paths: demo cookies can affect org-route handling, sandbox code can manufacture no-op auth contexts, service-role helpers remain for sandbox shell and cleanup paths, and schema/RPC support for sandbox organizations still exists. At the same time, `/demo` now fails closed and `/api/create-demo-sandbox` rejects standalone sandbox creation.

The remaining conflict is transitional. Demo and sandbox code exists, but it should no longer shape ordinary auth, organization shell, provider-boundary, or feature-design decisions.

## Decision

Demo and sandbox behavior is deprecated and will be decommissioned in stages rather than revived as a supported v1 trial architecture.

The staged direction is:

- keep public demo entrypoints fail-closed during containment
- stop standalone sandbox bootstrap from creating new sandbox organizations
- keep the remaining cookie-driven org-shell bypasses, sandbox auth contexts, service-role cleanup, schema fields, and RPCs explicitly documented as temporary exceptions
- remove cookie-driven org-shell and auth bypasses before removing schema-level demo/sandbox support
- remove `demo_type`, sandbox RPCs, and cleanup jobs only after no runtime path depends on them

Marketing previews, recorded walkthroughs, seeded onboarding, or future trial experiences must be designed as separate product decisions. They must not reuse the deprecated demo/sandbox bypass model by default.

## Rejected Or Deferred Alternatives

- Re-enable `/demo` by deepening the existing read-only and sandbox bypasses; rejected because those paths bypass ordinary membership and authorization assumptions.
- Delete every demo/sandbox artifact immediately; deferred because schema, cleanup, and compatibility paths should be removed only after runtime callers are gone.
- Treat demo/sandbox service-role access as precedent for ordinary feature work; rejected because it widens authorization and provider-boundary risk.
- Decide the future marketing or trial replacement now; deferred because this ADR only settles decommissioning of the old bypass-based model.

## Consequences

Contributors should preserve or tighten fail-closed behavior when they encounter demo/sandbox code, add deprecation notes when touching remaining exceptions, and avoid expanding demo-only behavior. The presence of demo or sandbox code is not evidence that no-op auth contexts, cookie-driven org access, or public service-role bootstrap paths are acceptable patterns elsewhere.

## Links

- Related drift ID: `D-06`
- Related docs:
  - `docs/architecture/ARCHITECTURE.md`
  - `docs/architecture/DRIFT_LEDGER.md`
  - `docs/architecture/V1_CHANGE_INTENT.md`
  - `docs/architecture/GOVERNANCE_BASELINE.json`
