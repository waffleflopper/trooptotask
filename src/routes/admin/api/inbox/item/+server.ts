import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { createPlatformInboxOperations } from '$features/platform-admin/index.server';
import { parseInboxItemKey, type InboxDetailResponse } from '$features/platform-admin/inboxTypes';

export const GET: RequestHandler = async (event) => {
	const operations = await createPlatformInboxOperations(event);
	const ref = parseInboxItemKey(event.url.searchParams.get('item'));
	if (!ref) error(400, 'Choose an Inbox item to open.');
	let detail;
	try {
		detail = await operations.detail(ref);
	} catch (cause) {
		console.error('[platform-admin-inbox] detail read failed', cause);
		error(500, 'Unable to load this Inbox item');
	}
	return json((detail ? { status: 'ok', detail } : { status: 'notFound' }) satisfies InboxDetailResponse);
};
