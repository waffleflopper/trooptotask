import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError, isRedirect, type RequestEvent } from '@sveltejs/kit';
import { adminAction, adminHandle, loadWithAdminContext } from './adminAdapter';

const { lookupRole } = vi.hoisted(() => ({ lookupRole: vi.fn() }));
vi.mock('$lib/server/admin', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/admin')>()),
	getAdminRole: lookupRole
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({}) }));

function event(userId: string | null = 'admin-1'): RequestEvent {
	return {
		locals: { user: userId ? { id: userId } : null, supabase: {}, session: null },
		request: new Request('https://app.example.test/admin/audit'),
		getClientAddress: () => '127.0.0.1'
	} as RequestEvent;
}

beforeEach(() => lookupRole.mockReset());

describe('admin HTTP authorization', () => {
	for (const [name, wrap] of [
		['page', (fn: () => Promise<void>) => loadWithAdminContext({ page: 'audit', fn })],
		['action', (fn: () => Promise<void>) => adminAction({ page: 'audit', fn })],
		['API', (fn: () => Promise<void>) => async (request: RequestEvent) => adminHandle({ page: 'audit', fn })(request)]
	] as const) {
		it.each([null, 'support'])(`${name} returns an HTTP 403 before protected work for role %s`, async (role) => {
			lookupRole.mockResolvedValue(role);
			const protectedWork = vi.fn();
			const caught = await wrap(protectedWork)(event()).catch((err: unknown) => err);
			expect(isHttpError(caught, 403)).toBe(true);
			expect(protectedWork).not.toHaveBeenCalled();
		});
	}

	it('returns an HTTP 403 for a page-specific role restriction before loading data', async () => {
		lookupRole.mockResolvedValue('support');
		const protectedWork = vi.fn();
		const caught = await loadWithAdminContext({ requiredRole: 'super_admin', fn: protectedWork })(event()).catch(
			(err: unknown) => err
		);
		expect(isHttpError(caught, 403)).toBe(true);
		expect(protectedWork).not.toHaveBeenCalled();
	});

	it('keeps the login redirect for an unauthenticated request', async () => {
		const protectedWork = vi.fn();
		const caught = await loadWithAdminContext({ page: 'audit', fn: protectedWork })(event(null)).catch(
			(err: unknown) => err
		);
		expect(isRedirect(caught)).toBe(true);
		expect(caught).toMatchObject({ status: 303, location: '/auth/login' });
		expect(protectedWork).not.toHaveBeenCalled();
	});

	it('loads protected data for an authorized admin', async () => {
		lookupRole.mockResolvedValue('super_admin');
		await expect(
			loadWithAdminContext({ page: 'audit', fn: async () => ({ entries: ['audit-1'] }) })(event())
		).resolves.toEqual({ entries: ['audit-1'] });
	});

	it('keeps unexpected loader errors private', async () => {
		lookupRole.mockResolvedValue('super_admin');
		const caught = await loadWithAdminContext({
			page: 'audit',
			fn: async () => {
				throw new Error('private provider details');
			}
		})(event()).catch((err: unknown) => err);
		expect(isHttpError(caught, 500)).toBe(true);
		expect(caught).toMatchObject({ body: { message: 'Internal server error' } });
	});
});
