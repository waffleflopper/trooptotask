import { expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc }) }));
import { load as security } from '../account/security/+page.server';
import { load as recovery } from './reset-password/+page.server';
import { load as invite } from './accept-invite/+page.server';
it.each([
	{ flow: null, load: security },
	{ flow: 'recovery', load: recovery },
	{ flow: 'invite', load: invite }
] as const)(
	'reloads $flow completion without mutating provider or cookies or serializing attempt identifiers',
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
			// Synthetic claims at the already-verified hook boundary.
			access_token: `synthetic.${Buffer.from(JSON.stringify({ sub: 'actor', session_id: '00000000-0000-4000-8000-000000000001' })).toString('base64url')}.signature`,
			expires_at: Date.now() / 1000 + 60
		};
		const provider = {
			getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
			mfa: { listFactors: vi.fn().mockResolvedValue({ data: { totp: [] }, error: null }) },
			updateUser: vi.fn(),
			signOut: vi.fn()
		};
		const locals = {
			actor: flow === null ? { userId: 'actor' } : null,
			user: { id: 'actor' },
			session,
			authFlow: flow,
			supabase: { auth: provider }
		} as unknown as App.Locals;
		const attemptId = '00000000-0000-4000-8000-000000000099';
		for (const state of ['started', 'pending', 'complete', 'failed'] as const) {
			// Arrange independently stored facts; reload must read them without starting a mutation.
			rpc.mockReset().mockResolvedValue({
				data: { id: attemptId, state, flow, expiresAt: session.expires_at, acquired: false },
				error: null
			});
			cookies.set.mockClear();
			const data = await load({ locals, cookies } as unknown as Parameters<typeof security>[0] &
				Parameters<typeof recovery>[0] &
				Parameters<typeof invite>[0]);
			expect(data).toMatchObject({ passwordCompletion: state });
			expect(JSON.stringify(data)).not.toContain(session.access_token);
			expect(JSON.stringify(data)).not.toContain(attemptId);
			expect(rpc).toHaveBeenCalledExactlyOnceWith(
				'password_change_attempt',
				expect.objectContaining({ p_action: 'read' })
			);
			expect(cookies.set).not.toHaveBeenCalled();
			expect(cookies.delete).not.toHaveBeenCalled();
			expect(provider.updateUser).not.toHaveBeenCalled();
			expect(provider.signOut).not.toHaveBeenCalled();
		}
	}
);
