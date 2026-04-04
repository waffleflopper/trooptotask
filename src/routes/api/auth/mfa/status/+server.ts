import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { data, error } = await locals.supabase.auth.mfa.getAuthenticatorAssuranceLevel();

	if (error) {
		return json(
			{
				error: error.message
			},
			{ status: 401 }
		);
	}

	return json({
		currentLevel: data?.currentLevel ?? null,
		nextLevel: data?.nextLevel ?? null
	});
};
