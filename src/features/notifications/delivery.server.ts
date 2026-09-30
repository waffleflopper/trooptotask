import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationDeliveryPort, NotificationPayload } from './contracts';

/** Delivery composition supplies Organization facts without a reverse owner import. */
export type AdministratorRecipientLookup = (
	orgId: string
) => Promise<{ userIds: readonly string[]; errorMessage: string | null }>;

interface NotificationDeliveryOptions {
	getAdminClient: () => SupabaseClient;
	resolveAdministratorRecipients: AdministratorRecipientLookup;
	/** Retention jobs currently fail on delivery errors; ordinary producers report returned write errors. */
	failureMode?: 'best-effort' | 'required';
}

export function createSupabaseNotificationDelivery(options: NotificationDeliveryOptions): NotificationDeliveryPort {
	async function insert(
		orgId: string,
		userIds: readonly string[],
		notification: NotificationPayload,
		failureContext: string
	) {
		if (userIds.length === 0) return;
		const rows = userIds.map((userId) => ({
			organization_id: orgId,
			user_id: userId,
			type: notification.type,
			title: notification.title,
			message: notification.message,
			link: notification.link ?? null
		}));
		const { error } = await options.getAdminClient().from('notifications').insert(rows);
		if (error) {
			if (options.failureMode === 'required') throw new Error(error.message);
			console.error(failureContext, error.message);
		}
	}

	return {
		async notifyUser(orgId, userId, notification) {
			// Explicit recipients remain valid after a producer removes their Organization membership.
			await insert(orgId, [userId], notification, `Failed to create notification for user ${userId}:`);
		},
		async notifyAdmins(orgId, excludeUserId, notification) {
			const recipients = await options.resolveAdministratorRecipients(orgId);
			if (recipients.errorMessage !== null) {
				if (options.failureMode === 'required') throw new Error(recipients.errorMessage);
				return;
			}
			await insert(
				orgId,
				recipients.userIds.filter((id) => !excludeUserId || id !== excludeUserId),
				notification,
				`Failed to create admin notifications for org ${orgId}:`
			);
		}
	};
}
