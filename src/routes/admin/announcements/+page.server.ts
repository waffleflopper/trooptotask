import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	createPlatformAnnouncementOperations,
	validatePlatformAnnouncement
} from '$features/platform-admin/index.server';
import { validateUUID } from '$lib/server/validation';

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformAnnouncementOperations(event);
	try {
		const announcements = await operations.list();
		return {
			announcements: announcements.map((announcement) => ({
				id: announcement.id,
				title: announcement.title,
				message: announcement.message,
				type: announcement.type,
				is_active: announcement.isActive,
				created_at: announcement.createdAt,
				expires_at: announcement.expiresAt
			}))
		};
	} catch (cause) {
		console.error('Failed to load announcements', cause);
		error(500, 'Internal server error');
	}
};

export const actions: Actions = {
	create: async (event) => {
		const operations = await createPlatformAnnouncementOperations(event);
		const formData = await event.request.formData();
		const validation = validatePlatformAnnouncement({
			title: String(formData.get('title') ?? ''),
			message: String(formData.get('message') ?? ''),
			type: String(formData.get('type') ?? ''),
			expiresAt: formData.get('expiresAt') ? String(formData.get('expiresAt')) : undefined
		});
		if (!validation.valid) return fail(400, { error: validation.error });
		try {
			await operations.create({
				title: validation.title,
				message: validation.message,
				type: validation.type,
				expiresAt: validation.expiresAt ?? null
			});
		} catch (cause) {
			console.error('Failed to create announcement', cause);
			return fail(500, { error: 'Failed to create announcement' });
		}
		return { success: true };
	},
	toggle: async (event) => {
		const operations = await createPlatformAnnouncementOperations(event);
		const formData = await event.request.formData();
		const id = String(formData.get('id') ?? '');
		const isActive = formData.get('isActive');
		if (!validateUUID(id)) return fail(400, { error: 'Invalid announcement ID' });
		if (isActive !== 'true' && isActive !== 'false') return fail(400, { error: 'Invalid announcement state' });
		try {
			const result = await operations.setActive(id, isActive === 'true');
			if (result.status === 'not_found') return fail(404, { error: 'Announcement not found' });
		} catch (cause) {
			console.error('Failed to update announcement', cause);
			return fail(500, { error: 'Failed to update announcement' });
		}
		return { success: true };
	},
	delete: async (event) => {
		const operations = await createPlatformAnnouncementOperations(event);
		const formData = await event.request.formData();
		const id = String(formData.get('id') ?? '');
		if (!validateUUID(id)) return fail(400, { error: 'Invalid announcement ID' });
		try {
			await operations.delete(id);
		} catch (cause) {
			console.error('Failed to delete announcement', cause);
			return fail(500, { error: 'Failed to delete announcement' });
		}
		return { success: true };
	}
};
