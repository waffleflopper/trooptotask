import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

type Locals = { actor: unknown; session: unknown; authFlow: 'recovery' | 'invite' | null; mfaPending: boolean };

const run = async (locals: Locals, path = '/auth/mfa-setup') =>
	load({ locals, url: new URL(`http://localhost${path}`) } as unknown as Parameters<typeof load>[0]);

const redirectOf = (locals: Locals) =>
	run(locals).then(
		() => null,
		(error: { status: number; location: string }) => [error.status, error.location]
	);

describe('GET /auth/mfa-setup', () => {
	const actor = { userId: 'user-1' };

	it('returns to Security after setup unless a safe continuation is given', async () => {
		const full = { actor, session: {}, authFlow: null, mfaPending: false };
		expect(await run(full)).toEqual({ next: '/account/security' });
		expect(await run(full, '/auth/mfa-setup?next=%2Forg%2Falpha%2Fsettings')).toEqual({ next: '/org/alpha/settings' });
		expect(await run(full, '/auth/mfa-setup?next=https%3A%2F%2Fexternal.invalid')).toEqual({
			next: '/account/security'
		});
	});

	it('sends a visitor without a completed session where their sign-in continues', async () => {
		expect(await redirectOf({ actor: null, session: null, authFlow: null, mfaPending: false })).toEqual([
			303,
			'/auth/login'
		]);
		expect(await redirectOf({ actor: null, session: {}, authFlow: null, mfaPending: true })).toEqual([
			303,
			'/auth/mfa-verify'
		]);
		expect(await redirectOf({ actor: null, session: {}, authFlow: 'recovery', mfaPending: false })).toEqual([
			303,
			'/auth/reset-password'
		]);
	});
});
