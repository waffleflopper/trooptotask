# Backup and restore

Robert confirms provider backup settings quarterly and after a material database or Storage change.

## Backups

- Supabase-managed PostgreSQL backups cover the database.
- Supabase Storage durability covers uploaded files.
- Vercel deployment history and source control cover the application.

Backup retention and restore behavior depend on the provider plan. Keep the confirmed settings outside the repository.

## Restore

1. Classify the event with the [incident response plan](incident-response.md).
2. Confirm that a production restore, point-in-time recovery or provider escalation is actually required.
3. Preserve audit logs, provider event IDs and support identifiers before any recovery action.
4. Request the restore through the provider's support channel.
5. Validate outside production first.
6. Record the timeline, recovery point, affected systems, approver and outcome outside the repository.

An agent session never resets, deletes, migrates or overwrites production data.

No restore drill has been performed. Robert must run and record a non-production drill before any stronger operational or compliance claim.
