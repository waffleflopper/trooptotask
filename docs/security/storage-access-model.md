# Sensitive File Storage Model

TroopToTask uses private Supabase Storage buckets `counseling-files` and `personnel-documents`. The paths, permission mapping and constraints below describe `counseling-files`; Personnel document paths retain their existing Person-bound policies.

## Access Model

- Uploads and deletes go through application API routes.
- Downloads go through application API routes that mint short-lived signed URLs.
- Direct browser-to-Storage auth flows are not used for sensitive files.
- Access is enforced by versioned `storage.objects` policies in the Supabase migrations.

## Path Convention

Every sensitive file path is org-scoped and uses the following layout:

`{orgId}/{scope}/{recordId}/{sanitized-filename}.pdf`

Current scopes:

- `sign-in-rosters`
- `counseling-records`

## Permission Mapping

- `sign-in-rosters`
  Read: Training view capability and the saved roster’s scope
  Write/Delete: Training operate capability
- `counseling-records`
  Read: scoped Personnel configure capability
  Write/Delete: scoped Personnel operate capability

## File Constraints

- Bucket: `counseling-files`
- Max size: `10 MB`
- Allowed type: `application/pdf`

These constraints are enforced in both the UI and the server routes so failures happen predictably before Storage rejects the upload.

## Organization owner cleanup prerequisite

The forward [D17 migration](../../supabase/migrations/20261002001000_organization_storage_cleanup.sql) adds authenticated SELECT/DELETE for either fixed bucket when the first slash-delimited object-name segment is a canonical hyphenated Organization UUID, case-insensitively. The current unsuspended user must own an existing unsuspended Organization. It covers arbitrary nested orphan paths and other-uploaders; SELECT permits download as well as discovery. Former/removed owners, administrators, other members, non-owner platform support and foreign owners gain no new scope. Malformed/bare/lookalike UUID paths and other buckets do not qualify. Existing live-parent feature permissions remain separate, including their existing broader access; this is no blanket suspension repair for those policies.

It adds no INSERT/UPDATE policy or table grant and changes no saved row or bucket configuration. Application pending-flow/MFA/recent-session admission remains separately required for destruction. Robert reports [manual application of the reviewed migration](../stabilization/RELEASE.md#phase-08-d17-owner-storage-cleanup-permission); no agent readback confirms hosted state. The application still deletes the Organization row without complete Storage cleanup. The later consumer must remove actual bytes through the ordinary Storage API before parent deletion; SQL metadata DELETE cannot establish byte removal. See the [prerequisite receipt](../stabilization/phase-08/d17-storage-cleanup-permission.md) for proof and its limits.
