import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformAnnouncements } from '$lib/server/adapters/supabasePlatformAnnouncements';
import { validateAnnouncement } from '$lib/server/admin';
import { validateUUID } from '$lib/server/validation';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'announcements',
	fn: async (ctx) => {
		const announcements = await createSupabasePlatformAnnouncements(ctx).list();

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
	}
});

export const actions: Actions = {
	create: adminAction({
		page: 'announcements',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const formData = await event.request.formData();
			const validation = validateAnnouncement({
				title: String(formData.get('title') ?? ''),
				message: String(formData.get('message') ?? ''),
				type: String(formData.get('type') ?? ''),
				expiresAt: formData.get('expiresAt') ? String(formData.get('expiresAt')) : undefined
			});

			if (!validation.valid) {
				return fail(400, { error: validation.error });
			}
			const { title, message, type, expiresAt } = validation;

			try {
				await createSupabasePlatformAnnouncements(ctx).create({
					title,
					message,
					type,
					expiresAt: expiresAt ?? null
				});
			} catch (error) {
				console.error('Failed to create announcement', error);
				return fail(500, { error: 'Failed to create announcement' });
			}

			return { success: true };
		}
	}),

	toggle: adminAction({
		page: 'announcements',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const formData = await event.request.formData();
			const id = String(formData.get('id') ?? '');

			if (!validateUUID(id)) {
				return fail(400, { error: 'Invalid announcement ID' });
			}

			try {
				const result = await createSupabasePlatformAnnouncements(ctx).toggleActive(id);
				if (result.status === 'not_found') {
					return fail(404, { error: 'Announcement not found' });
				}
			} catch (error) {
				console.error('Failed to toggle announcement', error);
				return fail(500, { error: 'Failed to update announcement' });
			}

			return { success: true };
		}
	}),

	delete: adminAction({
		page: 'announcements',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const formData = await event.request.formData();
			const id = String(formData.get('id') ?? '');

			if (!validateUUID(id)) {
				return fail(400, { error: 'Invalid announcement ID' });
			}

			try {
				await createSupabasePlatformAnnouncements(ctx).delete(id);
			} catch (error) {
				console.error('Failed to delete announcement', error);
				return fail(500, { error: 'Failed to delete announcement' });
			}

			return { success: true };
		}
	})
};
