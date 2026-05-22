import { describe, expect, it, vi } from 'vitest';
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

function createPendingInvitationListBuilder(result: unknown) {
	const calls: Call[] = [];

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		select: track('select'),
		eq: track('eq'),
		gt: track('gt'),
		order: track('order'),
		range: (...args: unknown[]) => {
			calls.push({ method: 'range', args });
			return result;
		}
	};

	return { builder, calls };
}

describe('createSupabaseDashboardOrgAccessPort', () => {
	it('lists only pending, unexpired invitations for the normalized email while preserving organization names', async () => {
		const { builder, calls } = createPendingInvitationListBuilder({
			data: [
				{
					id: 'invite-1',
					organization_id: 'org-1',
					created_at: '2026-05-22T00:00:00.000Z',
					organizations: { id: 'org-1', name: 'Alpha Company' }
				}
			],
			error: null
		});
		const supabase = {
			from: vi.fn(() => builder)
		};
		const port = createSupabaseDashboardOrgAccessPort({ supabase } as never);

		const result = await port.listPendingInvitationsForEmail('user@example.com');

		expect(result).toEqual([
			{
				id: 'invite-1',
				organizationId: 'org-1',
				organizationName: 'Alpha Company',
				createdAt: '2026-05-22T00:00:00.000Z'
			}
		]);
		expect(calls).toContainEqual({ method: 'eq', args: ['normalized_email', 'user@example.com'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
		expect(calls).toContainEqual({ method: 'gt', args: ['expires_at', expect.any(String)] });
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
});
