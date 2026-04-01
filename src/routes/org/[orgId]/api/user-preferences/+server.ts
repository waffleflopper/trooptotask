import { error, json } from '@sveltejs/kit';
import { buildRouteContext } from '$lib/server/adapters/httpAdapter';
import { patchUserOrgPreferences } from '$lib/server/core/useCases/userPreferences';
import { UserOrgPreferencesPatchSchema } from '$lib/preferences/userPreferences';

function rethrowOrWrap(err: unknown): never {
	if (err && typeof err === 'object' && 'status' in err) {
		throw err;
	}
	throw error(500, 'Internal server error');
}

export const PATCH = async (event) => {
	try {
		const ctx = await buildRouteContext(event);

		let rawInput: unknown;
		try {
			rawInput = await event.request.json();
		} catch {
			throw error(400, 'Invalid JSON in request body');
		}

		const parsed = UserOrgPreferencesPatchSchema.safeParse(rawInput);
		if (!parsed.success) {
			throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
		}

		const result = await patchUserOrgPreferences(
			{
				store: ctx.store,
				auth: ctx.auth,
				audit: ctx.audit
			},
			parsed.data
		);

		return json(result);
	} catch (err) {
		rethrowOrWrap(err);
	}
};
