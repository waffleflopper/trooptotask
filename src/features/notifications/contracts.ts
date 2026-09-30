/** Current in-app notification content; the producing feature decides its meaning. */
export interface NotificationPayload {
	type: string;
	title: string;
	message: string;
	link?: string | null;
}

/** The complete retained notification response/export shape. */
export interface Notification {
	id: string;
	user_id: string;
	organization_id: string;
	type: string;
	title: string;
	message: string;
	link: string | null;
	read: boolean;
	created_at: string;
}

export interface NotificationDeliveryPort {
	notifyUser(orgId: string, userId: string, notification: NotificationPayload): Promise<void>;
	notifyAdmins(orgId: string, excludeUserId: string | null, notification: NotificationPayload): Promise<void>;
}
