import { beforeEach, expect, it, vi } from 'vitest';
import { attemptStore } from '../../../tests/fixtures/passwordAttempt';
import { passwordSessionToken } from '../../../tests/fixtures/passwordSession';
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc: attemptStore.rpc }) }));
import { load } from './+page.server';
const event = (authFlow: App.Locals['authFlow']) =>
	({
		locals: {
			user: { id: 'actor' },
			session: { user: { id: 'actor' }, access_token: passwordSessionToken('actor'), expires_at: 4102444800 },
			authFlow
		}
	}) as unknown as Parameters<typeof load>[0];
beforeEach(() => {
	attemptStore.row = {
		actor: 'actor',
		session: '00000000-0000-4000-8000-000000000001',
		id: '00000000-0000-4000-8000-000000000099',
		flow: 'invite',
		state: 'complete',
		expiresAt: 4102444800,
		acquired: false
	};
});
it('restores activation-only retry while the invite remains pending', async () => {
	expect(await load(event('invite'))).toEqual({
		hasSession: true,
		invitePending: true,
		passwordCompletion: 'complete'
	});
});
it('does not present another activation after the pending marker was cleared', async () => {
	expect(await load(event(null))).toEqual({ hasSession: true, invitePending: false, passwordCompletion: null });
});
it('does not use an unverified or mismatched cookie session to offer activation', async () => {
	const h = event('invite');
	h.locals.user = null;
	expect(await load(h)).toEqual({ hasSession: false, invitePending: false, passwordCompletion: null });
});
