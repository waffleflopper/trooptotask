import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'feedback',
	fn: async (ctx) => {
		const { adminClient } = ctx;

		const { data: feedback, error: fetchError } = await adminClient
			.from('beta_feedback')
			.select('*')
			.order('created_at', { ascending: false });

		if (fetchError) {
			console.error('Failed to fetch feedback:', fetchError);
		}

		const all = feedback ?? [];

		return {
			newItems: all.filter((f) => f.status === 'new'),
			reviewedItems: all.filter((f) => f.status === 'reviewed'),
			resolvedItems: all.filter((f) => f.status === 'resolved')
		};
	}
});

export const actions: Actions = {
	update: adminAction({
		page: 'feedback',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;
			const formData = await event.request.formData();
			const feedbackId = formData.get('feedbackId') as string;
			const status = formData.get('status') as string;
			const adminNotes = formData.get('adminNotes') as string;

			if (!feedbackId) return fail(400, { error: 'Missing feedback ID' });
			if (status && !['new', 'reviewed', 'resolved'].includes(status)) {
				return fail(400, { error: 'Invalid status' });
			}

			const updateData: Record<string, string> = {};
			if (status) updateData.status = status;
			if (adminNotes !== null) updateData.admin_notes = adminNotes || '';

			const { error: updateErr } = await adminClient.from('beta_feedback').update(updateData).eq('id', feedbackId);

			if (updateErr) {
				console.error('Failed to update feedback:', updateErr);
				return fail(500, { error: 'Failed to update feedback' });
			}

			return { success: true };
		}
	})
};
