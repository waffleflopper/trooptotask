import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { establishIdentitySession } from '$features/identity/index.server';

function reply(body: { ok: true } | { error: string }, status: number) {
	return json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return reply({ error: 'Provide valid session tokens and an authentication flow.' }, 400);
	}
	const result = await establishIdentitySession(cookies, body);
	switch (result) {
		case 'ready':
			return reply({ ok: true }, 200);
		case 'malformed':
			return reply({ error: 'Provide valid session tokens and an authentication flow.' }, 400);
		case 'invalid':
			return reply({ error: 'This session is invalid or expired. Open a fresh link.' }, 401);
		case 'unavailable':
			return reply({ error: 'Unable to verify this session. Please try again.' }, 503);
	}
};
