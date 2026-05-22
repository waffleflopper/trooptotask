import { describe, expect, it, vi } from 'vitest';
import { createSupabaseDashboardOrgAccessPort } from './supabaseDashboardOrgAccess';

type Call = { method: string; args: unknown[] };

function createInvitationBuilder(result: unknown) {
	const calls: Call[] = [];

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		select: track('select'),
		delete: track('delete'),
		eq: track('eq'),
		single: (...args: unknown[]) => {
			calls.push({ method: 'single', args });
			return result;
		}
	};

	return { builder, calls };
}

describe('createSupabaseDashboardOrgAccessPort', () => {
	it('finds invitations by normalized email for invitee visibility', async () => {
		const { builder, calls } = createInvitationBuilder({
			data: {
				id: 'invite-1',
				organization_id: 'org-1',
				can_view_calendar: true,
				can_edit_calendar: false,
				can_view_personnel: true,
				can_edit_personnel: false,
				can_view_training: true,
				can_edit_training: false,
				can_view_critical_tasks: true,
				can_edit_critical_tasks: false,
				can_view_onboarding: true,
				can_edit_onboarding: false,
				can_view_rating_scheme: true,
				can_edit_rating_scheme: false,
				can_manage_members: false,
				scoped_group_id: null,
				member_preset: 'viewer',
				capability_overrides: {},
				access_scope_kind: 'organization',
				access_scope_group_ids: []
			},
			error: null
		});
		const supabase = { from: vi.fn(() => builder) };
		const port = createSupabaseDashboardOrgAccessPort({ supabase } as never);

		const result = await port.findInvitation('invite-1', 'user@example.com');

		expect(result).toMatchObject({ id: 'invite-1', organizationId: 'org-1' });
		expect(supabase.from).toHaveBeenCalledWith('organization_invitations');
		expect(calls).toContainEqual({ method: 'eq', args: ['id', 'invite-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['normalized_email', 'user@example.com'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
	});

	it('declines invitations by normalized email until decline becomes a lifecycle update', async () => {
		const { builder, calls } = createInvitationBuilder({ error: null });
		const supabase = { from: vi.fn(() => builder) };
		const port = createSupabaseDashboardOrgAccessPort({ supabase } as never);

		const result = await port.deleteInvitationForEmail('invite-1', 'user@example.com');

		expect(result).toBe(true);
		expect(calls).toContainEqual({ method: 'delete', args: [] });
		expect(calls).toContainEqual({ method: 'eq', args: ['id', 'invite-1'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['normalized_email', 'user@example.com'] });
		expect(calls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
	});
});
