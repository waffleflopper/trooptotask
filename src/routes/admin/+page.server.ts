import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	createPlatformAccessRequestOperations,
	createPlatformInboxOperations,
	mapApproveResult,
	mapRejectResult
} from '$features/platform-admin/index.server';
import { parseInboxTab } from '$features/platform-admin/inboxTypes';
import { validateUUID } from '$lib/server/validation';

const MAX_REJECTION_REASON_LENGTH = 500;

async function readItemForm(event: {
	request: Request;
}): Promise<{ id: string; formData: FormData } | { failure: ReturnType<typeof fail> }> {
	const formData = await event.request.formData();
	const value = formData.get('id');
	if (typeof value !== 'string' || !value.trim()) return { failure: fail(400, { error: 'Missing item ID' }) };
	if (!validateUUID(value)) return { failure: fail(400, { error: 'Invalid item ID' }) };
	return { id: value, formData };
}

/** The queue and its stats stream in parallel; each settles to its own result, so one failed read never blanks the rest. */
export const load: PageServerLoad = async (event) => {
	event.depends('admin:inbox');
	const operations = await createPlatformInboxOperations(event);
	const tab = parseInboxTab(event.url.searchParams.get('tab'));
	return { tab, stats: operations.stats(), sources: operations.queue(tab) };
};

export const actions: Actions = {
	approve: async (event) => {
		const operations = await createPlatformAccessRequestOperations(event);
		const parsed = await readItemForm(event);
		if ('failure' in parsed) return parsed.failure;
		return mapApproveResult(await operations.approve(parsed.id));
	},

	reject: async (event) => {
		const operations = await createPlatformAccessRequestOperations(event);
		const parsed = await readItemForm(event);
		if ('failure' in parsed) return parsed.failure;
		const reason = String(parsed.formData.get('reason') ?? '').trim();
		if (reason.length > MAX_REJECTION_REASON_LENGTH)
			return fail(400, { error: `Keep the reason under ${MAX_REJECTION_REASON_LENGTH} characters.` });
		return mapRejectResult(await operations.reject(parsed.id, reason || null));
	},

	close: async (event) => {
		const operations = await createPlatformInboxOperations(event);
		const parsed = await readItemForm(event);
		if ('failure' in parsed) return parsed.failure;
		try {
			const outcome = await operations.closeFeedback(parsed.id);
			if (outcome === 'not_open') return fail(404, { error: 'This feedback was already closed or no longer exists.' });
		} catch (cause) {
			console.error('[platform-admin-inbox] close feedback failed', cause);
			return fail(500, {
				error: 'Could not confirm the close. Reload this item to see where it stands before trying again.'
			});
		}
		return { success: true, action: 'close' };
	}
};
