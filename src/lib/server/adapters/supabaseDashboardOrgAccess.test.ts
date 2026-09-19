import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseDashboardOrgAccessPort } from './supabaseDashboardOrgAccess';

type Call = { method: string; args: unknown[] };

function createRpcBuilder(result: unknown) {
	const calls: Call[] = [];
	const builder: Record<string, unknown> = {
		single: (...args: unknown[]) => {
			calls.push({ method: 'single', args });
			return result;
		}
	};

	return { builder, calls };
}

afterEach(() => vi.useRealTimers());

describe('createSupabaseDashboardOrgAccessPort', () => {
	it('lists only the normalized invitee pending invitations strictly after expiry', async () => {
		vi.useFakeTimers();
		vi.setSystemTime('2026-09-18T12:00:00.000Z');
		const rows = [
			{
				id: 'eligible',
				normalized_email: 'invitee@example.com',
				status: 'pending',
				expires_at: '2026-09-18T12:00:00.001Z'
			},
			{
				id: 'wrong-email',
				normalized_email: 'other@example.com',
				status: 'pending',
				expires_at: '2026-10-01T00:00:00.000Z'
			},
			{
				id: 'expired',
				normalized_email: 'invitee@example.com',
				status: 'pending',
				expires_at: '2026-09-18T12:00:00.000Z'
			},
			{
				id: 'accepted',
				normalized_email: 'invitee@example.com',
				status: 'accepted',
				expires_at: '2026-10-01T00:00:00.000Z'
			},
			{
				id: 'declined',
				normalized_email: 'invitee@example.com',
				status: 'declined',
				expires_at: '2026-10-01T00:00:00.000Z'
			}
		].map((row) => ({
			...row,
			organization_id: 'org-a',
			created_at: '2026-09-18T11:00:00.000Z',
			organizations: { id: 'org-a', name: 'Alpha' }
		}));
		const supabase = createClient('http://localhost:9', 'synthetic-anon-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					expect(init?.method).toBe('GET');
					expect(url.pathname).toBe('/rest/v1/organization_invitations');
					return Response.json(
						rows.filter((row) => {
							for (const field of ['normalized_email', 'status'] as const) {
								const value = url.searchParams.get(field);
								if (value && value !== `eq.${row[field]}`) return false;
							}
							const expiry = url.searchParams.get('expires_at');
							if (!expiry) return true;
							if (expiry.startsWith('gt.')) return row.expires_at > expiry.slice(3);
							if (expiry.startsWith('gte.')) return row.expires_at >= expiry.slice(4);
							throw new Error('Unexpected expiry operator');
						})
					);
				}
			}
		});
		const port = createSupabaseDashboardOrgAccessPort({ supabase });
		const { loadDashboardOrgAccess } = await import('$lib/server/core/useCases/dashboardOrgAccess');
		const result = await loadDashboardOrgAccess(
			{ ...port, listOrganizationsForUser: async () => [] },
			{
				userId: 'invitee',
				email: ' INVITEE@EXAMPLE.COM ',
				forceShow: false
			}
		);
		expect(result).toEqual({
			organizations: [],
			redirectTo: null,
			pendingInvitations: [
				{
					id: 'eligible',
					organizationId: 'org-a',
					organizationName: 'Alpha',
					createdAt: '2026-09-18T11:00:00.000Z'
				}
			]
		});
	});

	it('accepts invitations through the atomic database transition', async () => {
		const { builder, calls } = createRpcBuilder({
			data: {
				accept_status: 'accepted',
				accepted_organization_id: 'org-1'
			},
			error: null
		});
		const supabase = {
			rpc: vi.fn(() => builder),
			from: vi.fn()
		};
		const port = createSupabaseDashboardOrgAccessPort({ supabase } as never);

		const result = await port.acceptInvitation({
			invitationId: 'invite-1',
			userId: 'user-1',
			email: 'user@example.com'
		});

		expect(result).toEqual({ status: 'accepted', organizationId: 'org-1' });
		expect(supabase.rpc).toHaveBeenCalledWith('accept_organization_invitation', {
			p_invitation_id: 'invite-1'
		});
		expect(supabase.from).not.toHaveBeenCalled();
		expect(calls).toContainEqual({ method: 'single', args: [] });
	});

	it('maps provider errors from the accept transition to a failed status', async () => {
		const { builder } = createRpcBuilder({
			data: null,
			error: { message: 'rpc unavailable' }
		});
		const port = createSupabaseDashboardOrgAccessPort({
			supabase: {
				rpc: vi.fn(() => builder),
				from: vi.fn()
			}
		} as never);

		const result = await port.acceptInvitation({
			invitationId: 'invite-1',
			userId: 'user-1',
			email: 'user@example.com'
		});

		expect(result).toEqual({ status: 'failed', organizationId: null });
	});

	it('preserves setup-required invitation acceptance status from the database transition', async () => {
		const { builder } = createRpcBuilder({
			data: {
				accept_status: 'setup_required',
				accepted_organization_id: null
			},
			error: null
		});
		const port = createSupabaseDashboardOrgAccessPort({
			supabase: {
				rpc: vi.fn(() => builder),
				from: vi.fn()
			}
		} as never);

		const result = await port.acceptInvitation({
			invitationId: 'invite-1',
			userId: 'user-1',
			email: 'user@example.com'
		});

		expect(result).toEqual({ status: 'setup_required', organizationId: null });
	});

	it('preserves blocked invitation acceptance status from the database transition', async () => {
		const { builder } = createRpcBuilder({
			data: {
				accept_status: 'blocked',
				accepted_organization_id: 'org-1'
			},
			error: null
		});
		const port = createSupabaseDashboardOrgAccessPort({
			supabase: {
				rpc: vi.fn(() => builder),
				from: vi.fn()
			}
		} as never);

		await expect(
			port.acceptInvitation({
				invitationId: 'invite-1',
				userId: 'user-1',
				email: 'user@example.com'
			})
		).resolves.toEqual({ status: 'blocked', organizationId: 'org-1' });
	});

	it('declines invitations through the lifecycle transition RPC', async () => {
		const { builder, calls } = createRpcBuilder({
			data: {
				decline_status: 'declined',
				declined_organization_id: 'org-1'
			},
			error: null
		});
		const supabase = { rpc: vi.fn(() => builder), from: vi.fn() };
		const port = createSupabaseDashboardOrgAccessPort({ supabase } as never);

		const result = await port.declineInvitation({
			invitationId: 'invite-1',
			userId: 'user-1',
			email: 'user@example.com'
		});

		expect(result).toEqual({ status: 'declined', organizationId: 'org-1' });
		expect(supabase.rpc).toHaveBeenCalledWith('decline_organization_invitation', {
			p_invitation_id: 'invite-1'
		});
		expect(supabase.from).not.toHaveBeenCalled();
		expect(calls).toContainEqual({ method: 'single', args: [] });
	});

	it('maps provider errors from the decline transition to a failed status', async () => {
		const { builder } = createRpcBuilder({
			data: null,
			error: { message: 'rpc unavailable' }
		});
		const port = createSupabaseDashboardOrgAccessPort({
			supabase: {
				rpc: vi.fn(() => builder),
				from: vi.fn()
			}
		} as never);

		const result = await port.declineInvitation({
			invitationId: 'invite-1',
			userId: 'user-1',
			email: 'user@example.com'
		});

		expect(result).toEqual({ status: 'failed', organizationId: null });
	});

	it('preserves blocked invitation decline status from the database transition', async () => {
		const { builder } = createRpcBuilder({
			data: {
				decline_status: 'blocked',
				declined_organization_id: 'org-1'
			},
			error: null
		});
		const port = createSupabaseDashboardOrgAccessPort({
			supabase: {
				rpc: vi.fn(() => builder),
				from: vi.fn()
			}
		} as never);

		await expect(
			port.declineInvitation({
				invitationId: 'invite-1',
				userId: 'user-1',
				email: 'user@example.com'
			})
		).resolves.toEqual({ status: 'blocked', organizationId: 'org-1' });
	});
});
