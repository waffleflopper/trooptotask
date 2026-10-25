import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	createPlatformPeopleOperations,
	createPlatformAccessRequestOperations,
	mapResendSetupResult,
	mapRescindSetupResult
} from '$features/platform-admin/index.server';
import { validateUUID } from '$lib/server/validation';

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformPeopleOperations(event);
	if (!validateUUID(event.params.requestId)) error(400, 'Invalid request ID');
	const request = await operations.request(event.params.requestId);
	if (!request || request.status !== 'approved' || request.setup_completed_at || !request.setup_grant_live)
		error(404, 'Approved request not found');
	return { request, breadcrumbLabel: request.name, setupTimeline: operations.setupTimeline(request.id) };
};
export const actions: Actions = {
	resendSetup: async (event) => {
		const operations = await createPlatformAccessRequestOperations(event);
		if (!validateUUID(event.params.requestId)) return fail(400, { error: 'Invalid request ID' });
		return mapResendSetupResult(await operations.resendSetup(event.params.requestId));
	},
	rescindAccess: async (event) => {
		const operations = await createPlatformAccessRequestOperations(event);
		if (!validateUUID(event.params.requestId)) return fail(400, { error: 'Invalid request ID' });
		return mapRescindSetupResult(await operations.rescind(event.params.requestId));
	}
};
