import { beforeEach, describe, expect, it, vi } from 'vitest';
import { passwordSessionToken } from '../../../tests/fixtures/passwordSession';
import { createReadyAppShellRouteData, createSuspendedAppShellRouteData } from './appShell.test-support';

const { loadShell } = vi.hoisted(() => ({ loadShell: vi.fn() }));
vi.mock('$lib/server/core/useCases/createRootOrgLayoutLoad', () => ({ createRootOrgLayoutLoad: () => loadShell }));
import { load } from './+layout.server';

type Event = Parameters<typeof load>[0];
function event(userId = 'user-1', sessionId = '00000000-0000-4000-8000-000000000001'): Event {
	const user = { id: userId };
	return {
		locals: { user, session: { user, access_token: passwordSessionToken(userId, 'admitted', sessionId) } }
	} as Event;
}

beforeEach(() => {
	loadShell.mockReset();
});
describe('fresh admitted Organization session composition', () => {
	it('binds each fresh Organization load to its own current session without a root load', async () => {
		const ready = createReadyAppShellRouteData();
		loadShell.mockResolvedValue(ready);
		const first = await load(event());
		const next = await load(event('user-1', '00000000-0000-4000-8000-000000000002'));
		expect(first).toMatchObject({
			...ready,
			identitySessionScope: { userId: 'user-1', sessionId: '00000000-0000-4000-8000-000000000001' }
		});
		expect(next).toMatchObject({
			...ready,
			identitySessionScope: { userId: 'user-1', sessionId: '00000000-0000-4000-8000-000000000002' }
		});
	});
	it.each(['missing-session', 'wrong-account', 'invalid-binding'] as const)(
		'fails ready shell recoverably for %s',
		async (kind) => {
			loadShell.mockResolvedValue(createReadyAppShellRouteData());
			const request = event(kind === 'wrong-account' ? 'other-user' : 'user-1');
			if (kind === 'missing-session') request.locals.session = null;
			if (kind === 'invalid-binding') request.locals.session!.access_token = 'unbound';
			await expect(load(request)).rejects.toMatchObject({
				status: 503,
				body: { message: 'Workspace session unavailable. Refresh or sign in again.' }
			});
		}
	);
	it('preserves suspended contact without inventing an active account scope', async () => {
		const suspended = createSuspendedAppShellRouteData();
		loadShell.mockResolvedValue(suspended);
		const request = event();
		request.locals.user = null;
		request.locals.session = null;
		expect(await load(request)).toEqual({ ...suspended, identitySessionScope: null });
	});
});
