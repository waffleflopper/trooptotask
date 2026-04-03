# Sensitive File Storage Model

TroopToTask stores sensitive uploaded documents in the private Supabase Storage bucket `counseling-files`.

## Access Model

- Uploads and deletes go through application API routes.
- Downloads go through application API routes that mint short-lived signed URLs.
- Direct browser-to-Storage auth flows are not used for sensitive files.
- Access is enforced by versioned `storage.objects` policies in `supabase/migrations/20260403_sensitive_file_storage_policies.sql`.

## Path Convention

Every sensitive file path is org-scoped and uses the following layout:

`{orgId}/{scope}/{recordId}/{sanitized-filename}.pdf`

Current scopes:

- `sign-in-rosters`
- `counseling-records`
- `counseling-templates`

## Permission Mapping

- `sign-in-rosters`
  Read: personnel view permission
  Write/Delete: personnel edit permission
- `counseling-records`
  Read: leaders book view permission
  Write/Delete: leaders book edit permission
- `counseling-templates`
  Read: leaders book view permission
  Write/Delete: leaders book edit permission

## File Constraints

- Bucket: `counseling-files`
- Max size: `10 MB`
- Allowed type: `application/pdf`

These constraints are enforced in both the UI and the server routes so failures happen predictably before Storage rejects the upload.
