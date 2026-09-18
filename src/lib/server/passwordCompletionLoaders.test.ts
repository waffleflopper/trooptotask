import { expect, it, vi } from 'vitest';
import { passwordSessionToken } from '../../tests/fixtures/passwordSession';
import { preparePasswordCompletion, writePasswordCompletion } from './passwordCompletion';
import { load as security } from '../../routes/account/security/+page.server';
import { load as recovery } from '../../routes/auth/reset-password/+page.server';
import { load as invite } from '../../routes/auth/accept-invite/+page.server';
vi.mock('$env/dynamic/private', () => ({ env: { ACCOUNT_SETUP_SESSION_SECRET: 'synthetic-receipt-secret' } }));
it.each([
	{ flow: null, load: security },
	{ flow: 'recovery', load: recovery },
	{ flow: 'invite', load: invite }
] as const)(
	'reloads $flow completion without mutating provider or cookies or serializing receipt secrets',
	async ({ flow, load }) => {
		const jar = new Map<string, string>();
		const cookies = {
			get: (name: string) => jar.get(name),
			set: vi.fn((name: string, value: string) => {
				jar.set(name, value);
			}),
			delete: vi.fn()
		};
		const session = {
			user: { id: 'actor' },
			access_token: passwordSessionToken('actor'),
			expires_at: Date.now() / 1000 + 60
		};
		const provider = {
			getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
			mfa: { listFactors: vi.fn().mockResolvedValue({ data: { totp: [] }, error: null }) },
			updateUser: vi.fn(),
			signOut: vi.fn()
		};
		const locals = {
			user: { id: 'actor' },
			session,
			authFlow: flow,
			supabase: { auth: provider }
		} as unknown as App.Locals;
		for (const state of ['pending', 'complete'] as const) {
			writePasswordCompletion(cookies, { ...preparePasswordCompletion(locals), state });
			cookies.set.mockClear();
			const data = await load({ locals, cookies } as unknown as Parameters<typeof security>[0] &
				Parameters<typeof recovery>[0] &
				Parameters<typeof invite>[0]);
			expect(data).toMatchObject({ passwordCompletion: state });
			expect(JSON.stringify(data)).not.toContain(session.access_token);
			expect(JSON.stringify(data)).not.toContain([...jar.values()][0]);
			expect(cookies.set).not.toHaveBeenCalled();
			expect(cookies.delete).not.toHaveBeenCalled();
			expect(provider.updateUser).not.toHaveBeenCalled();
			expect(provider.signOut).not.toHaveBeenCalled();
		}
	}
);
