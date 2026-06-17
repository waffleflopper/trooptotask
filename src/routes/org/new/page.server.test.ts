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

	it('blocks unconfirmed authenticated users before checking create-org access', async () => {
		const result = await load({
			locals: {
				user: {
					id: 'user-1',
					email: 'pending@example.com',
					confirmed_at: null,
					email_confirmed_at: null
				},
				supabase: { ignored: true }
			}
		} as never);

		expect(result).toEqual({
			emailConfirmed: false,
			userEmail: 'pending@example.com',
			canCreate: false,
			canCreateMessage: 'Confirm your email before creating an Organization.'
		});
		expect(createSupabaseOrgProvisioningPortMock).not.toHaveBeenCalled();
		expect(loadOrganizationProvisioningMock).not.toHaveBeenCalled();
	});

	it('loads create-org availability through the provisioning boundary', async () => {
		loadOrganizationProvisioningMock.mockResolvedValue({
			canCreate: false,
			canCreateMessage: 'You can own up to 1 organization(s) on your current plan.'
		});

		const result = await load({
			locals: {
				user: confirmedUser(),
				supabase: { ignored: true }
			}
		} as never);

		expect(result).toEqual({
			emailConfirmed: true,
			userEmail: 'owner@example.com',
			canCreate: false,
			canCreateMessage: 'You can own up to 1 organization(s) on your current plan.'
		});
		expect(createSupabaseOrgProvisioningPortMock).toHaveBeenCalledWith({
			user: confirmedUser(),
			supabase: { ignored: true }
		});
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

	it('does not provision organizations for unconfirmed users', async () => {
		const result = await actions.default({
			request: new Request('http://localhost/org/new', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ name: 'Alpha Company' })
			}),
			locals: {
				user: {
					id: 'user-1',
					email: 'pending@example.com',
					confirmed_at: null,
					email_confirmed_at: null
				},
				supabase: { ignored: true }
			}
		} as never);

		expect(result).toMatchObject({
			status: 403,
			data: { error: 'Confirm your email before creating an Organization.' }
		});
		expect(createSupabaseOrgProvisioningPortMock).not.toHaveBeenCalled();
		expect(provisionOrganizationMock).not.toHaveBeenCalled();
	});

	it('redirects confirmed owners to the newly created organization dashboard after provisioning succeeds', async () => {
		await expect(
			actions.default({
				request: new Request('http://localhost/org/new', {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ name: '  Alpha Company  ' })
				}),
				locals: {
					user: confirmedUser({ email: 'OWNER@EXAMPLE.COM' }),
					supabase: { ignored: true }
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/org/org-1'
		});

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

		const result = await actions.default({
			request: new Request('http://localhost/org/new', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ name: '' })
			}),
			locals: {
				user: confirmedUser(),
				supabase: { ignored: true }
			}
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Organization name is required' }
		});
	});
});
