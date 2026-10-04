import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAppShellRequest } from '$lib/server/adapters/appShellRequestDelivery';
import type { DeferredChromePart } from '$features/app-shell/contracts';

const PARTS = new Set<DeferredChromePart>(['notification-count', 'organization-switcher']);

export const GET: RequestHandler = async ({ locals, cookies, params, url }) => {
	const part = url.searchParams.get('part');

	if (!part || !PARTS.has(part as DeferredChromePart)) {
		throw error(400, 'Unknown app shell chrome part');
	}

	const appShell = createAppShellRequest({
		locals,
		cookies,
		orgSegment: params.orgId,
		url
	});

	return json(await appShell.loadDeferredChrome(part as DeferredChromePart));
};
