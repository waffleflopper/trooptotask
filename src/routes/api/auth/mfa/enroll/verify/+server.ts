import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyIdentityMfaEnrollment } from '$features/identity/index.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body: unknown = await request.json().catch(() => null);
	const factorId = body && typeof body === 'object' && 'factorId' in body ? body.factorId : undefined;
	const code = body && typeof body === 'object' && 'code' in body ? body.code : undefined;
	const result = await verifyIdentityMfaEnrollment(locals, factorId, code);
	switch (result) {
		case 'verified':
			return json({ ok: true }, { status: 200 });
		case 'invalid':
			return json({ error: 'A factorId and a 6-digit code are required.' }, { status: 400 });
		case 'factors-unavailable':
			return json({ error: 'Unable to verify pending MFA enrollment. Try again.' }, { status: 503 });
		case 'no-factor':
			return json({ error: 'No pending MFA enrollment found.' }, { status: 400 });
		case 'denied':
			return json({ error: 'Invalid enrollment code. Try again.' }, { status: 401 });
		case 'unavailable':
			return json({ error: 'Unable to confirm MFA enrollment. Try again.' }, { status: 503 });
		case 'unauthorized':
			return json({ error: 'Please sign in before managing MFA.' }, { status: 401 });
	}
};
