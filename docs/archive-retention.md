# Archive Retention

`organizations.archive_retention_months` governs automatic cleanup for Organization-scoped archived records. When the setting is unset, cleanup defaults to 36 months.

The `/api/cleanup-archived-records` cron deletes only rows whose archive timestamp is older than the Organization retention cutoff. Active rows and archived rows inside the retention window are retained.

The exact cron URL is reachable without a user session so its configured bearer secret can authorize the request. Missing or incorrect secrets are rejected before the job opens an admin client or reads Organization settings.

## Covered Record Families

- Personnel: `personnel.archived_at`
- Personnel follow-ups: `personnel_follow_ups.status = archived` and `personnel_follow_ups.archived_at`
- Counseling records: `counseling_records.archived_at`
- Personnel documents: `personnel_documents.archived_at`
- Leader notes: `leader_notes.archived_at`
- Critical Tasks library: `ict_tasks.archived_at`
- Assignment Types: `assignment_types.archived_at`

Personnel-owned tables use `ON DELETE CASCADE` from `personnel`, but the cleanup job still deletes expired archived child artifacts explicitly. After deleting document rows, the cleanup job removes their Supabase Storage objects so file objects are not stranded by database cascade.

Expired archived assignment types with saved Calendar assignments are retained because deleting a type would also delete its assignments. The cleanup job locks each candidate type, checks for saved assignments, and deletes only expired archived types with no saved Calendar reference. A concurrent Calendar writer either commits before that check or waits until the type deletion finishes.
