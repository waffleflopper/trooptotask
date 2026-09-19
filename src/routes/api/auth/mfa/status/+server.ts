import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { data, error } = await locals.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
		if (error) return json({ error: error.message }, { status: 401 });

		if (
			!data ||
			!['aal1', 'aal2'].includes(data.currentLevel ?? '') ||
			!['aal1', 'aal2'].includes(data.nextLevel ?? '')
		) {
			return json({ error: 'Unable to verify authentication status.' }, { status: 503 });
		}

		return json({ currentLevel: data.currentLevel, nextLevel: data.nextLevel });
	} catch {
		return json({ error: 'Unable to verify authentication status.' }, { status: 503 });
	}
};
