# ADR 0005: Demo And Sandbox Decommissioning

Status: Accepted
Date: 2026-04-27

## Context

TroopToTask v1 historically contained demo and sandbox compatibility paths: demo cookies affected org-route handling, sandbox code manufactured no-op auth contexts, service-role helpers supported sandbox shell and cleanup paths, and schema/RPC support for sandbox organizations existed.

Issue #868 removed the runtime entrypoints and bypasses. Migration `20260514000100_remove_demo_sandbox_schema.sql` removes the current schema fields and RPCs. Historical migration snapshots still include the old `demo_type` and sandbox RPC support for audit history, but those artifacts should not shape ordinary auth, organization shell, provider-boundary, or feature-design decisions.

## Decision

Demo and sandbox behavior is deprecated and will be decommissioned in stages rather than revived as a supported v1 trial architecture.

The staged direction was:

- stop standalone sandbox bootstrap from creating new sandbox organizations
- remove public demo/sandbox entrypoints, cookie-driven org-shell bypasses, sandbox auth contexts, and service-role cleanup routes
- remove `demo_type`, sandbox RPCs, grants, and seed references after no runtime path depends on them, then coordinate production application through the normal release process

Marketing previews, recorded walkthroughs, seeded onboarding, or future trial experiences must be designed as separate product decisions. They must not reuse the deprecated demo/sandbox bypass model by default.

## Rejected Or Deferred Alternatives

- Re-enable `/demo` by deepening the existing read-only and sandbox bypasses; rejected because those paths bypass ordinary membership and authorization assumptions.
- Delete every demo/sandbox artifact immediately; deferred because schema, cleanup, and compatibility paths should be removed only after runtime callers are gone.
- Treat demo/sandbox service-role access as precedent for ordinary feature work; rejected because it widens authorization and provider-boundary risk.
- Decide the future marketing or trial replacement now; deferred because this ADR only settles decommissioning of the old bypass-based model.

## Consequences

Contributors should not reintroduce runtime demo/sandbox routes, cookies, no-op auth contexts, public service-role bootstrap paths, or compatibility shims. Historical demo or sandbox schema residue is not evidence that those patterns are acceptable elsewhere.

Update: issue #868 removed the runtime demo/sandbox entrypoints, cookie-driven org access, no-op auth context, in-memory demo org-shell path, and scheduled sandbox cleanup route. Issue #874 added migration `20260514000100_remove_demo_sandbox_schema.sql` to remove current schema residue; production application still follows the normal migration release process.

## Links

- Related drift ID: `D-06`
- Related docs:
  - `docs/architecture/ARCHITECTURE.md`
  - `docs/architecture/DRIFT_LEDGER.md`
  - `docs/architecture/V1_CHANGE_INTENT.md`
  - `docs/architecture/GOVERNANCE_BASELINE.json`
