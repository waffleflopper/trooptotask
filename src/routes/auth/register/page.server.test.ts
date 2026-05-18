import { describe, expect, it } from 'vitest';
import { actions, load } from './+page.server';

describe('register route deprecation', () => {
	it('preserves useful URL context without treating invite codes as beta setup', async () => {
		const result = await load({
			locals: { session: null },
			url: new URL('http://localhost/auth/register?code=legacy-code&email=Person@Example.com')
		} as Parameters<typeof load>[0]);

		expect(result).toEqual({
			email: 'Person@Example.com',
			hadInviteCode: true
		});
	});

	it('rejects legacy invite-code registration posts', async () => {
		const result = await actions.default({} as Parameters<(typeof actions)['default']>[0]);

		expect(result).toMatchObject({
			status: 410,
			data: {
				error: expect.stringContaining('Invite-code registration is no longer used')
			}
		});
	});
});
