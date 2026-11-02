import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { receiveClientErrorReport } from './clientErrorReports.server';

const rpc = vi.fn();
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc }) }));
const requireActiveOrganization = vi.fn();
vi.mock('$features/organization/index.server', () => ({
	requireActiveOrganization: (...args: unknown[]) => requireActiveOrganization(...args)
}));

const ORG_ID = '22222222-2222-4222-8222-222222222222';

function makeEvent(body: unknown, { signedIn = true }: { signedIn?: boolean } = {}) {
	return {
		params: { orgId: 'alpha' },
		locals: { actor: signedIn ? { userId: 'user-1' } : null },
		request: new Request('https://app.example.test/org/alpha/api/errors', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never;
}

const REPORT = { kind: 'transport', routeId: '/org/[orgId]/calendar', name: 'TypeError', message: 'Failed to fetch' };

beforeEach(() => {
	rpc.mockReset();
	rpc.mockResolvedValue({ data: null, error: null });
	requireActiveOrganization.mockReset();
	requireActiveOrganization.mockResolvedValue({ id: ORG_ID });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('receiving a client error report', () => {
	it('refuses a concrete path offered as a route id', async () => {
		await expect(
			receiveClientErrorReport(makeEvent({ ...REPORT, routeId: '/org/alpha/personnel/Jane-Smith' }), 'organization')
		).rejects.toMatchObject({ status: 400 });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('stores it as client reported, attributed from the session and the admitted organization', async () => {
		const response = await receiveClientErrorReport(makeEvent({ ...REPORT, method: 'GET' }), 'organization');
		const { reference } = await response.json();

		expect(reference).toMatch(/^[0-9a-f-]{36}$/);
		expect(rpc).toHaveBeenCalledWith(
			'record_platform_error',
			expect.objectContaining({
				p_reference: reference,
				p_origin: 'client_reported',
				p_kind: 'transport',
				p_route_id: '/org/[orgId]/calendar',
				p_method: 'GET',
				p_user_id: 'user-1',
				p_organization_id: ORG_ID
			})
		);
	});

	it('stores an account-scoped report without an organization', async () => {
		await receiveClientErrorReport(makeEvent(REPORT), 'account');

		expect(requireActiveOrganization).not.toHaveBeenCalled();
		expect(rpc).toHaveBeenCalledWith('record_platform_error', expect.objectContaining({ p_organization_id: null }));
	});

	it.each([
		['a user', { userId: 'someone-else' }],
		['an organization', { organizationId: ORG_ID }],
		['an origin', { origin: 'server' }],
		['a reference', { reference: 'a0000000-0000-4000-8000-000000190001' }],
		['a fingerprint', { fingerprint: 'chosen' }]
	])('rejects a body that tries to set %s', async (_name, extra) => {
		await expect(receiveClientErrorReport(makeEvent({ ...REPORT, ...extra }), 'organization')).rejects.toMatchObject({
			status: 400
		});
		expect(rpc).not.toHaveBeenCalled();
	});

	it('rejects a kind the browser cannot report and a route that is a URL', async () => {
		await expect(
			receiveClientErrorReport(makeEvent({ ...REPORT, kind: 'server_response' }), 'organization')
		).rejects.toMatchObject({ status: 400 });
		await expect(
			receiveClientErrorReport(
				makeEvent({ ...REPORT, routeId: 'https://app.example.test/org/alpha?token=secret' }),
				'organization'
			)
		).rejects.toMatchObject({ status: 400 });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('requires a session', async () => {
		await expect(receiveClientErrorReport(makeEvent(REPORT, { signedIn: false }), 'account')).rejects.toMatchObject({
			status: 401
		});
		expect(rpc).not.toHaveBeenCalled();
	});

	it('answers 503 when the report could not be stored, so the browser does not show a reference', async () => {
		rpc.mockRejectedValue(new Error('database down'));

		await expect(receiveClientErrorReport(makeEvent(REPORT), 'account')).rejects.toMatchObject({ status: 503 });
	});

	it('stops when the caller does not belong to the organization', async () => {
		requireActiveOrganization.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));

		await expect(receiveClientErrorReport(makeEvent(REPORT), 'organization')).rejects.toBeTruthy();
		expect(rpc).not.toHaveBeenCalled();
	});
});
