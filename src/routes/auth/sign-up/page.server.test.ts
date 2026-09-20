import { beforeEach, describe, expect, it, vi } from 'vitest';

import { actions, load } from './+page.server';
import type { PendingAuthFlow } from '$lib/server/mfaGate';

type ActionEvent = Parameters<(typeof actions)['default']>[0];

function event(session: unknown = null, authFlow: PendingAuthFlow = null, mfaPending = false) {
	const signUp = vi.fn();
	const request = new Request('https://trooptotask.test/auth/sign-up?next=https://other.test', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ email: 'synthetic@example.test', password: 'SyntheticPassword123' })
	});
	return {
		request,
		locals: { session, authFlow, mfaPending, supabase: { auth: { signUp } } },
		url: new URL(request.url),
		getClientAddress: vi.fn(() => '192.0.2.1')
	};
}

async function expectRedirect(input: ReturnType<typeof event>, location: string) {
	await expect(load(input as unknown as Parameters<typeof load>[0])).rejects.toMatchObject({ status: 303, location });
	await expect(actions.default(input as unknown as ActionEvent)).rejects.toMatchObject({ status: 303, location });
	expect(input.request.bodyUsed).toBe(false);
	expect(input.locals.supabase.auth.signUp).not.toHaveBeenCalled();
}

describe('reviewed acquisition', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('redirects anonymous GET and POST without accepting credentials or honoring an external next URL', async () => {
		await expectRedirect(event(), '/auth/request-access');
	});

	it('ignores malformed credential payloads because this route only redirects', async () => {
		const input = event();
		input.request = new Request(input.url, { method: 'POST', body: 'not form data' });
		await expectRedirect(input, '/auth/request-access');
	});

	it.each([
		{ authFlow: null, mfaPending: false, location: '/dashboard' },
		{ authFlow: null, mfaPending: true, location: '/auth/mfa-verify' },
		{ authFlow: 'invite', mfaPending: true, location: '/auth/accept-invite' },
		{ authFlow: 'recovery', mfaPending: true, location: '/auth/reset-password' }
	] as const)(
		'preserves authenticated $location continuation on GET and POST',
		async ({ authFlow, mfaPending, location }) => {
			await expectRedirect(event({ user: { id: 'synthetic-user' } }, authFlow, mfaPending), location);
		}
	);
});
