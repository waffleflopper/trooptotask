export interface PlatformAnnouncement {
	id: string;
	title: string;
	message: string;
	type: string;
	isActive: boolean;
	createdAt: string;
	expiresAt: string | null;
}

export interface PlatformAnnouncementCreateInput {
	title: string;
	message: string;
	type: string;
	expiresAt?: string | null;
}

export interface PlatformAnnouncementStoreCreateInput extends PlatformAnnouncementCreateInput {
	isActive: boolean;
	createdBy: string;
}

export interface PlatformAnnouncementToggleInput {
	id: string;
	updatedBy: string;
}

export interface PlatformAnnouncementToggleUpdate {
	id: string;
	isActive: boolean;
}

export interface PlatformAnnouncementsStore {
	listAnnouncements(): Promise<PlatformAnnouncement[]>;
	createAnnouncement(input: PlatformAnnouncementStoreCreateInput): Promise<PlatformAnnouncement>;
	toggleAnnouncementActive(input: PlatformAnnouncementToggleInput): Promise<PlatformAnnouncementToggleUpdate | null>;
	deleteAnnouncement(id: string): Promise<void>;
}

export interface PlatformAnnouncementsAuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	details?: Record<string, unknown>;
	severity?: 'info' | 'warning' | 'critical';
}

export interface PlatformAnnouncementsDependencies {
	store: PlatformAnnouncementsStore;
	actorUserId: string;
	audit(event: PlatformAnnouncementsAuditEvent): void;
}

export type PlatformAnnouncementToggleResult =
	| { status: 'updated'; id: string; isActive: boolean }
	| { status: 'not_found' };

export interface PlatformAnnouncements {
	list(): Promise<PlatformAnnouncement[]>;
	create(input: PlatformAnnouncementCreateInput): Promise<PlatformAnnouncement>;
	toggleActive(id: string): Promise<PlatformAnnouncementToggleResult>;
	delete(id: string): Promise<{ success: true }>;
}

export function createPlatformAnnouncements(deps: PlatformAnnouncementsDependencies): PlatformAnnouncements {
	return {
		async list() {
			try {
				return await deps.store.listAnnouncements();
			} catch (error) {
				console.error('Failed to load announcements', error);
				return [];
			}
		},

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

		async toggleActive(id) {
			const update = await deps.store.toggleAnnouncementActive({
				id,
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
