import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DurableRateLimitStore } from '$lib/access/index.server';
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

function makeBudgetStore(): DurableRateLimitStore & { keys: string[] } {
	const counts = new Map<string, number>();
	const keys: string[] = [];
	return {
		keys,
		async checkBucket({ key, maxRequests }) {
			keys.push(key);
			const count = (counts.get(key) ?? 0) + 1;
			counts.set(key, count);
			return count > maxRequests ? { limited: true, retryAfterMs: 1000 } : { limited: false };
		}
	};
}

let budget = makeBudgetStore();
const receive = (event: never, scope: 'account' | 'organization', store: DurableRateLimitStore = budget) =>
	receiveClientErrorReport(event, scope, store);

const REPORT = { kind: 'transport', routeId: '/org/[orgId]/calendar', name: 'TypeError', message: 'Failed to fetch' };

beforeEach(() => {
	budget = makeBudgetStore();
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
			receive(makeEvent({ ...REPORT, routeId: '/org/alpha/personnel/Jane-Smith' }), 'organization')
		).rejects.toMatchObject({ status: 400 });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('stores it as client reported, attributed from the session and the admitted organization', async () => {
		const response = await receive(makeEvent({ ...REPORT, method: 'GET' }), 'organization');
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
		await receive(makeEvent(REPORT), 'account');

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
		await expect(receive(makeEvent({ ...REPORT, ...extra }), 'organization')).rejects.toMatchObject({
			status: 400
		});
		expect(rpc).not.toHaveBeenCalled();
	});

	it('rejects a kind the browser cannot report and a route that is a URL', async () => {
		await expect(receive(makeEvent({ ...REPORT, kind: 'server_response' }), 'organization')).rejects.toMatchObject({
			status: 400
		});
		await expect(
			receive(makeEvent({ ...REPORT, routeId: 'https://app.example.test/org/alpha?token=secret' }), 'organization')
		).rejects.toMatchObject({ status: 400 });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('requires a session', async () => {
		await expect(receive(makeEvent(REPORT, { signedIn: false }), 'account')).rejects.toMatchObject({
			status: 401
		});
		expect(rpc).not.toHaveBeenCalled();
	});

	it('answers 503 when the report could not be stored, so the browser does not show a reference', async () => {
		rpc.mockRejectedValue(new Error('database down'));

		await expect(receive(makeEvent(REPORT), 'account')).rejects.toMatchObject({ status: 503 });
	});

	it('stops when the caller does not belong to the organization', async () => {
		requireActiveOrganization.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));

		await expect(receive(makeEvent(REPORT), 'organization')).rejects.toBeTruthy();
		expect(rpc).not.toHaveBeenCalled();
	});

	it('stores 30 reports an hour from one account, then answers 204 and stores nothing', async () => {
		for (let sent = 0; sent < 30; sent++) {
			const response = await receive(makeEvent(REPORT), 'account');
			expect(response.status).toBe(200);
		}
		expect(rpc).toHaveBeenCalledTimes(30);

		const response = await receive(makeEvent(REPORT), 'organization');

		expect(response.status).toBe(204);
		expect(await response.text()).toBe('');
		expect(rpc).toHaveBeenCalledTimes(30);
		expect(requireActiveOrganization).not.toHaveBeenCalled();
	});

	it('shares one budget between the account and organization endpoints and counts nothing else', async () => {
		for (let sent = 0; sent < 15; sent++) {
			await receive(makeEvent(REPORT), 'account');
			await receive(makeEvent(REPORT), 'organization');
		}

		expect((await receive(makeEvent(REPORT), 'account')).status).toBe(204);
		expect(new Set(budget.keys).size).toBe(1);
	});

	it('limits before it reads the body, so an invalid report still spends the budget', async () => {
		for (let sent = 0; sent < 30; sent++) {
			await receive(makeEvent({ ...REPORT, kind: 'nope' }), 'account').catch(() => undefined);
		}

		expect((await receive(makeEvent({ ...REPORT, kind: 'nope' }), 'account')).status).toBe(204);
	});

	it('stores nothing and answers 503 when the limit cannot be checked', async () => {
		const broken: DurableRateLimitStore = {
			checkBucket: () => Promise.reject(new Error('rate limit store down'))
		};

		await expect(receive(makeEvent(REPORT), 'account', broken)).rejects.toMatchObject({ status: 503 });
		expect(rpc).not.toHaveBeenCalled();
	});
});
