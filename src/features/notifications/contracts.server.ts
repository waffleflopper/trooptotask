import type { Notification } from './contracts';

export interface NotificationStore {
	findNotification(orgId: string, id: string): Promise<Pick<Notification, 'id' | 'user_id'> | null>;
	listOwn(orgId: string, userId: string): Promise<Notification[]>;
	listOwnUnreadIds(orgId: string, userId: string): Promise<string[]>;
	markRead(orgId: string, id: string): Promise<void>;
	deleteNotification(orgId: string, id: string): Promise<void>;
	deleteOwn(orgId: string, userId: string): Promise<void>;
	countOwnUnread(orgId: string, userId: string): Promise<number>;
	listOwnExportRows(orgId: string, userId: string): Promise<Record<string, unknown>[]>;
}
