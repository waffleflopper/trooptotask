import { beforeEach, expect, it, vi } from 'vitest';
import { setCompletedAuthFlowCookie } from '$features/identity/index.server';

const attemptStore = vi.hoisted(() => {
	const state = {
		row: null as null | {
			actor: string;
			session: string;
			id: string;
			flow: 'recovery' | 'invite';
			state: 'pending' | 'complete';
			expiresAt: number;
			acquired: boolean;
		}
	};
	return {
		state,
		rpc: vi.fn(async (_name: string, args: { p_actor: string; p_session: string; p_flow: string | null }) => {
			const row = state.row;
			if (!row || row.actor !== args.p_actor) return { data: { state: null }, error: null };
			if (row.session !== args.p_session || (row.flow !== args.p_flow && !(row.state === 'complete' && !args.p_flow)))
				return { data: { state: 'expired' }, error: null };
			return { data: row, error: null };
		})
	};
});

vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc: attemptStore.rpc }) }));

import { load } from './+page.server';

beforeEach(() => {
	attemptStore.state.row = null;
	attemptStore.rpc.mockClear();
});

function verifiedToken(method: 'otp' | 'password'): string {
	const claims = {
		sub: 'actor',
		session_id: '00000000-0000-4000-8000-000000000001',
		amr: [{ method }]
	};
	return `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic`;
}

function event(flow: App.Locals['authFlow'], method: 'otp' | 'password' = 'otp') {
	const getSession = vi.fn(() => {
		throw new Error('The reset loader must use hook-verified identity');
	});
	const markers = new Map<string, string>();
	return {
		locals: {
			user: { id: 'actor' } as { id: string } | null,
			session: {
				user: { id: 'actor' },
				access_token: verifiedToken(method),
				expires_at: 4102444800
			},
			authFlow: flow,
			actor: null as { userId: string } | null,
			supabase: { auth: { getSession } }
		},
		cookies: { get: (name: string) => markers.get(name) },
		markComplete() {
			return setCompletedAuthFlowCookie(
				{ set: (name, value) => markers.set(name, value) },
				this.locals.session as never,
				this.locals.user as never
			);
		},
		forgeMarker() {
			markers.set('ttt_pending_auth_flow', 'forged');
		},
		getSession
	};
}

function completedAttempt(flow: 'recovery' | 'invite') {
	attemptStore.state.row = {
		actor: 'actor',
		session: '00000000-0000-4000-8000-000000000001',
		id: '00000000-0000-4000-8000-000000000099',
		flow,
		state: 'complete',
		expiresAt: 4102444800,
		acquired: false
	};
}

it('shows a pending password change to the hook-verified recovery session', async () => {
	completedAttempt('recovery');
	attemptStore.state.row!.state = 'pending';
	const request = event('recovery');
	expect(await load(request as never)).toEqual({ hasSession: true, passwordCompletion: 'pending' });
	expect(request.getSession).not.toHaveBeenCalled();
});

it('restores completed recovery success after the pending marker becomes an admitted OTP session', async () => {
	completedAttempt('recovery');
	const request = event(null);
	expect(request.markComplete()).toBe(true);
	expect(await load(request as never)).toEqual({ hasSession: true, passwordCompletion: 'complete' });
	expect(request.getSession).not.toHaveBeenCalled();
});

it('does not offer reset to an ordinary session, an invite completion, or a forged marker', async () => {
	completedAttempt('recovery');
	const ordinary = event(null, 'password');
	expect(await load(ordinary as never)).toEqual({ hasSession: false, passwordCompletion: null });
	expect(attemptStore.rpc).not.toHaveBeenCalled();

	completedAttempt('invite');
	const invite = event(null);
	expect(invite.markComplete()).toBe(true);
	expect(await load(invite as never)).toEqual({ hasSession: false, passwordCompletion: null });

	completedAttempt('recovery');
	const forged = event(null);
	forged.forgeMarker();
	expect(await load(forged as never)).toEqual({ hasSession: false, passwordCompletion: null });
});

it('denies a missing or mismatched hook identity before reading an attempt', async () => {
	const missing = event('recovery');
	missing.locals.user = null;
	expect(await load(missing as never)).toEqual({ hasSession: false, passwordCompletion: null });
	const mismatch = event('recovery');
	mismatch.locals.session.user.id = 'different-user';
	expect(await load(mismatch as never)).toEqual({ hasSession: false, passwordCompletion: null });
	expect(attemptStore.rpc).not.toHaveBeenCalled();
});
