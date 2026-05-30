# Archive Retention

`organizations.archive_retention_months` governs automatic cleanup for Organization-scoped archived records. When the setting is unset, cleanup defaults to 36 months.

The `/api/cleanup-archived-records` cron deletes only rows whose archive timestamp is older than the Organization retention cutoff. Active rows and archived rows inside the retention window are retained.

## Covered Record Families

- Personnel: `personnel.archived_at`
- Personnel follow-ups: `personnel_follow_ups.status = archived` and `personnel_follow_ups.archived_at`
- Counseling records: `counseling_records.archived_at`
- Personnel documents: `personnel_documents.archived_at`
- Leader notes: `leader_notes.archived_at`
- Critical Tasks library: `ict_tasks.archived_at`
- Assignment Types: `assignment_types.archived_at`
- Duty Roster Templates: `duty_roster_templates.status = archived` and `duty_roster_templates.archived_at`

Personnel-owned tables use `ON DELETE CASCADE` from `personnel`, but the cleanup job still deletes expired archived child artifacts explicitly. Personnel document cleanup removes Supabase Storage objects before deleting document rows so file objects are not stranded by database cascade.

`duty_templates` is legacy and is intentionally excluded.
