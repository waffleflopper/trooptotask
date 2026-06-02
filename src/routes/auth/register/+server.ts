import type { RequestHandler } from './$types';
import { sanitizeString } from '$lib/server/validation';

function legacyRegisterRedirect(url: URL): Response {
	const email = sanitizeString(url.searchParams.get('email'), 254);
	const target = email ? `/auth/renew-invite?email=${encodeURIComponent(email)}` : '/auth/request-access';

	return new Response(null, {
		status: 303,
		headers: {
			location: target
		}
	});
}

export const GET: RequestHandler = ({ url }) => legacyRegisterRedirect(url);

export const POST: RequestHandler = ({ url }) => legacyRegisterRedirect(url);
