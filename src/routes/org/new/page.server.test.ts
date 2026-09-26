import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgProvisioningPort } from '$lib/server/core/useCases/orgProvisioning';

const { createPort } = vi.hoisted(() => ({ createPort: vi.fn() }));
vi.mock('$lib/server/adapters/supabaseOrgProvisioning', () => ({
	createSupabaseOrgProvisioningPort: createPort
}));

import { actions, load } from './+page.server';

const owner = { id: 'user-1', email: 'stale@example.test' };
const confirmed = {
	id: 'user-1',
	email: 'OWNER@EXAMPLE.TEST',
	email_confirmed_at: '2026-06-16T12:00:00Z'
};

function event(providerUser: Record<string, unknown> | null = confirmed, fields = { name: '  Alpha   Company  ' }) {
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
		createOrganizationWithOwner: vi.fn().mockResolvedValue({ orgId: 'org-1', errorMessage: null }),
		updateOwnerMembershipEmail: vi.fn().mockResolvedValue(null),
		seedDefaultGroups: vi.fn().mockResolvedValue(null),
		seedDefaultStatusTypes: vi.fn().mockResolvedValue(null),
		seedDefaultAssignmentTypes: vi.fn().mockResolvedValue(null),
		seedFederalHolidays: vi.fn().mockResolvedValue(null),
		seedDefaultRankCatalog: vi.fn().mockResolvedValue(null)
	} satisfies OrgProvisioningPort;
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
		expect(await actions.default(event(providerUser) as never)).toMatchObject({ status });
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

	it('binds creation to the verified actor and email, ignoring submitted identity, slug and Organization', async () => {
		expect(await load(event() as never)).toMatchObject({
			emailConfirmed: true,
			userEmail: 'OWNER@EXAMPLE.TEST'
		});
		const input = event(confirmed, {
			name: '  Alpha   Company  ',
			userId: 'attacker',
			email: 'attacker@example.test',
			orgId: 'foreign-org',
			url_slug: 'foreign-org'
		} as { name: string });
		await expect(actions.default(input as never)).rejects.toMatchObject({ status: 303, location: '/org/org-1' });
		expect(port.createOrganizationWithOwner).toHaveBeenCalledWith('Alpha Company');
		expect(port.updateOwnerMembershipEmail).toHaveBeenCalledWith({
			organizationId: 'org-1',
			userId: 'user-1',
			email: 'owner@example.test'
		});
		expect(port.seedDefaultGroups).toHaveBeenCalledWith('org-1');
	});

	it.each(['', ' \t\n '])('rejects blank name %j without any creation effects', async (name) => {
		expect(await actions.default(event(confirmed, { name }) as never)).toMatchObject({
			status: 400,
			data: { error: 'Organization name is required' }
		});
		expect(port.createOrganizationWithOwner).not.toHaveBeenCalled();
	});

	it('returns creation failure without redirecting or writing owner/defaults', async () => {
		port.createOrganizationWithOwner.mockResolvedValue({ orgId: null, errorMessage: 'Owner insert denied' });
		expect(await actions.default(event() as never)).toMatchObject({
			status: 500,
			data: { error: 'Owner insert denied' }
		});
		for (const effect of [
			port.updateOwnerMembershipEmail,
			port.seedDefaultGroups,
			port.seedDefaultStatusTypes,
			port.seedDefaultAssignmentTypes,
			port.seedFederalHolidays,
			port.seedDefaultRankCatalog
		]) {
			expect(effect).not.toHaveBeenCalled();
		}
	});

	it('returns required rank seed failure instead of a success redirect', async () => {
		port.seedDefaultRankCatalog.mockResolvedValue('Rank catalog unavailable');
		expect(await actions.default(event() as never)).toMatchObject({
			status: 500,
			data: { error: 'Rank catalog unavailable' }
		});
	});

	it('does not disguise unexpected provider exceptions as successful creation', async () => {
		const failure = new Error('connection lost');
		port.createOrganizationWithOwner.mockRejectedValue(failure);
		await expect(actions.default(event() as never)).rejects.toBe(failure);
		expect(port.updateOwnerMembershipEmail).not.toHaveBeenCalled();
	});
});
