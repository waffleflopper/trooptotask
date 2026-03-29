/**
 * NotificationPort implementation backed by Supabase.
 * Thin adapter around `src/lib/server/notifications.ts`.
 * Supports targeting a single user or broadcasting to all admins in the org
 * (optionally excluding the actor who triggered the event).
 */
import type { NotificationPort, NotificationPayload } from '../core/ports';
import { notifyUser, notifyAdmins } from '../notifications';

export function createSupabaseNotificationAdapter(): NotificationPort {
	return {
		async notifyUser(orgId: string, userId: string, notification: NotificationPayload): Promise<void> {
			await notifyUser(orgId, userId, notification);
		},
		async notifyAdmins(orgId: string, excludeUserId: string | null, notification: NotificationPayload): Promise<void> {
			await notifyAdmins(orgId, excludeUserId, notification);
		}
	};
}
