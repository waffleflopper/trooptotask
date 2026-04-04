import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { factorId } = (await request.json()) as {
		factorId?: string;
	};

	if (!factorId) {
		return json(
			{
				error: 'factorId is required.'
			},
			{ status: 400 }
		);
	}

	const { error } = await locals.supabase.auth.mfa.unenroll({
		factorId
	});

	if (error) {
		return json(
			{
				error: error.message
			},
			{ status: 401 }
		);
	}

	return json({ ok: true });
};
