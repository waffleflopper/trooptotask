import { patchUserOrgPreferences } from '$features/identity/index.server';
import { createRequestAccountPreferencesProvider, readJsonBody, rethrowOrWrap } from '$lib/server/adapters/httpAdapter';
import { buildRouteRequest } from '$lib/server/adapters/requestContexts.server';
import { json } from '@sveltejs/kit';

export const PATCH = async (event) => {
	try {
		const ctx = await buildRouteRequest(event);

		const rawInput = await readJsonBody(event);

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
