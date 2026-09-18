import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

describe('/auth/request-access reviewed entry', () => {
	it('admits an anonymous request for review', async () => {
		await expect(load({ locals: { session: null } } as Parameters<typeof load>[0])).resolves.toBeUndefined();
	});

	it.each([
		{ authFlow: null, mfaPending: false, location: '/dashboard' },
		{ authFlow: null, mfaPending: true, location: '/auth/mfa-verify' },
		{ authFlow: 'invite', mfaPending: true, location: '/auth/accept-invite' },
		{ authFlow: 'recovery', mfaPending: true, location: '/auth/reset-password' }
	] as const)('continues authenticated requests at $location', async ({ location, ...flow }) => {
		await expect(
			load({ locals: { session: { user: { id: 'user-1' } }, ...flow } } as Parameters<typeof load>[0])
		).rejects.toMatchObject({ status: 303, location });
	});
});
