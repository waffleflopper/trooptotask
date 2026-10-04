import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createPlatformAuditOperations } from '$features/platform-admin/index.server';

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformAuditOperations(event);
	const parsedPage = parseInt(event.url.searchParams.get('page') || '1');
	const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
	try {
		return await operations.listLogs({
			page,
			limit: 50,
			action: event.url.searchParams.get('action') || '',
			severity: event.url.searchParams.get('severity') || '',
			orgId: event.url.searchParams.get('org') || ''
		});
	} catch (cause) {
		console.error('Failed to load platform Audit', cause);
		error(500, 'Internal server error');
	}
};
