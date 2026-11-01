import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReadyAppShellRouteData, createSuspendedAppShellRouteData } from './appShell.test-support';

const { loadShell } = vi.hoisted(() => ({ loadShell: vi.fn() }));
vi.mock('./rootOrgLayoutLoad.server', () => ({ createRootOrgLayoutLoad: () => loadShell }));
import { load } from './+layout.server';

type Event = Parameters<typeof load>[0];
function event(userId = 'user-1', sessionId = '00000000-0000-4000-8000-000000000001', sidebarCookie?: string): Event {
	const user = { id: userId };
	// Admission is already established by loadShell; these are unsigned synthetic metadata claims.
	const claims = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId })).toString('base64url');
	return {
		locals: { user, session: { user, access_token: `synthetic.${claims}.unsigned` } },
		cookies: { get: () => sidebarCookie }
	} as unknown as Event;
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
	it.each([
		[undefined, true],
		['true', true],
		['false', false],
		['garbled', true]
	])('opens the sidebar for saved preference %s: %s', async (cookie, sidebarOpen) => {
		loadShell.mockResolvedValue(createReadyAppShellRouteData());
		await expect(load(event(undefined, undefined, cookie))).resolves.toMatchObject({ sidebarOpen });
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
		expect(await load(request)).toEqual({ ...suspended, identitySessionScope: null, sidebarOpen: true });
	});
});
