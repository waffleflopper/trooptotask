import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createPort } = vi.hoisted(() => ({ createPort: vi.fn() }));
vi.mock('$lib/server/organizationProvisioningDelivery', () => ({
	createOrganizationProvisioningDelivery: createPort
}));

import { actions, load } from './+page.server';

const owner = { id: 'user-1', email: 'stale@example.test' };
const confirmed = {
	id: 'user-1',
	email: 'OWNER@EXAMPLE.TEST',
	email_confirmed_at: '2026-06-16T12:00:00Z'
};

const requestId = '6f0c6c9e-7a53-4d1b-9a4e-2f3f0f9f0a11';
const UNCONFIRMED_CREATION =
	"We couldn't confirm that your Organization was created. Select Create and start setup again to finish. Retrying won't create a duplicate.";

function event(
	providerUser: Record<string, unknown> | null = confirmed,
	fields: Record<string, string> = { name: '  Alpha   Company  ', requestId }
) {
	return {
		locals: {
			actor: { userId: owner.id },
			user: owner,
			supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: providerUser }, error: null }) } }
		},
		request: new Request('http://localhost/org/new', {
			method: 'POST',
			body: new URLSearchParams(fields)
		})
	};
}

function provisioningPort() {
	return {
		createOrganization: vi.fn().mockResolvedValue({ orgId: 'org-1' })
	};
}

describe('org/new admission through real provisioning', () => {
	let port: ReturnType<typeof provisioningPort>;
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		port = provisioningPort();
		createPort.mockReturnValue(port);
	});
	afterEach(() => vi.restoreAllMocks());

	it.each([
		['load', load],
		['action', actions.default]
	] as const)(
		'denies %s without an admitted actor before provider lookup or Organization creation',
		async (_, handler) => {
			const request = event();
			const locals = { ...request.locals, actor: null };
			await expect(handler({ ...request, locals } as never)).rejects.toMatchObject({
				status: 303,
				location: '/auth/login'
			});
			expect(locals.supabase.auth.getUser).not.toHaveBeenCalled();
			expect(createPort).not.toHaveBeenCalled();
		}
	);

	it.each([
		['load', load],
		['action', actions.default]
	] as const)('%s redirects anonymous users before provider access', async (_, handler) => {
		await expect(handler({ ...event(), locals: {} } as never)).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});
		expect(createPort).not.toHaveBeenCalled();
	});

	it.each([
		['unconfirmed email', { ...confirmed, email_confirmed_at: null }, 403],
		['missing identity', null, 503],
		['different identity', { ...confirmed, id: 'other-user' }, 503]
	] as const)('denies load and direct POST with %s despite a cached user', async (_, providerUser, status) => {
		expect(await load(event(providerUser) as never)).toMatchObject({ emailConfirmed: false });
		expect(await actions.default(event(providerUser) as never)).toMatchObject({
			status,
			data: { name: '  Alpha   Company  ', requestId }
		});
		expect(createPort).not.toHaveBeenCalled();
	});

	it.each(['error', 'throw'] as const)('fails closed on provider %s for load and direct POST', async (failure) => {
		const input = event();
		const getUser = input.locals.supabase.auth.getUser;
		if (failure === 'throw') getUser.mockRejectedValue(new Error('offline'));
		else getUser.mockResolvedValue({ data: { user: confirmed }, error: { message: 'offline' } });
		expect(await load(input as never)).toMatchObject({ emailConfirmed: false });
		expect(await actions.default(input as never)).toMatchObject({ status: 503 });
		expect(createPort).not.toHaveBeenCalled();
	});

	it('issues a fresh request id for each load', async () => {
		const first = (await load(event() as never)) as { requestId: string };
		const second = (await load(event() as never)) as { requestId: string };
		expect(first).toMatchObject({ requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
		expect(second.requestId).not.toBe(first.requestId);
		expect(await load(event({ ...confirmed, email_confirmed_at: null }) as never)).toMatchObject({
			emailConfirmed: false,
			requestId: expect.stringMatching(/^[0-9a-f-]{36}$/)
		});
	});

	it('creates once for the verified actor with the submitted request id, ignoring submitted identity and slug', async () => {
		expect(await load(event() as never)).toMatchObject({
			emailConfirmed: true,
			userEmail: 'OWNER@EXAMPLE.TEST'
		});
		const input = event(confirmed, {
			name: '  Alpha   Company  ',
			requestId,
			userId: 'attacker',
			email: 'attacker@example.test',
			orgId: 'foreign-org',
			url_slug: 'foreign-org'
		});
		await expect(actions.default(input as never)).rejects.toMatchObject({ status: 303, location: '/org/org-1/setup' });
		expect(port.createOrganization).toHaveBeenCalledTimes(1);
		expect(port.createOrganization).toHaveBeenCalledWith({ name: 'Alpha Company', requestId });
	});

	it.each(['', ' \t\n '])('rejects blank name %j without creation and keeps the request id', async (name) => {
		expect(await actions.default(event(confirmed, { name, requestId }) as never)).toMatchObject({
			status: 400,
			data: { error: 'Organization name is required', name, requestId }
		});
		expect(port.createOrganization).not.toHaveBeenCalled();
	});

	it.each([
		['missing', { name: 'Alpha Company' }],
		['malformed', { name: 'Alpha Company', requestId: 'not-a-uuid' }]
	])('creates with a fresh request id when the submitted one is %s', async (_, fields) => {
		await expect(actions.default(event(confirmed, fields) as never)).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1/setup'
		});
		const [[call]] = port.createOrganization.mock.calls;
		expect(call.name).toBe('Alpha Company');
		expect(call.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});

	it('answers an unconfirmed creation with a safe retry message, keeping the draft and request id for the retry', async () => {
		port.createOrganization.mockResolvedValueOnce({ failure: 'duplicate key value violates "organizations_pkey"' });
		const failed = await actions.default(event() as never);
		expect(failed).toMatchObject({
			status: 503,
			data: { error: UNCONFIRMED_CREATION, name: '  Alpha   Company  ', requestId }
		});
		expect(JSON.stringify(failed)).not.toContain('organizations_pkey');

		await expect(actions.default(event() as never)).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1/setup'
		});
		expect(port.createOrganization.mock.calls).toEqual([
			[{ name: 'Alpha Company', requestId }],
			[{ name: 'Alpha Company', requestId }]
		]);
	});

	it('does not disguise unexpected provider exceptions as successful creation', async () => {
		port.createOrganization.mockRejectedValue(new Error('connection lost'));
		expect(await actions.default(event() as never)).toMatchObject({
			status: 500,
			data: { error: 'Internal server error', name: '  Alpha   Company  ', requestId }
		});
	});
});
