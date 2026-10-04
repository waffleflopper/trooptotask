import { error, json } from '@sveltejs/kit';
import {
	buildRouteContext,
	createRequestAccountPreferencesProvider,
	rethrowOrWrap
} from '$lib/server/adapters/httpAdapter';
import { patchUserOrgPreferences } from '$features/identity/index.server';

export const PATCH = async (event) => {
	try {
		const ctx = await buildRouteContext(event);

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
