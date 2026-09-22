# ADR 0007: Advanced Duty Snapshot Custody

Status: Superseded
Date: 2026-04-28
Superseded: 2026-05-04 by removal of the old Advanced Duty Run server flow and `/api/duty-events/**` endpoints.

## Context

The old Advanced Duty Run flow previously previewed staff duty, CQ, or team-duty runs before applying them as `duty_events`.

Issue #700 required deciding whether advanced preview snapshots should be persisted server-side or carried back from the browser as signed client payloads.

## Decision

This decision is no longer active. The old Advanced Duty Run module, snapshot custody use case, revision draft use case, and `/api/duty-events/**` write/revision endpoints were removed on 2026-05-04.

The later Duty Roster surface applied accepted runs through `dutyRosterTemplates` and daily assignments. Phase 05 D01 removed that producer and its routes/exports. Calendar duty readers remain owned by D02; phase 06 owns schema retirement while preserving stored Calendar facts.

## Rejected Or Deferred Alternatives

- Signed client snapshot payloads were rejected as the primary custody model because advanced series snapshots can become large and because browser custody makes retry, export, reopen, and stale-preview validation harder to reason about.
- Recomputing the preview during apply was rejected because it can silently persist a different team than the operator approved after template, personnel, status, special-day, or duty-event changes.

## Consequences

This ADR is retained as historical context for migrations or old data only.

The former generation contract kept preview, manual overrides, collision review, apply, export, and recovery tied to the same server-custodied snapshot. It does not authorize restoring runtime generation.

## Links

- Related RFC: removed with the old Advanced Duty Run flow.
- Related parent issue: #699
- Related issue: #700
- Related docs:
  - [Current domain language](../../../CONTEXT.md#language)
  - [Stabilization decisions](../ARCHITECTURE.md#stabilization-decisions)
- Related migration: `supabase/migrations/20260428000200_advanced_duty_run_snapshots.sql`
