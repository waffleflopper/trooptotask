import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { disableIdentityMfa } from '$features/identity/index.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body: unknown = await request.json().catch(() => null);
	const code = body && typeof body === 'object' && 'code' in body ? body.code : undefined;
	const result = await disableIdentityMfa(locals, code);
	switch (result) {
		case 'disabled':
			return json({ ok: true }, { status: 200 });
		case 'invalid':
			return json({ error: 'Enter the 6-digit code from your authenticator app.' }, { status: 400 });
		case 'factors-unavailable':
			return json({ error: 'Unable to verify MFA factors. Try again.' }, { status: 503 });
		case 'no-factor':
			return json({ error: 'No verified MFA factor found.' }, { status: 400 });
		case 'challenge-denied':
			return json({ error: 'Invalid authenticator code. Try again.' }, { status: 401 });
		case 'challenge-unavailable':
			return json({ error: 'Unable to verify the MFA code. Try again.' }, { status: 503 });
		case 'removal-denied':
			return json({ error: 'Unable to disable MFA. Reload to check its status before retrying.' }, { status: 401 });
		case 'removal-unconfirmed':
			return json({ error: 'Unable to confirm MFA removal. Reload to check its status.' }, { status: 503 });
		case 'unavailable':
			return json({ error: 'Unable to disable MFA. Reload to check its status before retrying.' }, { status: 503 });
		case 'unauthorized':
			return json({ error: 'Please sign in before managing MFA.' }, { status: 401 });
	}
};
