import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readIdentityMfaStatus } from '$features/identity/index.server';

export const GET: RequestHandler = async ({ locals }) => {
	const result = await readIdentityMfaStatus(locals);
	switch (result.status) {
		case 'ready':
			return json(result.assurance);
		case 'denied':
			return json({ error: 'Unable to verify your session. Please sign in again.' }, { status: 401 });
		case 'unavailable':
			return json({ error: 'Unable to verify authentication status.' }, { status: 503 });
	}
};
