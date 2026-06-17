import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupabaseOrgProvisioningPortMock, loadOrganizationProvisioningMock, provisionOrganizationMock } =
	vi.hoisted(() => ({
		createSupabaseOrgProvisioningPortMock: vi.fn(),
		loadOrganizationProvisioningMock: vi.fn(),
		provisionOrganizationMock: vi.fn()
	}));

vi.mock('$lib/server/adapters/supabaseOrgProvisioning', () => ({
	createSupabaseOrgProvisioningPort: createSupabaseOrgProvisioningPortMock
}));

vi.mock('$lib/server/core/useCases/orgProvisioning', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/orgProvisioning')>(
		'$lib/server/core/useCases/orgProvisioning'
	);

	return {
		...actual,
		loadOrganizationProvisioning: loadOrganizationProvisioningMock,
		provisionOrganization: provisionOrganizationMock
	};
});

import { actions, load } from './+page.server';

function confirmedUser(overrides: Record<string, unknown> = {}) {
	return {
		id: 'user-1',
		email: 'owner@example.com',
		confirmed_at: '2026-06-16T12:00:00.000Z',
		email_confirmed_at: '2026-06-16T12:00:00.000Z',
		...overrides
	};
}

function providerUser(overrides: Record<string, unknown> = {}) {
	return confirmedUser(overrides);
}

function localsWithProviderUser(
	options: {
		user?: Record<string, unknown>;
		providerUser?: Record<string, unknown> | null;
		providerError?: unknown;
	} = {}
) {
	const getUser = vi.fn().mockResolvedValue({
		data: { user: options.providerUser === null ? null : providerUser(options.providerUser) },
		error: options.providerError ?? null
	});
	const locals = {
		user: options.user ?? confirmedUser(),
		supabase: { auth: { getUser } }
	};

	return { locals, getUser };
}

describe('org/new page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createSupabaseOrgProvisioningPortMock.mockReturnValue({ kind: 'org-provisioning-port' });
		loadOrganizationProvisioningMock.mockResolvedValue({
			canCreate: true,
			canCreateMessage: undefined
		});
		provisionOrganizationMock.mockResolvedValue({ orgId: 'org-1' });
	});

	it('redirects unauthenticated users to login before checking create-org access', async () => {
		await expect(
			load({
				locals: {}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});

		expect(loadOrganizationProvisioningMock).not.toHaveBeenCalled();
	});

	it('blocks provider-unconfirmed authenticated users before checking create-org access', async () => {
		const { locals, getUser } = localsWithProviderUser({
			providerUser: {
				email: 'pending@example.com',
				confirmed_at: null,
				email_confirmed_at: null
			}
		});

		const result = await load({
			locals
		} as never);

		expect(result).toEqual({
			emailConfirmed: false,
			userEmail: 'pending@example.com',
			canCreate: false,
			canCreateMessage: 'Confirm your email before creating an Organization.'
		});
		expect(getUser).toHaveBeenCalledOnce();
		expect(createSupabaseOrgProvisioningPortMock).not.toHaveBeenCalled();
		expect(loadOrganizationProvisioningMock).not.toHaveBeenCalled();
	});

	it('fails closed when load cannot verify provider confirmation state', async () => {
		const { locals, getUser } = localsWithProviderUser({
			providerUser: null,
			providerError: new Error('auth unavailable')
		});

		const result = await load({
			locals
		} as never);

		expect(result).toEqual({
			emailConfirmed: false,
			userEmail: 'owner@example.com',
			canCreate: false,
			canCreateMessage: 'Unable to verify email confirmation right now. Try again in a moment.'
		});
		expect(getUser).toHaveBeenCalledOnce();
		expect(createSupabaseOrgProvisioningPortMock).not.toHaveBeenCalled();
		expect(loadOrganizationProvisioningMock).not.toHaveBeenCalled();
	});

	it('loads create-org availability through the provisioning boundary', async () => {
		loadOrganizationProvisioningMock.mockResolvedValue({
			canCreate: false,
			canCreateMessage: 'You can own up to 1 organization(s) on your current plan.'
		});
		const { locals, getUser } = localsWithProviderUser();

		const result = await load({
			locals
		} as never);

		expect(result).toEqual({
			emailConfirmed: true,
			userEmail: 'owner@example.com',
			canCreate: false,
			canCreateMessage: 'You can own up to 1 organization(s) on your current plan.'
		});
		expect(getUser).toHaveBeenCalledOnce();
		expect(createSupabaseOrgProvisioningPortMock).toHaveBeenCalledWith(locals);
		expect(loadOrganizationProvisioningMock).toHaveBeenCalledWith(
			{ kind: 'org-provisioning-port' },
			{ userId: 'user-1' }
		);
	});

	it('redirects unauthenticated users to login before provisioning starts', async () => {
		await expect(
			actions.default({
				request: new Request('http://localhost/org/new', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ name: 'Alpha Company' })
				}),
				locals: {}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});

		expect(provisionOrganizationMock).not.toHaveBeenCalled();
	});

	it('does not provision organizations for provider-unconfirmed users', async () => {
		const { locals, getUser } = localsWithProviderUser({
			providerUser: {
				email: 'pending@example.com',
				confirmed_at: null,
				email_confirmed_at: null
			}
		});

		const result = await actions.default({
			request: new Request('http://localhost/org/new', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ name: 'Alpha Company' })
			}),
			locals
		} as never);

		expect(result).toMatchObject({
			status: 403,
			data: { error: 'Confirm your email before creating an Organization.' }
		});
		expect(getUser).toHaveBeenCalledOnce();
		expect(createSupabaseOrgProvisioningPortMock).not.toHaveBeenCalled();
		expect(provisionOrganizationMock).not.toHaveBeenCalled();
	});

	it('does not provision organizations when provider confirmation cannot be verified safely', async () => {
		const { locals, getUser } = localsWithProviderUser({
			providerUser: { id: 'other-user' }
		});

		const result = await actions.default({
			request: new Request('http://localhost/org/new', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ name: 'Alpha Company' })
			}),
			locals
		} as never);

		expect(result).toMatchObject({
			status: 503,
			data: { error: 'Unable to verify email confirmation right now. Try again in a moment.' }
		});
		expect(getUser).toHaveBeenCalledOnce();
		expect(createSupabaseOrgProvisioningPortMock).not.toHaveBeenCalled();
		expect(provisionOrganizationMock).not.toHaveBeenCalled();
	});

	it('redirects confirmed owners to the newly created organization dashboard after provisioning succeeds', async () => {
		const { locals, getUser } = localsWithProviderUser({
			user: confirmedUser({ email: 'stale-owner@example.com' }),
			providerUser: { email: 'OWNER@EXAMPLE.COM' }
		});

		await expect(
			actions.default({
				request: new Request('http://localhost/org/new', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ name: '  Alpha Company  ' })
				}),
				locals
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1'
		});

		expect(getUser).toHaveBeenCalledOnce();
		expect(provisionOrganizationMock).toHaveBeenCalledWith(
			{ kind: 'org-provisioning-port' },
			{
				name: '  Alpha Company  ',
				userId: 'user-1',
				email: 'OWNER@EXAMPLE.COM'
			}
		);
	});

	it('maps provisioning use-case failures back into the action error payload', async () => {
		provisionOrganizationMock.mockRejectedValue(
			Object.assign(new Error('Organization name is required'), { status: 400 })
		);
		const { locals } = localsWithProviderUser();

		const result = await actions.default({
			request: new Request('http://localhost/org/new', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ name: '' })
			}),
			locals
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Organization name is required' }
		});
	});
});
