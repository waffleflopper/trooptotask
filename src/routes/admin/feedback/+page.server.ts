import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createPlatformFeedbackOperations } from '$features/platform-admin/index.server';
import type { FeedbackItem, FeedbackStatus } from '$features/feedback/contracts';

interface PageFeedbackItem {
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

function toPageFeedbackItem(item: FeedbackItem): PageFeedbackItem {
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

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformFeedbackOperations(event);
	try {
		const all = (await operations.list()).map(toPageFeedbackItem);
		return {
			newItems: all.filter((item) => item.status === 'new'),
			reviewedItems: all.filter((item) => item.status === 'reviewed'),
			resolvedItems: all.filter((item) => item.status === 'resolved')
		};
	} catch (cause) {
		console.error('Failed to load Feedback', cause);
		error(500, 'Internal server error');
	}
};

export const actions: Actions = {
	update: async (event) => {
		const operations = await createPlatformFeedbackOperations(event);
		const formData = await event.request.formData();
		const feedbackId = String(formData.get('feedbackId') ?? '');
		const statusValue = formData.get('status');
		const adminNotesValue = formData.get('adminNotes');
		if (!feedbackId) return fail(400, { error: 'Missing feedback ID' });
		if (statusValue && !['new', 'reviewed', 'resolved'].includes(String(statusValue)))
			return fail(400, { error: 'Invalid status' });
		const updateData: { id: string; status?: FeedbackStatus; adminNotes?: string } = { id: feedbackId };
		if (statusValue) updateData.status = String(statusValue) as FeedbackStatus;
		if (adminNotesValue !== null) updateData.adminNotes = String(adminNotesValue) || '';
		try {
			const result = await operations.update(updateData);
			if (result.status === 'not_found') return fail(404, { error: 'Feedback not found' });
		} catch (cause) {
			console.error('Failed to update feedback:', cause);
			return fail(500, { error: 'Failed to update feedback' });
		}
		return { success: true };
	}
};
