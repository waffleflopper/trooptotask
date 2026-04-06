import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';

interface FeedbackItem {
	id: string;
	user_email: string;
	category: string;
	message: string;
	created_at: string;
	organization_name: string | null;
	page_url: string | null;
	status: 'new' | 'reviewed' | 'resolved';
	admin_notes: string | null;
}

export const load: PageServerLoad = loadWithAdminContext({
	page: 'feedback',
	fn: async (ctx) => {
		const { adminClient } = ctx;

		const { data: feedback, error: fetchError } = await selectAllSupabaseRows<FeedbackItem>(
			(from, to) =>
				adminClient
					.from('beta_feedback')
					.select('*')
					.order('created_at', { ascending: false })
					.range(from, to) as unknown as Promise<{
					data: FeedbackItem[] | null;
					error: unknown;
				}>
		);

		if (fetchError) {
			console.error('Failed to fetch feedback:', fetchError);
		}

		const all: FeedbackItem[] = (feedback ?? []).map((item) => ({
			id: item.id,
			user_email: item.user_email,
			category: item.category,
			message: item.message,
			created_at: item.created_at,
			organization_name: item.organization_name,
			page_url: item.page_url,
			status: item.status,
			admin_notes: item.admin_notes
		}));

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
