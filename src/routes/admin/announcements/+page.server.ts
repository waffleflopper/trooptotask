import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { validateAnnouncement } from '$lib/server/admin';
import { validateUUID } from '$lib/server/validation';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'announcements',
	fn: async (ctx) => {
		const { adminClient } = ctx;

		const { data: announcements, error: err } = await adminClient
			.from('platform_announcements')
			.select('*')
			.order('created_at', { ascending: false });

		if (err) {
			console.error('Failed to load announcements');
		}

		return {
			announcements: announcements ?? []
		};
	}
});

export const actions: Actions = {
	create: adminAction({
		page: 'announcements',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;
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

			const { data: announcement, error: err } = await adminClient
				.from('platform_announcements')
				.insert({
					title: validation.title,
					message: validation.message,
					type: validation.type,
					is_active: true,
					expires_at: validation.expiresAt ?? null,
					created_by: ctx.adminUser.id
				})
				.select()
				.single();

			if (err) {
				console.error('Failed to create announcement');
				return fail(500, { error: 'Failed to create announcement' });
			}

			ctx.audit({
				action: 'announcement_create',
				resourceType: 'platform_announcement',
				resourceId: announcement.id,
				details: { title: validation.title, type: validation.type },
				severity: 'info'
			});

			return { success: true };
		}
	}),

	toggle: adminAction({
		page: 'announcements',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;
			const formData = await event.request.formData();
			const id = String(formData.get('id') ?? '');

			if (!validateUUID(id)) {
				return fail(400, { error: 'Invalid announcement ID' });
			}

			const { data: existing, error: fetchErr } = await adminClient
				.from('platform_announcements')
				.select('id, is_active')
				.eq('id', id)
				.single();

			if (fetchErr || !existing) {
				return fail(404, { error: 'Announcement not found' });
			}

			const newActive = !existing.is_active;

			const { error: updateErr } = await adminClient
				.from('platform_announcements')
				.update({ is_active: newActive, updated_by: ctx.adminUser.id })
				.eq('id', id);

			if (updateErr) {
				console.error('Failed to toggle announcement');
				return fail(500, { error: 'Failed to update announcement' });
			}

			ctx.audit({
				action: newActive ? 'announcement_activate' : 'announcement_deactivate',
				resourceType: 'platform_announcement',
				resourceId: id,
				details: { is_active: newActive },
				severity: 'info'
			});

			return { success: true };
		}
	}),

	delete: adminAction({
		page: 'announcements',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;
			const formData = await event.request.formData();
			const id = String(formData.get('id') ?? '');

			if (!validateUUID(id)) {
				return fail(400, { error: 'Invalid announcement ID' });
			}

			const { error: deleteErr } = await adminClient.from('platform_announcements').delete().eq('id', id);

			if (deleteErr) {
				console.error('Failed to delete announcement');
				return fail(500, { error: 'Failed to delete announcement' });
			}

			ctx.audit({
				action: 'announcement_delete',
				resourceType: 'platform_announcement',
				resourceId: id,
				severity: 'warning'
			});

			return { success: true };
		}
	})
};
