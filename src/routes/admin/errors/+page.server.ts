import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { parseErrorPage, parseErrorStatus } from '$features/platform-admin/errorTypes';
import { createPlatformErrorOperations } from '$features/platform-admin/index.server';
import { validateUUID } from '$lib/server/validation';

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformErrorOperations(event);
	event.depends('admin:errors');
	const status = parseErrorStatus(event.url.searchParams.get('status'));
	const page = parseErrorPage(event.url.searchParams.get('page'));
	return { status, page, adminUserId: operations.adminUserId, errors: operations.list({ status, page }) };
};

export const actions: Actions = {
	resolve: async (event) => {
		const operations = await createPlatformErrorOperations(event);
		const id = String((await event.request.formData()).get('id') ?? '');
		if (!validateUUID(id)) return fail(400, { error: 'Invalid error ID' });
		try {
			const result = await operations.resolve(id);
			if (result.status === 'not_open') return fail(409, { error: 'This error is already resolved.' });
		} catch (cause) {
			console.error('Failed to resolve error', cause);
			return fail(500, { error: 'Could not resolve this error. Reload before trying again.' });
		}
		return { success: true };
	}
};
