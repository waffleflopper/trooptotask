import { patchUserOrgPreferences } from '$features/identity/index.server';
import { createRequestAccountPreferencesProvider, rethrowOrWrap } from '$lib/server/adapters/httpAdapter';
import { buildRouteRequest } from '$lib/server/adapters/requestContexts.server';
import { error, json } from '@sveltejs/kit';

export const PATCH = async (event) => {
	try {
		const ctx = await buildRouteRequest(event);

		let rawInput: unknown;
		try {
			rawInput = await event.request.json();
		} catch {
			throw error(400, 'Invalid JSON in request body');
		}

		const result = await patchUserOrgPreferences(
			{
				...createRequestAccountPreferencesProvider(event.locals),
				auth: ctx.auth,
				audit: ctx.audit
			},
			rawInput
		);

		return json(result);
	} catch (err) {
		rethrowOrWrap(err);
	}
};
