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
export async function notifyUser(
	orgId: string,
	userId: string,
	notification: NotificationPayload
): Promise<void> {
	const adminClient = getAdminClient();
	const { error } = await adminClient.from('notifications').insert({
		user_id: userId,
		organization_id: orgId,
		type: notification.type,
		title: notification.title,
		message: notification.message,
		link: notification.link ?? null
	});
	if (error) {
		console.error(`Failed to create notification for user ${userId}:`, error.message);
	}
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

	const rows = (admins ?? [])
		.filter((adm) => !excludeUserId || adm.user_id !== excludeUserId)
		.map((adm) => ({
			user_id: adm.user_id,
			organization_id: orgId,
			type: notification.type,
			title: notification.title,
			message: notification.message,
			link: notification.link ?? null
		}));

	if (rows.length > 0) {
		const { error } = await adminClient.from('notifications').insert(rows);
		if (error) {
			console.error(`Failed to create admin notifications for org ${orgId}:`, error.message);
		}
	}
}
