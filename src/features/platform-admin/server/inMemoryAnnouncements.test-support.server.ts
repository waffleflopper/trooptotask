import type { PlatformAnnouncement } from '../announcementTypes';
import type {
	PlatformAnnouncementStoreCreateInput,
	PlatformAnnouncementSetActiveInput,
	PlatformAnnouncementSetActiveUpdate,
	PlatformAnnouncementsStore
} from './announcements.server';

interface InMemoryPlatformAnnouncementsOptions {
	announcements?: PlatformAnnouncement[];
	idFactory?: () => string;
	now?: () => Date;
	createError?: Error;
}

function cloneAnnouncement(announcement: PlatformAnnouncement): PlatformAnnouncement {
	return { ...announcement };
}

export function createInMemoryPlatformAnnouncementsStore(
	options: InMemoryPlatformAnnouncementsOptions = {}
): PlatformAnnouncementsStore {
	const announcements = new Map<string, PlatformAnnouncement>();
	for (const announcement of options.announcements ?? []) {
		announcements.set(announcement.id, cloneAnnouncement(announcement));
	}
	const idFactory = options.idFactory ?? (() => crypto.randomUUID());
	const now = options.now ?? (() => new Date());

	return {
		async listAnnouncements() {
			return Array.from(announcements.values())
				.map(cloneAnnouncement)
				.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
		},

		async createAnnouncement(input: PlatformAnnouncementStoreCreateInput) {
			if (options.createError) throw options.createError;
			const announcement: PlatformAnnouncement = {
				id: idFactory(),
				title: input.title,
				message: input.message,
				type: input.type,
				isActive: input.isActive,
				createdAt: now().toISOString(),
				expiresAt: input.expiresAt ?? null
			};
			announcements.set(announcement.id, announcement);
			return cloneAnnouncement(announcement);
		},

		async setAnnouncementActive(
			input: PlatformAnnouncementSetActiveInput
		): Promise<PlatformAnnouncementSetActiveUpdate | null> {
			const existing = announcements.get(input.id);
			if (!existing) return null;
			announcements.set(input.id, { ...existing, isActive: input.isActive });
			return { id: input.id, isActive: input.isActive };
		},

		async deleteAnnouncement(id: string) {
			announcements.delete(id);
		}
	};
}
