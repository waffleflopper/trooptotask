import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireIdentityOwnedPolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import type { Notification } from './contracts';

import type { NotificationStore } from './contracts.server';

export interface NotificationSelfPorts {
	auth: Pick<OrganizationAccessGrant, 'userId' | 'role' | 'capabilityMap' | 'scopeSet'> & { readonly orgId: string };
	audit: PolicyAuditSink;
	store: NotificationStore;
}

const AUDIT_RESOURCE = 'notification';

async function findNotificationForOwnership(ports: NotificationSelfPorts, id: string) {
	const notification = await ports.store.findNotification(ports.auth.orgId, id);
	if (!notification) fail(404, 'Notification not found');
	return notification;
}

export async function listOwnNotifications(ports: NotificationSelfPorts): Promise<Notification[]> {
	await requireIdentityOwnedPolicy(
		ports,
		POLICY_ACTION_CATALOG.identity.readOwnNotifications,
		ports.auth.userId,
		AUDIT_RESOURCE
	);
	return ports.store.listOwn(ports.auth.orgId, ports.auth.userId);
}

export async function markAllOwnNotificationsRead(ports: NotificationSelfPorts): Promise<void> {
	await requireIdentityOwnedPolicy(
		ports,
		POLICY_ACTION_CATALOG.identity.updateOwnNotifications,
		ports.auth.userId,
		AUDIT_RESOURCE
	);
	const ids = await ports.store.listOwnUnreadIds(ports.auth.orgId, ports.auth.userId);
	for (const id of ids) await ports.store.markRead(ports.auth.orgId, id);
	ports.audit.log({ action: 'notification.mark_all_read', resourceType: AUDIT_RESOURCE });
}

export async function markOwnNotificationRead(ports: NotificationSelfPorts, id: string): Promise<void> {
	const notification = await findNotificationForOwnership(ports, id);
	await requireIdentityOwnedPolicy(
		ports,
		POLICY_ACTION_CATALOG.identity.updateOwnNotifications,
		notification.user_id,
		AUDIT_RESOURCE,
		id
	);
	await ports.store.markRead(ports.auth.orgId, id);
	ports.audit.log({ action: 'notification.read', resourceType: AUDIT_RESOURCE, resourceId: id });
}

export async function deleteAllOwnNotifications(ports: NotificationSelfPorts): Promise<void> {
	await requireIdentityOwnedPolicy(
		ports,
		POLICY_ACTION_CATALOG.identity.deleteOwnNotifications,
		ports.auth.userId,
		AUDIT_RESOURCE
	);
	await ports.store.deleteOwn(ports.auth.orgId, ports.auth.userId);
	ports.audit.log({ action: 'notification.delete_all', resourceType: AUDIT_RESOURCE });
}

export async function deleteOwnNotification(ports: NotificationSelfPorts, id: string): Promise<void> {
	const notification = await findNotificationForOwnership(ports, id);
	await requireIdentityOwnedPolicy(
		ports,
		POLICY_ACTION_CATALOG.identity.deleteOwnNotifications,
		notification.user_id,
		AUDIT_RESOURCE,
		id
	);
	await ports.store.deleteNotification(ports.auth.orgId, id);
	ports.audit.log({ action: 'notification.deleted', resourceType: AUDIT_RESOURCE, resourceId: id });
}

export async function listNotificationExportRows(ports: NotificationSelfPorts): Promise<Record<string, unknown>[]> {
	await requireIdentityOwnedPolicy(
		ports,
		POLICY_ACTION_CATALOG.identity.readOwnNotifications,
		ports.auth.userId,
		AUDIT_RESOURCE
	);
	return ports.store.listOwnExportRows(ports.auth.orgId, ports.auth.userId);
}
