# Notification Expansion Design

**Date**: 2026-03-09
**Status**: Approved

## Overview

Expand the notification system from 4 approval-workflow-only types to 13 total types covering membership events, personnel lifecycle, data exports, and configuration deletions. Introduce a centralized notification helper module to eliminate duplicated recipient-resolution logic.

## Design Principles

- **Start selective, design for expansion** — ship a curated set of high-value notifications; structure the system so adding more later is trivial
- **Both audiences** — admins get oversight notifications, members get awareness notifications
- **High-signal only** — no notifications for routine CRUD (creating training records, updating availability, etc.)

## Centralized Helper Module

**New file**: `src/lib/server/notifications.ts`

### Functions

```typescript
// Notify a specific user
async function notifyUser(
	supabase: SupabaseClient,
	userId: string,
	orgId: string,
	notification: { type: string; title: string; message: string; link?: string }
): Promise<void>;

// Notify all admins/owners in an org (optionally excluding the actor)
async function notifyAdmins(
	supabase: SupabaseClient, // service role client
	orgId: string,
	excludeUserId: string | null,
	notification: { type: string; title: string; message: string; link?: string }
): Promise<void>;

// Notify a specific user + all admins (deduplicating if user is an admin)
async function notifyUserAndAdmins(
	supabase: SupabaseClient,
	userId: string,
	orgId: string,
	excludeUserId: string | null,
	notification: { type: string; title: string; message: string; link?: string }
): Promise<void>;
```

`notifyAdmins` centralizes the "find all admins/owners" query currently duplicated in 3 places.

## New Notification Types (9)

### Membership Events

| Type                         | Trigger                   | Recipients          | Title                       | Message                                                           | Link                    |
| ---------------------------- | ------------------------- | ------------------- | --------------------------- | ----------------------------------------------------------------- | ----------------------- |
| `member_invited`             | Admin sends org invite    | Other admins/owners | "Member Invited"            | `"{actorEmail}" invited "{inviteeEmail}" to the organization."`   | `/org/{orgId}/settings` |
| `member_joined`              | User accepts invite       | All admins/owners   | "New Member Joined"         | `"{memberEmail}" has joined the organization."`                   | `/org/{orgId}/settings` |
| `member_removed` (to member) | Admin removes member      | The removed member  | "Removed from Organization" | `"You have been removed from \"{orgName}\"."`                     | None                    |
| `member_removed` (to admins) | Admin removes member      | Other admins/owners | "Member Removed"            | `"{actorEmail}" removed "{removedEmail}" from the organization."` | `/org/{orgId}/settings` |
| `member_permissions_changed` | Admin changes permissions | The affected member | "Permissions Updated"       | `"Your permissions in \"{orgName}\" have been updated."`          | None                    |
| `member_role_changed`        | Admin changes role        | The affected member | "Role Updated"              | `"Your role in \"{orgName}\" has been changed to {newRole}."`     | None                    |
| `ownership_transferred`      | Owner transfers ownership | The new owner       | "Ownership Transferred"     | `"You are now the owner of \"{orgName}\"."`                       | `/org/{orgId}/settings` |

### Personnel Lifecycle

| Type                            | Trigger                                      | Recipients          | Title                           | Message                                                  | Link |
| ------------------------------- | -------------------------------------------- | ------------------- | ------------------------------- | -------------------------------------------------------- | ---- |
| `personnel_permanently_deleted` | Admin permanently deletes archived personnel | Other admins/owners | "Personnel Permanently Deleted" | `"{actorEmail}" permanently deleted "{personnelName}"."` | None |

### Data Export

| Type                 | Trigger                       | Recipients                 | Title           | Message                                       | Link |
| -------------------- | ----------------------------- | -------------------------- | --------------- | --------------------------------------------- | ---- |
| `bulk_data_exported` | Any user runs bulk org export | Admins/owners except actor | "Data Exported" | `"{actorEmail}" exported organization data."` | None |

### Config Deletions

| Type                  | Trigger                  | Recipients          | Title                         | Message                                                     | Link |
| --------------------- | ------------------------ | ------------------- | ----------------------------- | ----------------------------------------------------------- | ---- |
| `config_type_deleted` | A shared type is deleted | Other admins/owners | "{TypeCategory} Type Deleted" | `"{actorEmail}" deleted the {category} type "{typeName}"."` | None |

## Existing Types (4, to be refactored to use helpers)

| Type                       | Current Location                            |
| -------------------------- | ------------------------------------------- |
| `deletion_request_pending` | `api/deletion-requests/+server.ts`          |
| `deletion_approved`        | `api/deletion-requests/review/+server.ts`   |
| `deletion_denied`          | `api/deletion-requests/review/+server.ts`   |
| `archive_auto_deleted`     | `api/cleanup-archived-personnel/+server.ts` |

## Files to Modify

### New File

- `src/lib/server/notifications.ts`

### New Notification Triggers

| File                                                        | Types                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/routes/dashboard/+page.server.ts`                      | `member_joined`                                                                                                  |
| `src/routes/org/[orgId]/settings/+page.server.ts`           | `member_invited`, `member_removed`, `member_permissions_changed`, `member_role_changed`, `ownership_transferred` |
| `src/routes/org/[orgId]/api/personnel/permanent/+server.ts` | `personnel_permanently_deleted`                                                                                  |
| `src/routes/org/[orgId]/api/export-excel/+server.ts`        | `bulk_data_exported`                                                                                             |
| `src/routes/org/[orgId]/api/export/+server.ts`              | `bulk_data_exported`                                                                                             |
| `src/routes/org/[orgId]/api/training-types/+server.ts`      | `config_type_deleted`                                                                                            |
| `src/routes/org/[orgId]/api/status-types/+server.ts`        | `config_type_deleted`                                                                                            |
| `src/routes/org/[orgId]/api/counseling-types/+server.ts`    | `config_type_deleted`                                                                                            |
| `src/routes/org/[orgId]/api/assignment-types/+server.ts`    | `config_type_deleted`                                                                                            |
| `src/routes/org/[orgId]/api/rating-scheme/+server.ts`       | `config_type_deleted`                                                                                            |

### Refactor Existing (inline inserts → helpers)

| File                                                             | Types                                  |
| ---------------------------------------------------------------- | -------------------------------------- |
| `src/routes/org/[orgId]/api/deletion-requests/+server.ts`        | `deletion_request_pending`             |
| `src/routes/org/[orgId]/api/deletion-requests/review/+server.ts` | `deletion_approved`, `deletion_denied` |
| `src/routes/api/cleanup-archived-personnel/+server.ts`           | `archive_auto_deleted`                 |

## Schema

No database migration needed. The existing `notifications` table has a flexible `TEXT` type field that supports new types without changes.

## Scope Exclusions

- No notifications for routine CRUD (personnel add/edit, training records, counseling, availability, daily assignments)
- No notifications for org deletion (org ceases to exist)
- No notifications for config creation/editing (only deletion)
- No notifications for individual personnel record exports (only bulk)
- No email/push delivery — in-app only for now
