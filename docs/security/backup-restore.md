# Backup And Restore Runbook

This runbook documents the current launch posture for backups and restores. It does not claim a completed restore drill, and it must not be used to casually test production recovery.

## Owner And Cadence

- **Owner:** Robert.
- **Cadence:** confirm provider backup posture quarterly, after material storage/database changes, and before making stronger compliance claims.
- **Evidence:** external evidence held by the security owner, such as provider backup setting notes, provider support tickets, restore-drill requests, or sanitized recovery summaries.

## Current Backup Posture

TroopToTask relies on managed provider backups for hosted infrastructure:

- Supabase-managed PostgreSQL backups for database recovery.
- Supabase Storage provider durability and recovery controls for uploaded files.
- Vercel deployment history and source-controlled application code for application rollback.
- Stripe-hosted payment records for billing source-of-truth events and invoice history.

Provider backup availability, retention, and restore behavior depend on the active plan and provider settings. Robert should confirm those settings outside the repo before paid launch and keep the evidence external.

## Restore Procedure

If a restore may be needed:

1. Classify the event severity using the incident response plan.
2. Stop and confirm whether production restore, point-in-time recovery, or provider support escalation is actually required.
3. Preserve relevant audit logs, provider event IDs, and support-safe identifiers before any recovery action.
4. Request provider restore assistance through the approved provider channel when needed.
5. Prefer non-production validation before any production-impacting action.
6. Record the timeline, requested recovery point, systems affected, approver, outcome, and follow-up actions in external evidence.

Do not reset, delete, migrate, or overwrite production data from an agent session. Do not reset or delete local development data without Robert's explicit permission.

## Restore Drill Status

The current repo does not contain evidence that a full restore drill has passed.

Before making stronger operational or formal compliance claims, Robert should schedule a non-production restore drill and record:

- drill date,
- environment,
- data scope,
- requested recovery point,
- provider ticket or audit event reference,
- result,
- time to restore,
- gaps and follow-up actions.

The drill record should remain external evidence held by the security owner unless a sanitized summary is intentionally added later.

## Billing And Payment Recovery Notes

Stripe is the billing source of truth for payment events. If billing data appears modified or inconsistent:

- preserve relevant Stripe event IDs, customer IDs, subscription IDs, invoice IDs, and TroopToTask billing snapshot IDs;
- avoid copying raw webhook payloads, card details, API keys, or webhook secrets into notes;
- use the incident response plan for webhook or payment incidents;
- use the billing operations launch checklist for support-safe launch evidence.
