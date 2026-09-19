vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc: attemptStore.rpc }) }));
import { expect, it, vi } from 'vitest';
import { attemptStore } from '../../tests/fixtures/passwordAttempt';
import { passwordSessionToken } from '../../tests/fixtures/passwordSession';
import { passwordAttempt, passwordCompletionState } from './passwordCompletion';
const identity = () =>
	({
		user: { id: 'actor' },
		session: { access_token: passwordSessionToken('actor'), expires_at: Date.now() / 1000 + 60 },
		authFlow: 'invite'
	}) as App.Locals;
it.each(['opaque', 'e30.e30.signature', passwordSessionToken('different')])(
	'denies unusable admitted identity %#',
	async (token) => {
		const locals = identity();
		locals.session!.access_token = token;
		expect(await passwordAttempt(locals, 'begin')).toBe('unavailable');
		expect(attemptStore.rpc).not.toHaveBeenCalled();
	}
);
it.each([
	undefined,
	null,
	{},
	{ data: {}, error: null },
	{ data: { state: 'pending' }, error: null },
	{ data: { state: null }, error: {} }
])('fails closed on malformed persistence %#', async (result) => {
	attemptStore.rpc.mockResolvedValueOnce(result as never);
	expect(await passwordCompletionState(identity())).toBe('unavailable');
});
it('contains a persistence exception without exposing its details', async () => {
	attemptStore.rpc.mockRejectedValueOnce(Error('private credentials'));
	expect(await passwordAttempt(identity())).toBe('unavailable');
});
it('restores stored state without any receipt and passes only bound identity to persistence', async () => {
	const locals = identity();
	await passwordAttempt(locals, 'begin');
	expect(await passwordCompletionState(locals)).toBe('started');
	expect(attemptStore.rpc).toHaveBeenLastCalledWith(
		'password_change_attempt',
		expect.objectContaining({
			p_actor: 'actor',
			p_session: '00000000-0000-4000-8000-000000000001',
			p_flow: 'invite',
			p_action: 'read'
		})
	);
	expect(JSON.stringify(attemptStore.row)).not.toContain(locals.session!.access_token);
});

it.each([
	{ state: 'pending', acquired: true, flow: 'invite' },
	{ state: 'started', acquired: true, flow: 'recovery' }
])('rejects contradictory acquired attempt %#', async (fields) => {
	attemptStore.rpc.mockResolvedValueOnce({
		error: null,
		data: { id: '00000000-0000-4000-8000-000000000099', expiresAt: Date.now() / 1000 + 60, ...fields }
	} as never);
	expect(await passwordAttempt(identity(), 'begin')).toBe('unavailable');
});
it('rejects another attempt returned by a reconciliation call', async () => {
	attemptStore.rpc.mockResolvedValueOnce({
		error: null,
		data: {
			id: '00000000-0000-4000-8000-000000000098',
			expiresAt: Date.now() / 1000 + 60,
			state: 'pending',
			acquired: false,
			flow: 'invite'
		}
	} as never);
	expect(await passwordAttempt(identity(), 'reconcile', '00000000-0000-4000-8000-000000000099')).toBe('unavailable');
});
