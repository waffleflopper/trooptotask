import type { AuditEvent } from '$lib/audit/contracts';
import type {
	PlatformAnnouncement,
	PlatformAnnouncementCreateInput,
	PlatformAnnouncementSetActiveResult,
	PlatformAnnouncementValidation
} from '../announcementTypes';

export interface PlatformAnnouncementStoreCreateInput extends PlatformAnnouncementCreateInput {
	isActive: boolean;
	createdBy: string;
}

export interface PlatformAnnouncementSetActiveInput {
	id: string;
	isActive: boolean;
	updatedBy: string;
}

export interface PlatformAnnouncementSetActiveUpdate {
	id: string;
	isActive: boolean;
}

export interface PlatformAnnouncementsStore {
	listAnnouncements(): Promise<PlatformAnnouncement[]>;
	createAnnouncement(input: PlatformAnnouncementStoreCreateInput): Promise<PlatformAnnouncement>;
	setAnnouncementActive(input: PlatformAnnouncementSetActiveInput): Promise<PlatformAnnouncementSetActiveUpdate | null>;
	deleteAnnouncement(id: string): Promise<void>;
}

export interface PlatformAnnouncementsDependencies {
	store: PlatformAnnouncementsStore;
	actorUserId: string;
	audit(event: AuditEvent): void;
}

export interface PlatformAnnouncements {
	list(): Promise<PlatformAnnouncement[]>;
	create(input: PlatformAnnouncementCreateInput): Promise<PlatformAnnouncement>;
	setActive(id: string, isActive: boolean): Promise<PlatformAnnouncementSetActiveResult>;
	delete(id: string): Promise<{ success: true }>;
}

export function createPlatformAnnouncements(deps: PlatformAnnouncementsDependencies): PlatformAnnouncements {
	return {
		list: () => deps.store.listAnnouncements(),

		async create(input) {
			const announcement = await deps.store.createAnnouncement({
				title: input.title,
				message: input.message,
				type: input.type,
				expiresAt: input.expiresAt ?? null,
				isActive: true,
				createdBy: deps.actorUserId
			});

			deps.audit({
				action: 'announcement_create',
				resourceType: 'platform_announcement',
				resourceId: announcement.id,
				details: { title: input.title, type: input.type },
				severity: 'info'
			});

			return announcement;
		},

		async setActive(id, isActive) {
			const update = await deps.store.setAnnouncementActive({
				id,
				isActive,
				updatedBy: deps.actorUserId
			});

			if (!update) return { status: 'not_found' };

			deps.audit({
				action: update.isActive ? 'announcement_activate' : 'announcement_deactivate',
				resourceType: 'platform_announcement',
				resourceId: id,
				details: { is_active: update.isActive },
				severity: 'info'
			});

			return { status: 'updated', id, isActive: update.isActive };
		},

		async delete(id) {
			await deps.store.deleteAnnouncement(id);

			deps.audit({
				action: 'announcement_delete',
				resourceType: 'platform_announcement',
				resourceId: id,
				severity: 'warning'
			});

			return { success: true };
		}
	};
}

export function validatePlatformAnnouncement(input: {
	title: string;
	message: string;
	type: string;
	expiresAt?: string;
}): PlatformAnnouncementValidation {
	const title = input.title.trim();
	const message = input.message.trim();
	if (!title) return { valid: false, error: 'Title is required' };
	if (title.length > 200) return { valid: false, error: 'Title must be 200 characters or less' };
	if (!message) return { valid: false, error: 'Message is required' };
	if (message.length > 1000) return { valid: false, error: 'Message must be 1000 characters or less' };
	if (input.type !== 'info' && input.type !== 'warning' && input.type !== 'maintenance')
		return { valid: false, error: 'Invalid announcement type' };
	return { valid: true, title, message, type: input.type, expiresAt: input.expiresAt || undefined };
}
