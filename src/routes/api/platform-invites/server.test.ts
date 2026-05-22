import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

function makeInsertInviteResult() {
	const single = vi.fn().mockResolvedValue({
		data: {
			id: 'invite-1',
			code: 'ABCDEFGH',
			email: 'soldier@example.mil',
			expires_at: '2026-06-01T12:00:00.000Z'
		},
		error: null
	});
	const select = vi.fn(() => ({ single }));
	const insert = vi.fn(() => ({ select }));

	return { insert, select, single };
}

describe('POST /api/platform-invites', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('uses the configured public app origin for generated registration invite URLs', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.org');
		const inviteInsert = makeInsertInviteResult();
		const locals = {
			user: { id: 'user-1' },
			supabase: {
				from: vi.fn((table: string) => {
					if (table !== 'registration_invites') {
						throw new Error(`Unexpected table ${table}`);
					}
					return {
						insert: inviteInsert.insert
					};
				})
			}
		};

		const response = await POST({
			request: new Request('https://evil.example/api/platform-invites', {
				method: 'POST',
				body: JSON.stringify({ email: 'Soldier@Example.mil', expiresInDays: 7 })
			}),
			locals,
			url: new URL('https://evil.example/api/platform-invites')
		} as unknown as Parameters<typeof POST>[0]);

		const body = await response.json();

		expect(body.registrationUrl).toMatch(
			/^https:\/\/trooptotask\.org\/auth\/register\?code=[A-Z2-9]{8}&email=Soldier%40Example\.mil$/
		);
		expect(inviteInsert.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				email: 'soldier@example.mil',
				created_by: 'user-1'
			})
		);
	});
});
