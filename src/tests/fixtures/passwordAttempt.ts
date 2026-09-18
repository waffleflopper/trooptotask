import { beforeEach, vi } from 'vitest';
import type { PasswordAttempt } from '$lib/server/passwordCompletion';

// A controlled persistence port for route tests. SQL/provider tests separately
// establish atomic commit and fencing; the route must obey these stored facts.
export const attemptStore = {
	row: null as (PasswordAttempt & { actor: string; session: string }) | null,
	committed: true,
	unavailable: false,
	rpc: vi.fn(async (_name: string, args: Record<string, string | null>) => {
		if (attemptStore.unavailable) return { error: { message: 'private database failure' }, data: null };
		let row = attemptStore.row;
		if (
			args.p_action === 'restart' &&
			row &&
			(row.state === 'failed' ||
				(row.state === 'complete' && !args.p_flow) ||
				(row.session !== args.p_session && row.expiresAt <= Date.now() / 1000))
		) {
			attemptStore.row = null;
			row = null;
		}
		let acquired = false;
		if (!row && args.p_action === 'begin') {
			row = {
				actor: args.p_actor!,
				session: args.p_session!,
				id: '00000000-0000-4000-8000-000000000099',
				state: 'started',
				flow: args.p_flow as PasswordAttempt['flow'],
				expiresAt: Date.parse(args.p_expires_at!) / 1000,
				acquired: false
			};
			attemptStore.row = row;
			acquired = true;
		}
		if (!row || row.actor !== args.p_actor) return { data: { state: null }, error: null };
		if (
			row.session !== args.p_session ||
			row.expiresAt <= Date.now() / 1000 ||
			(row.flow !== args.p_flow && !(row.state === 'complete' && !args.p_flow))
		)
			return { data: { state: 'expired' }, error: null };
		if (args.p_action === 'reconcile' && row.state === 'started')
			row.state = attemptStore.committed ? 'pending' : 'failed';
		if (args.p_action === 'complete' && row.state === 'pending') row.state = 'complete';
		return { data: { ...row, acquired }, error: null };
	})
};
beforeEach(() => {
	attemptStore.row = null;
	attemptStore.committed = true;
	attemptStore.unavailable = false;
	attemptStore.rpc.mockClear();
});
