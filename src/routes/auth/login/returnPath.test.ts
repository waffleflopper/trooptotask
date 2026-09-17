import { describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { actions, load } from './+page.server';

vi.mock('$lib/server/auditLog', () => ({ auditLog: vi.fn() }));

const DESTINATION = '/org/alpha/calendar?view=month&label=A%26B#today';

function loginRequest(next: FormDataEntryValue, mfa = false) {
	const form = new FormData();
	form.set('email', 'owner@example.test');
	form.set('password', 'synthetic-password');
	form.set('next', next);
	const auth = {
		signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
		mfa: {
			getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
				data: { currentLevel: 'aal1', nextLevel: mfa ? 'aal2' : 'aal1' },
				error: null
			})
		}
	};
	const run = () =>
		actions.login({
			request: new Request('http://app.invalid/auth/login?/login', { method: 'POST', body: form }),
			locals: { supabase: { auth } }
		} as unknown as Parameters<typeof actions.login>[0]);
	return { auth, run };
}

describe('login return-path handoff', () => {
	it.each([false, true])('carries the full continuation through login (MFA required: %s)', async (mfa) => {
		const url = new URL('http://app.invalid/auth/login?reauth=1');
		url.searchParams.set('next', DESTINATION);
		const data = await load({ url, locals: { session: null } } as Parameters<typeof load>[0]);
		expect(data).toMatchObject({ nextPath: DESTINATION });
		const next = (data as { nextPath: string }).nextPath;
		try {
			await loginRequest(next, mfa).run();
			throw new Error('Expected a redirect after successful login');
		} catch (result) {
			if (!isRedirect(result)) throw result;
			expect(result.status).toBe(303);
			if (mfa) {
				const destination = new URL(result.location, 'http://app.invalid');
				expect(destination.pathname).toBe('/auth/mfa-verify');
				expect([...destination.searchParams]).toEqual([['next', DESTINATION]]);
				expect(destination.hash).toBe('');
			} else expect(result.location).toBe(DESTINATION);
		}
	});

	it.each([false, true])(
		'rejects forged form destinations without trusting the loader (MFA required: %s)',
		async (mfa) => {
			for (const next of [
				'https://external.invalid/phish',
				'/a/..//external.invalid',
				new File(['//external.invalid'], 'next.txt')
			]) {
				await expect(loginRequest(next, mfa).run()).rejects.toMatchObject({
					status: 303,
					location: mfa ? '/auth/mfa-verify' : '/dashboard'
				});
			}
		}
	);

	it('preserves a safe continuation across rejected credentials and retry', async () => {
		const request = loginRequest(DESTINATION, true);
		request.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid credentials' } });
		const rejected = await request.run();
		expect(rejected).toMatchObject({ status: 400, data: { nextPath: DESTINATION } });
		expect(request.auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
		await expect(request.run()).rejects.toMatchObject({
			status: 303,
			location: `/auth/mfa-verify?next=${encodeURIComponent(DESTINATION)}`
		});
	});

	it.each([
		{ authFlow: 'recovery', mfaPending: true, expected: '/auth/reset-password' },
		{ authFlow: 'invite', mfaPending: true, expected: '/auth/accept-invite' },
		{ authFlow: null, mfaPending: true, expected: '/auth/mfa-verify' },
		{ authFlow: null, mfaPending: false, expected: '/dashboard' }
	])('keeps $expected admission ahead of a supplied next path', async ({ authFlow, mfaPending, expected }) => {
		const url = new URL('http://app.invalid/auth/login');
		url.searchParams.set('next', '/admin');
		await expect(
			load({
				url,
				locals: { session: { user: { id: 'synthetic-user' } }, authFlow, mfaPending }
			} as Parameters<typeof load>[0])
		).rejects.toMatchObject({ status: 303, location: expected });
	});
});
