import type {
	PlatformAnnouncement,
	PlatformAnnouncementStoreCreateInput,
	PlatformAnnouncementToggleInput,
	PlatformAnnouncementToggleUpdate,
	PlatformAnnouncementsStore
} from '$lib/server/core/useCases/platformAnnouncements';

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
				.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

		async toggleAnnouncementActive(
			input: PlatformAnnouncementToggleInput
		): Promise<PlatformAnnouncementToggleUpdate | null> {
			const existing = announcements.get(input.id);
			if (!existing) return null;
			const updated = { ...existing, isActive: !existing.isActive };
			announcements.set(input.id, updated);
			return { id: input.id, isActive: updated.isActive };
		},

		async deleteAnnouncement(id: string) {
			announcements.delete(id);
		}
	};
}
