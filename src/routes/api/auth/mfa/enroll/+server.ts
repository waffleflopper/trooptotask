import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { enrollIdentityMfa } from '$features/identity/index.server';

export const POST: RequestHandler = async ({ locals }) => {
	const result = await enrollIdentityMfa(locals);
	switch (result.status) {
		case 'ready':
			return json({ factorId: result.factorId, qrCode: result.qrCode });
		case 'unauthorized':
			return json({ error: 'Please sign in before managing MFA.' }, { status: 401 });
		case 'denied':
			return json({ error: 'Unable to start MFA enrollment. Try again.' }, { status: 400 });
		case 'unavailable':
			return json({ error: 'Unable to start MFA enrollment. Try again.' }, { status: 503 });
	}
};
