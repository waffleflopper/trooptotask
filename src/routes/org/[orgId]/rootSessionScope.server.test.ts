import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReadyAppShellRouteData, createSuspendedAppShellRouteData } from './appShell.test-support';

const { loadShell } = vi.hoisted(() => ({ loadShell: vi.fn() }));
vi.mock('./rootOrgLayoutLoad.server', () => ({ createRootOrgLayoutLoad: () => loadShell }));
import { load } from './+layout.server';

type Event = Parameters<typeof load>[0];
function cookieJar(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	const writes: Array<{ name: string; value: string }> = [];
	return {
		writes,
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => {
			values.set(name, value);
			writes.push({ name, value });
		}
	};
}

function event(
	userId = 'user-1',
	sessionId = '00000000-0000-4000-8000-000000000001',
	sidebarCookie?: string,
	cookies = cookieJar(sidebarCookie === undefined ? {} : { 'sidebar:state': sidebarCookie })
): Event {
	const user = { id: userId };
	// Admission is already established by loadShell; these are unsigned synthetic metadata claims.
	const claims = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId })).toString('base64url');
	return {
		locals: { user, session: { user, access_token: `synthetic.${claims}.unsigned` } },
		cookies
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

describe('last Organization memory', () => {
	it('records the opened Organization for the signed-in person once, not on every reload', async () => {
		loadShell.mockResolvedValue(createReadyAppShellRouteData({ orgId: 'org-9', userId: 'user-1' }));
		const cookies = cookieJar();

		await load(event('user-1', undefined, undefined, cookies));
		await load(event('user-1', undefined, undefined, cookies));

		expect(cookies.writes).toEqual([{ name: 'last_organization', value: 'user-1:org-9' }]);
	});

	it('moves the memory when a different Organization is opened', async () => {
		const cookies = cookieJar({ last_organization: 'user-1:org-1' });
		loadShell.mockResolvedValue(createReadyAppShellRouteData({ orgId: 'org-2', userId: 'user-1' }));

		await load(event('user-1', undefined, undefined, cookies));

		expect(cookies.get('last_organization')).toBe('user-1:org-2');
	});

	it('does not remember a suspended Organization', async () => {
		const cookies = cookieJar();
		loadShell.mockResolvedValue(createSuspendedAppShellRouteData());
		const request = event('user-1', undefined, undefined, cookies);
		request.locals.user = null;
		request.locals.session = null;

		await load(request);

		expect(cookies.writes).toEqual([]);
	});
});
