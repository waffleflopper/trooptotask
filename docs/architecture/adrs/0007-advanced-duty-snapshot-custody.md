# ADR 0007: Advanced Duty Snapshot Custody

Status: Accepted
Date: 2026-04-28

## Context

Advanced duty preview currently recomputes during apply instead of applying the exact staff duty, CQ, or team-duty run the operator reviewed. Advanced previews can include multiple dates, slot proposals, manual overrides, collision review, warnings, and candidate filters, so preview/apply drift is more dangerous than it is for simple one-person duty rosters.

Issue #700 required deciding whether advanced preview snapshots should be persisted server-side or carried back from the browser as signed client payloads.

## Decision

Persist each previewed **Advanced Run Snapshot** server-side as a 24-hour draft and apply it by `snapshotId` plus `snapshotFingerprint`.

Apply must validate snapshot status, expiration, organization boundary, actor permission, template id, date pattern, and submitted override state before persisting events. Stale, missing, expired, mismatched, or already finalized snapshots require the user to regenerate the preview.

Unapplied draft snapshots may produce preview-only **Team Duty Packet Export Model** output. A successfully applied snapshot is finalized and cannot be normally re-applied. If apply fails before persistence begins, the same unexpired draft may be retried; partial failure recovery must be explicit and idempotent.

Store draft snapshots in `advanced_duty_run_snapshots`. The table owns the snapshot lifecycle (`draft`, `applying`, `applied`, `apply-failed`, `partial-failure`, `expired`), `snapshot_fingerprint`, `snapshot_version`, 24-hour `expires_at`, reviewed input/snapshot/preview payloads, optional export model, apply error text, and the applied run link when one exists.

Draft snapshot rows use stricter RLS than applied duty events: only organization owners/admins may manage or read them. They may contain full candidate sets and reviewed override details, so they should not inherit the broader Calendar view policy used by applied duty event records.

## Rejected Or Deferred Alternatives

- Signed client snapshot payloads were rejected as the primary custody model because advanced series snapshots can become large and because browser custody makes retry, export, reopen, and stale-preview validation harder to reason about.
- Recomputing the preview during apply was rejected because it can silently persist a different team than the operator approved after template, personnel, status, special-day, or duty-event changes.

## Consequences

This adds a schema/storage cleanup slice before snapshot-bound apply can ship. Production migration work must be reviewed by the user before it is run remotely.

The benefit is a clearer generation contract: preview, manual overrides, collision review, apply, export, and recovery all refer to the same server-custodied snapshot.

## Links

- Related RFC: `docs/plans/2026-04-28-advanced-duty-run-module-rfc.md`
- Related parent issue: #699
- Related issue: #700
- Related docs:
  - `CONTEXT.md`
  - `UBIQUITOUS_LANGUAGE.md`
- Related migration: `supabase/migrations/20260428000200_advanced_duty_run_snapshots.sql`
