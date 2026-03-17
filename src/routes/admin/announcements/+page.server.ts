import { fail, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { getAdminRole, canAccessPage, validateAnnouncement } from '$lib/server/admin';
import { auditLog, getRequestInfo } from '$lib/server/auditLog';
import { validateUUID } from '$lib/server/validation';

export const load: PageServerLoad = async (event) => {
	const { locals } = event;
	const user = locals.user;
	if (!user) error(401, 'Unauthorized');

	const supabase = getAdminClient();
	const role = await getAdminRole(supabase, user.id);
	if (!role || !canAccessPage(role, 'announcements')) {
		error(403, 'Forbidden');
	}

	const { data: announcements, error: err } = await supabase
		.from('platform_announcements')
		.select('*')
		.order('created_at', { ascending: false });

	if (err) {
		console.error('Failed to load announcements');
		error(500, 'Failed to load announcements');
	}

	return {
		announcements: announcements ?? []
	};
};

export const actions: Actions = {
	create: async (event) => {
		const { locals, request } = event;
		const user = locals.user;
		if (!user) error(401, 'Unauthorized');

		const supabase = getAdminClient();
		const role = await getAdminRole(supabase, user.id);
		if (!role || role !== 'super_admin') {
			error(403, 'Forbidden');
		}

		const formData = await request.formData();
		const validation = validateAnnouncement({
			title: String(formData.get('title') ?? ''),
			message: String(formData.get('message') ?? ''),
			type: String(formData.get('type') ?? ''),
			expiresAt: formData.get('expiresAt') ? String(formData.get('expiresAt')) : undefined
		});

		if (!validation.valid) {
			return fail(400, { error: validation.error });
		}

		const { data: announcement, error: err } = await supabase
			.from('platform_announcements')
			.insert({
				title: validation.title,
				message: validation.message,
				type: validation.type,
				is_active: true,
				expires_at: validation.expiresAt ?? null,
				created_by: user.id
			})
			.select()
			.single();

		if (err) {
			console.error('Failed to create announcement');
			return fail(500, { error: 'Failed to create announcement' });
		}

		await auditLog(
			{
				action: 'announcement_create',
				resourceType: 'platform_announcement',
				resourceId: announcement.id,
				details: { title: validation.title, type: validation.type },
				severity: 'info'
			},
			getRequestInfo(event)
		);

		return { success: true };
	},

	toggle: async (event) => {
		const { locals, request } = event;
		const user = locals.user;
		if (!user) error(401, 'Unauthorized');

		const supabase = getAdminClient();
		const role = await getAdminRole(supabase, user.id);
		if (!role || role !== 'super_admin') {
			error(403, 'Forbidden');
		}

		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');

		if (!validateUUID(id)) {
			return fail(400, { error: 'Invalid announcement ID' });
		}

		const { data: existing, error: fetchErr } = await supabase
			.from('platform_announcements')
			.select('id, is_active')
			.eq('id', id)
			.single();

		if (fetchErr || !existing) {
			return fail(404, { error: 'Announcement not found' });
		}

		const newActive = !existing.is_active;

		const { error: updateErr } = await supabase
			.from('platform_announcements')
			.update({ is_active: newActive, updated_by: user.id })
			.eq('id', id);

		if (updateErr) {
			console.error('Failed to toggle announcement');
			return fail(500, { error: 'Failed to update announcement' });
		}

		await auditLog(
			{
				action: newActive ? 'announcement_activate' : 'announcement_deactivate',
				resourceType: 'platform_announcement',
				resourceId: id,
				details: { is_active: newActive },
				severity: 'info'
			},
			getRequestInfo(event)
		);

		return { success: true };
	},

	delete: async (event) => {
		const { locals, request } = event;
		const user = locals.user;
		if (!user) error(401, 'Unauthorized');

		const supabase = getAdminClient();
		const role = await getAdminRole(supabase, user.id);
		if (!role || role !== 'super_admin') {
			error(403, 'Forbidden');
		}

		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');

		if (!validateUUID(id)) {
			return fail(400, { error: 'Invalid announcement ID' });
		}

		const { error: deleteErr } = await supabase.from('platform_announcements').delete().eq('id', id);

		if (deleteErr) {
			console.error('Failed to delete announcement');
			return fail(500, { error: 'Failed to delete announcement' });
		}

		await auditLog(
			{
				action: 'announcement_delete',
				resourceType: 'platform_announcement',
				resourceId: id,
				severity: 'warning'
			},
			getRequestInfo(event)
		);

		return { success: true };
	}
};
