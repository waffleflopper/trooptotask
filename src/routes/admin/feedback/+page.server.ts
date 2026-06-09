import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformFeedback } from '$lib/server/adapters/supabasePlatformFeedback';
import type { PlatformFeedbackItem, PlatformFeedbackStatus } from '$lib/server/core/useCases/platformFeedback';

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

function toPageFeedbackItem(item: PlatformFeedbackItem): FeedbackItem {
	return {
		id: item.id,
		user_email: item.userEmail,
		category: item.category,
		message: item.message,
		created_at: item.createdAt,
		organization_name: item.organizationName,
		page_url: item.pageUrl,
		status: item.status,
		admin_notes: item.adminNotes
	};
}

export const load: PageServerLoad = loadWithAdminContext({
	page: 'feedback',
	fn: async (ctx) => {
		const all = (await createSupabasePlatformFeedback(ctx).list()).map(toPageFeedbackItem);

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
			const formData = await event.request.formData();
			const feedbackId = String(formData.get('feedbackId') ?? '');
			const statusValue = formData.get('status');
			const adminNotesValue = formData.get('adminNotes');

			if (!feedbackId) return fail(400, { error: 'Missing feedback ID' });
			if (statusValue && !['new', 'reviewed', 'resolved'].includes(String(statusValue))) {
				return fail(400, { error: 'Invalid status' });
			}

			const updateData: {
				id: string;
				status?: PlatformFeedbackStatus;
				adminNotes?: string;
			} = { id: feedbackId };
			if (statusValue) updateData.status = String(statusValue) as PlatformFeedbackStatus;
			if (adminNotesValue !== null) updateData.adminNotes = String(adminNotesValue) || '';

			try {
				const result = await createSupabasePlatformFeedback(ctx).update(updateData);
				if (result.status === 'not_found') {
					// The seam intentionally turns a missing feedback row into an explicit admin error.
					return fail(404, { error: 'Feedback not found' });
				}
			} catch (error) {
				console.error('Failed to update feedback:', error);
				return fail(500, { error: 'Failed to update feedback' });
			}

			return { success: true };
		}
	})
};
