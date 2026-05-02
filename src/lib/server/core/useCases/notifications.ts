import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { WritePorts } from '$lib/server/core/ports';
import { requireIdentityOwnedPolicy } from './identityPolicy';

const TABLE = 'notifications';
const AUDIT_RESOURCE = 'notification';

interface NotificationOwnershipRow {
	id: string;
	user_id: string | null;
}

function authenticatedUserId(ctx: WritePorts): string {
	if (!ctx.auth.userId) fail(401, 'Unauthorized');
	return ctx.auth.userId;
}

async function fetchNotificationForOwnership(
	ctx: WritePorts,
	notificationId: string
): Promise<NotificationOwnershipRow> {
	const notification = await ctx.store.findOne<NotificationOwnershipRow>(TABLE, ctx.auth.orgId, { id: notificationId });
	if (!notification) {
		fail(404, 'Notification not found');
	}
	return notification;
}

export async function listOwnNotifications(ctx: WritePorts): Promise<Record<string, unknown>[]> {
	const userId = authenticatedUserId(ctx);
	await requireIdentityOwnedPolicy(ctx, POLICY_ACTION_CATALOG.identity.readOwnNotifications, userId, AUDIT_RESOURCE);

	return ctx.store.findMany(
		TABLE,
		ctx.auth.orgId,
		{ user_id: userId },
		{
			orderBy: [{ column: 'created_at', ascending: false }],
			limit: 20
		}
	);
}

export async function markAllOwnNotificationsRead(ctx: WritePorts): Promise<void> {
	const userId = authenticatedUserId(ctx);
	await requireIdentityOwnedPolicy(ctx, POLICY_ACTION_CATALOG.identity.updateOwnNotifications, userId, AUDIT_RESOURCE);

	const unread = await ctx.store.findMany<{ id: string }>(TABLE, ctx.auth.orgId, {
		user_id: userId,
		read: false
	});
	for (const notification of unread) {
		await ctx.store.update(TABLE, ctx.auth.orgId, notification.id, { read: true });
	}
	ctx.audit.log({ action: 'notification.mark_all_read', resourceType: AUDIT_RESOURCE });
}

export async function markOwnNotificationRead(ctx: WritePorts, notificationId: string): Promise<void> {
	const notification = await fetchNotificationForOwnership(ctx, notificationId);
	await requireIdentityOwnedPolicy(
		ctx,
		POLICY_ACTION_CATALOG.identity.updateOwnNotifications,
		notification.user_id,
		AUDIT_RESOURCE,
		notificationId
	);

	await ctx.store.update(TABLE, ctx.auth.orgId, notificationId, { read: true });
	ctx.audit.log({ action: 'notification.read', resourceType: AUDIT_RESOURCE, resourceId: notificationId });
}

export async function deleteAllOwnNotifications(ctx: WritePorts): Promise<void> {
	const userId = authenticatedUserId(ctx);
	await requireIdentityOwnedPolicy(ctx, POLICY_ACTION_CATALOG.identity.deleteOwnNotifications, userId, AUDIT_RESOURCE);

	await ctx.store.deleteWhere(TABLE, ctx.auth.orgId, { user_id: userId });
	ctx.audit.log({ action: 'notification.delete_all', resourceType: AUDIT_RESOURCE });
}

export async function deleteOwnNotification(ctx: WritePorts, notificationId: string): Promise<void> {
	const notification = await fetchNotificationForOwnership(ctx, notificationId);
	await requireIdentityOwnedPolicy(
		ctx,
		POLICY_ACTION_CATALOG.identity.deleteOwnNotifications,
		notification.user_id,
		AUDIT_RESOURCE,
		notificationId
	);

	await ctx.store.delete(TABLE, ctx.auth.orgId, notificationId);
	ctx.audit.log({ action: 'notification.deleted', resourceType: AUDIT_RESOURCE, resourceId: notificationId });
}
