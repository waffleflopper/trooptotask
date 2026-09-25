import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { MfaChallengeResponse } from '$features/identity/contracts';
import { verifyIdentityMfa } from '$features/identity/index.server';

function reply(body: MfaChallengeResponse, status: number) {
	return json(body, { status });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const body: unknown = await request.json().catch(() => null);
	const code = body && typeof body === 'object' && 'code' in body ? body.code : undefined;
	const result = await verifyIdentityMfa(locals, code);
	switch (result) {
		case 'verified':
			return reply({ ok: true }, 200);
		case 'invalid':
			return reply({ error: 'Enter the 6-digit code from your authenticator app.' }, 400);
		case 'no-factor':
			return reply({ error: 'No verified MFA factor found.' }, 400);
		case 'factors-unavailable':
			return reply({ error: 'Unable to verify MFA factors. Try again.' }, 503);
		case 'denied':
			return reply({ error: 'Invalid authentication code. Try again.' }, 401);
		case 'unconfirmed':
			return reply({ error: 'Unable to verify the MFA code. Try again.' }, 503);
		case 'unavailable':
			return reply({ error: 'Unable to verify MFA. Try again.' }, 503);
	}
};
