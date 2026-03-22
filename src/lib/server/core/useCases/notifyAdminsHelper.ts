import type { DataStore } from '$lib/server/core/ports';

interface NotificationPayload {
	type: string;
	title: string;
	message: string;
	link?: string | null;
}

export async function notifyAdminsViaStore(
	store: DataStore,
	orgId: string,
	excludeUserId: string | null,
	notification: NotificationPayload
): Promise<void> {
	const admins = await store.findMany<{ user_id: string; role: string }>(
		'organization_memberships',
		orgId,
		{},
		{
			inFilters: { role: ['owner', 'admin'] }
		}
	);

	const rows = admins
		.filter((adm) => !excludeUserId || adm.user_id !== excludeUserId)
		.map((adm) => ({
			user_id: adm.user_id,
			type: notification.type,
			title: notification.title,
			message: notification.message,
			link: notification.link ?? null
		}));

	if (rows.length > 0) {
		await store.insertMany('notifications', orgId, rows);
	}
}
