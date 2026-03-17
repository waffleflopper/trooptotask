# Notification Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 9 new notification types and centralize notification logic into a helper module.

**Architecture:** Create `src/lib/server/notifications.ts` with `notifyUser()` and `notifyAdmins()` helpers. Add an `onAfterDelete` callback to the CRUD factory for config-type deletion notifications. Refactor 3 existing inline notification inserts to use the new helpers. Wire up 9 new notification types across settings, dashboard, export, and permanent-delete endpoints.

**Tech Stack:** SvelteKit, TypeScript, Supabase (service role client for notifications)

**Design doc:** `docs/plans/2026-03-09-notification-expansion-design.md`

---

### Task 1: Create the centralized notification helper module

**Files:**

- Create: `src/lib/server/notifications.ts`

**Step 1: Create the helper module**

```typescript
import { getAdminClient } from './supabase';

interface NotificationPayload {
	type: string;
	title: string;
	message: string;
	link?: string | null;
}

/**
 * Notify a specific user.
 */
export async function notifyUser(orgId: string, userId: string, notification: NotificationPayload): Promise<void> {
	const adminClient = getAdminClient();
	await adminClient.from('notifications').insert({
		user_id: userId,
		organization_id: orgId,
		type: notification.type,
		title: notification.title,
		message: notification.message,
		link: notification.link ?? null
	});
}

/**
 * Notify all admins/owners in an org, optionally excluding a specific user (usually the actor).
 */
export async function notifyAdmins(
	orgId: string,
	excludeUserId: string | null,
	notification: NotificationPayload
): Promise<void> {
	const adminClient = getAdminClient();
	const { data: admins } = await adminClient
		.from('organization_memberships')
		.select('user_id')
		.eq('organization_id', orgId)
		.in('role', ['owner', 'admin']);

	for (const adm of admins ?? []) {
		if (excludeUserId && adm.user_id === excludeUserId) continue;
		await adminClient.from('notifications').insert({
			user_id: adm.user_id,
			organization_id: orgId,
			type: notification.type,
			title: notification.title,
			message: notification.message,
			link: notification.link ?? null
		});
	}
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors from notifications.ts

**Step 3: Commit**

```bash
git add src/lib/server/notifications.ts
git commit -m "feat: add centralized notification helper module"
```

---

### Task 2: Refactor existing notification inserts to use helpers

**Files:**

- Modify: `src/routes/org/[orgId]/api/deletion-requests/+server.ts` (lines 106-127 — replace inline admin notification loop with `notifyAdmins()`)
- Modify: `src/routes/org/[orgId]/api/deletion-requests/review/+server.ts` (lines 102-120 — replace inline insert with `notifyUser()`)
- Modify: `src/routes/api/cleanup-archived-personnel/+server.ts` (lines 66-87 — replace inline admin notification loop with `notifyAdmins()`)

**Step 1: Refactor deletion-requests/+server.ts**

Replace lines 106-127 (the `adminClient` + loop block) with:

```typescript
import { notifyAdmins } from '$lib/server/notifications';

// ... after successful insert of deletion request ...

const isPersonnel = resourceType === 'personnel';
const actionWord = isPersonnel ? 'archive' : 'delete';

await notifyAdmins(orgId, userId, {
	type: 'deletion_request_pending',
	title: `${isPersonnel ? 'Archival' : 'Deletion'} Request`,
	message: `${userEmail} requested to ${actionWord} "${resourceDescription}". Review in Admin Hub.`,
	link: `/org/${orgId}/admin/approvals`
});
```

Remove the `getAdminClient` import if no longer used in this file (check if `adminClient` is used elsewhere in the file).

**Step 2: Refactor deletion-requests/review/+server.ts**

Replace lines 102-120 (the notification insert block) with:

```typescript
import { notifyUser } from '$lib/server/notifications';

// ... after approval/denial logic ...

const isPersonnel = request_record.resource_type === 'personnel';
const actionWord = isPersonnel ? 'archive' : 'delete';
const actionWordCap = isPersonnel ? 'Archival' : 'Deletion';

await notifyUser(orgId, request_record.requested_by, {
	type: action === 'approve' ? 'deletion_approved' : 'deletion_denied',
	title: action === 'approve' ? `${actionWordCap} Approved` : `${actionWordCap} Denied`,
	message:
		action === 'approve'
			? `Your request to ${actionWord} "${request_record.resource_description}" has been approved.`
			: `Your request to ${actionWord} "${request_record.resource_description}" has been denied.${denialReason ? ` Reason: ${denialReason}` : ''}`,
	link: action === 'deny' ? request_record.resource_url : null
});
```

Note: This file still uses `adminClient` for the actual deletion/archival operations, so keep that import.

**Step 3: Refactor cleanup-archived-personnel/+server.ts**

Replace lines 66-87 (the admin notification loop) with:

```typescript
import { notifyAdmins } from '$lib/server/notifications';

// ... after successful deletion of expired archives ...

for (const [orgId, people] of byOrg.entries()) {
	const nameList = people.map((p) => p.name).join(', ');
	await notifyAdmins(orgId, null, {
		type: 'archive_auto_deleted',
		title: 'Archived Personnel Auto-Deleted',
		message: `${people.length} archived personnel auto-deleted after retention period: ${nameList}`
	});
}
```

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

**Step 5: Commit**

```bash
git add src/routes/org/[orgId]/api/deletion-requests/+server.ts \
       src/routes/org/[orgId]/api/deletion-requests/review/+server.ts \
       src/routes/api/cleanup-archived-personnel/+server.ts
git commit -m "refactor: use centralized notification helpers for existing notifications"
```

---

### Task 3: Add membership notifications to settings page

**Files:**

- Modify: `src/routes/org/[orgId]/settings/+page.server.ts`

**Step 1: Add notifications to the `invite` action**

After the successful insert + audit log (after line 191), add:

```typescript
import { notifyAdmins } from '$lib/server/notifications';

// In the invite action, after auditLog:
await notifyAdmins(orgId, user.id, {
	type: 'member_invited',
	title: 'Member Invited',
	message: `"${user.email}" invited "${email}" to the organization.`,
	link: `/org/${orgId}/settings`
});
```

**Step 2: Add notifications to the `removeMember` action**

After the successful delete + audit log (after line 264), add:

```typescript
import { notifyUser, notifyAdmins } from '$lib/server/notifications';

// Need to capture the member's email before deletion.
// Modify line 242 to also select 'email':
// .select('user_id, role, email')

// After auditLog:
if (membership?.user_id) {
	// Fetch org name for the removed member's notification
	const { data: org } = await locals.supabase.from('organizations').select('name').eq('id', orgId).single();

	await notifyUser(orgId, membership.user_id, {
		type: 'member_removed',
		title: 'Removed from Organization',
		message: `You have been removed from "${org?.name ?? 'the organization'}".`
	});

	await notifyAdmins(orgId, user.id, {
		type: 'member_removed',
		title: 'Member Removed',
		message: `"${user.email}" removed "${membership.email}" from the organization.`,
		link: `/org/${orgId}/settings`
	});
}
```

**Step 3: Add notifications to the `updatePermissions` action**

After the successful update + audit log (after line 368), add:

```typescript
// Need the target member's user_id. Fetch from membership.
// Modify line 283-287 to also select 'user_id':
// .select('role, user_id')

// Determine if role changed
const oldRole = targetMembership?.role;
const newRole = role; // 'admin' or 'member' from line 350

// Fetch org name
const { data: org } = await locals.supabase.from('organizations').select('name').eq('id', orgId).single();
const orgName = org?.name ?? 'the organization';

if (oldRole !== newRole && targetMembership?.user_id) {
	await notifyUser(orgId, targetMembership.user_id, {
		type: 'member_role_changed',
		title: 'Role Updated',
		message: `Your role in "${orgName}" has been changed to ${newRole}.`
	});
} else if (targetMembership?.user_id) {
	await notifyUser(orgId, targetMembership.user_id, {
		type: 'member_permissions_changed',
		title: 'Permissions Updated',
		message: `Your permissions in "${orgName}" have been updated.`
	});
}
```

**Step 4: Add notification to the `transferOwnership` action**

After the successful RPC + audit log (after line 399), add:

```typescript
// Fetch org name
const { data: org } = await locals.supabase.from('organizations').select('name').eq('id', orgId).single();

await notifyUser(orgId, newOwnerId, {
	type: 'ownership_transferred',
	title: 'Ownership Transferred',
	message: `You are now the owner of "${org?.name ?? 'the organization'}".`,
	link: `/org/${orgId}/settings`
});
```

**Step 5: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

**Step 6: Commit**

```bash
git add src/routes/org/[orgId]/settings/+page.server.ts
git commit -m "feat: add membership notifications (invite, remove, permissions, role, ownership)"
```

---

### Task 4: Add member_joined notification to dashboard

**Files:**

- Modify: `src/routes/dashboard/+page.server.ts`

**Step 1: Add notification after invite acceptance**

After the invitation is deleted (after line 137), before `return { success: true, accepted: true }`, add:

```typescript
import { notifyAdmins } from '$lib/server/notifications';

// After deleting the invitation:
await notifyAdmins(invitation.organization_id, user.id, {
	type: 'member_joined',
	title: 'New Member Joined',
	message: `"${user.email}" has joined the organization.`,
	link: `/org/${invitation.organization_id}/settings`
});
```

Note: This uses `invitation.organization_id` since we're outside org context on the dashboard.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/routes/dashboard/+page.server.ts
git commit -m "feat: add member_joined notification on invite acceptance"
```

---

### Task 5: Add personnel_permanently_deleted notification

**Files:**

- Modify: `src/routes/org/[orgId]/api/personnel/permanent/+server.ts`

**Step 1: Read the file and identify insertion point**

The file deletes archived personnel permanently. After the successful delete + audit log, add the notification.

```typescript
import { notifyAdmins } from '$lib/server/notifications';

// After successful permanent deletion + auditLog:
// Need personnel name — check if it's already fetched before deletion.
// The file fetches person data at line 37-40 for the audit log.

await notifyAdmins(orgId, userId, {
	type: 'personnel_permanently_deleted',
	title: 'Personnel Permanently Deleted',
	message: `"${locals.user?.email}" permanently deleted "${person.name}".`
});
```

Exact variable names (`person.name`, etc.) should be confirmed from reading the file — the agent should use whatever variable holds the person's name that was fetched before deletion.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/api/personnel/permanent/+server.ts
git commit -m "feat: add notification for permanent personnel deletion"
```

---

### Task 6: Add bulk_data_exported notification

**Files:**

- Modify: `src/routes/org/[orgId]/api/export-excel/+server.ts`
- Modify: `src/routes/org/[orgId]/api/export/+server.ts`

**Step 1: Add notification to export-excel endpoint**

After the successful export generation (near the end of the POST handler, after audit log if present), add:

```typescript
import { notifyAdmins } from '$lib/server/notifications';

// After successful export:
await notifyAdmins(orgId, userId, {
	type: 'bulk_data_exported',
	title: 'Data Exported',
	message: `"${locals.user?.email ?? 'A user'}" exported organization data.`
});
```

**Step 2: Add notification to export endpoint**

Same pattern as Step 1, in `src/routes/org/[orgId]/api/export/+server.ts`.

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/routes/org/[orgId]/api/export-excel/+server.ts \
       src/routes/org/[orgId]/api/export/+server.ts
git commit -m "feat: add notification for bulk data exports"
```

---

### Task 7: Add config_type_deleted notification via CRUD factory

**Files:**

- Modify: `src/lib/server/crudFactory.ts` (add `onAfterDelete` callback to config + invoke it in DELETE handler)
- Modify: `src/routes/org/[orgId]/api/training-types/+server.ts`
- Modify: `src/routes/org/[orgId]/api/status-types/+server.ts`
- Modify: `src/routes/org/[orgId]/api/counseling-types/+server.ts`
- Modify: `src/routes/org/[orgId]/api/assignment-types/+server.ts`
- Modify: `src/routes/org/[orgId]/api/rating-scheme/+server.ts`

**Step 1: Add `onAfterDelete` to the CRUD factory config interface**

In `src/lib/server/crudFactory.ts`, add to the `CrudConfig` interface (after `onDelete` around line 43):

```typescript
/**
 * Optional callback after successful delete.
 * Called with context about what was deleted, for notifications etc.
 */
onAfterDelete?: (context: {
	orgId: string;
	userId: string | null;
	userEmail: string | undefined;
	id: string;
	deletedDetails: Record<string, unknown> | null;
}) => Promise<void>;
```

**Step 2: Invoke `onAfterDelete` in the DELETE handler**

In the DELETE handler, after the successful delete + audit log (after line 426, before `return json({ success: true })`), add:

```typescript
if (config.onAfterDelete) {
	await config.onAfterDelete({
		orgId,
		userId: userId ?? null,
		userEmail: locals.user?.email,
		id,
		deletedDetails
	});
}
```

Also destructure `onAfterDelete` from config at line 165.

**Step 3: Add notification callbacks to each type endpoint**

For `training-types/+server.ts`, add:

```typescript
import { notifyAdmins } from '$lib/server/notifications';

// In the createCrudHandlers config, add:
onAfterDelete: async ({ orgId, userId, userEmail, deletedDetails }) => {
	await notifyAdmins(orgId, userId, {
		type: 'config_type_deleted',
		title: 'Training Type Deleted',
		message: `"${userEmail}" deleted the training type "${(deletedDetails as any)?.name ?? 'unknown'}".`
	});
};
```

For `status-types/+server.ts`:

```typescript
onAfterDelete: async ({ orgId, userId, userEmail, deletedDetails }) => {
	await notifyAdmins(orgId, userId, {
		type: 'config_type_deleted',
		title: 'Status Type Deleted',
		message: `"${userEmail}" deleted the status type "${(deletedDetails as any)?.name ?? 'unknown'}".`
	});
};
```

For `counseling-types/+server.ts`:

```typescript
onAfterDelete: async ({ orgId, userId, userEmail, deletedDetails }) => {
	await notifyAdmins(orgId, userId, {
		type: 'config_type_deleted',
		title: 'Counseling Type Deleted',
		message: `"${userEmail}" deleted the counseling type "${(deletedDetails as any)?.name ?? 'unknown'}".`
	});
};
```

For `assignment-types/+server.ts`:

```typescript
onAfterDelete: async ({ orgId, userId, userEmail, deletedDetails }) => {
	await notifyAdmins(orgId, userId, {
		type: 'config_type_deleted',
		title: 'Assignment Type Deleted',
		message: `"${userEmail}" deleted the assignment type "${(deletedDetails as any)?.name ?? 'unknown'}".`
	});
};
```

For `rating-scheme/+server.ts`: This file does NOT use the CRUD factory — it has its own DELETE handler. Add the notification inline after the successful delete + audit log:

```typescript
import { notifyAdmins } from '$lib/server/notifications';

// After successful delete + auditLog:
await notifyAdmins(orgId, userId, {
	type: 'config_type_deleted',
	title: 'Rating Scheme Entry Deleted',
	message: `"${locals.user?.email}" deleted the rating scheme entry "${deletedName ?? 'unknown'}".`
});
```

Note: Ensure `auditDetailFields` includes `'name'` for each type config so `deletedDetails` captures the name before deletion. Check each config — training-types already has `auditDetailFields: ['name']`. Add it to the others if missing.

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

**Step 5: Commit**

```bash
git add src/lib/server/crudFactory.ts \
       src/routes/org/[orgId]/api/training-types/+server.ts \
       src/routes/org/[orgId]/api/status-types/+server.ts \
       src/routes/org/[orgId]/api/counseling-types/+server.ts \
       src/routes/org/[orgId]/api/assignment-types/+server.ts \
       src/routes/org/[orgId]/api/rating-scheme/+server.ts
git commit -m "feat: add config_type_deleted notifications via CRUD factory onAfterDelete"
```

---

### Task 8: Final verification

**Step 1: Run full type check**

Run: `npm run check`
Expected: No new errors (pre-existing errors are acceptable per MEMORY.md)

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit any fixes if needed**

---

### Summary of all notification types after completion

| Type                            | Recipients                            | Trigger                                                     |
| ------------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| `deletion_request_pending`      | Admins (excl. actor)                  | Member requests archival/deletion                           |
| `deletion_approved`             | Requester                             | Admin approves request                                      |
| `deletion_denied`               | Requester                             | Admin denies request                                        |
| `archive_auto_deleted`          | Admins                                | Cron auto-deletes expired archives                          |
| `member_invited`                | Admins (excl. actor)                  | Admin sends invite                                          |
| `member_joined`                 | Admins (excl. joiner)                 | User accepts invite                                         |
| `member_removed`                | Removed member + admins (excl. actor) | Admin removes member                                        |
| `member_permissions_changed`    | Affected member                       | Admin changes permissions                                   |
| `member_role_changed`           | Affected member                       | Admin changes role                                          |
| `ownership_transferred`         | New owner                             | Owner transfers ownership                                   |
| `personnel_permanently_deleted` | Admins (excl. actor)                  | Admin permanently deletes archived person                   |
| `bulk_data_exported`            | Admins (excl. actor)                  | User runs bulk export                                       |
| `config_type_deleted`           | Admins (excl. actor)                  | Type deleted (training/status/counseling/assignment/rating) |
