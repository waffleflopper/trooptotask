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
