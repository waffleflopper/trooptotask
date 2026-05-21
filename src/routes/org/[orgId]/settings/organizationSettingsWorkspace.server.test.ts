import { describe, expect, it, vi } from 'vitest';
import {
	buildOrganizationSettingsWorkspace,
	loadOrganizationSettingsWorkspace
} from './organizationSettingsWorkspace.server';

const legacyAccessFlags = {
	can_view_calendar: true,
	can_edit_calendar: true,
	can_view_personnel: true,
	can_edit_personnel: true,
	can_view_training: true,
	can_edit_training: true,
	can_view_critical_tasks: true,
	can_edit_critical_tasks: true,
	can_view_onboarding: true,
	can_edit_onboarding: true,
	can_view_rating_scheme: true,
	can_edit_rating_scheme: true,
	can_manage_members: false
};

describe('organization settings workspace read model', () => {
	it('builds Members and Policies section data from representative source rows', () => {
		const workspace = buildOrganizationSettingsWorkspace({
			currentMemberRole: 'admin',
			isAdmin: true,
			members: [
				{
					id: 'member-owner',
					organization_id: 'org-1',
					user_id: 'user-owner',
					email: 'owner@example.com',
					role: 'owner',
					created_at: '2026-05-20T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'viewer',
					capability_overrides: { calendar: 'none' },
					access_scope_kind: 'groups',
					access_scope_group_ids: ['legacy-group']
				},
				{
					id: 'member-a',
					organization_id: 'org-1',
					user_id: 'user-a',
					email: 'member@example.com',
					role: 'member',
					created_at: '2026-05-20T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'viewer',
					capability_overrides: { calendar: 'operate', ratingScheme: 'none' },
					access_scope_kind: 'groups',
					access_scope_group_ids: ['group-alpha']
				}
			],
			invitations: [
				{
					id: 'invite-a',
					email: 'invite@example.com',
					status: 'pending',
					created_at: '2026-05-21T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'operator',
					capability_overrides: null,
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				}
			],
			pendingApprovalSummary: {
				count: 0,
				oldestCreatedAt: null
			},
			groups: [
				{ id: 'group-alpha', name: '1st Platoon', organization_id: 'org-1' },
				{ id: 'group-bravo', name: '2nd Platoon', organization_id: 'org-1' }
			],
			organizationSettings: {
				archive_retention_months: 42,
				loss_warning_window_days: 150,
				critical_tasks_default_expiration_months: 18,
				critical_tasks_expiring_soon_warning_days: 45
			}
		});

		expect(workspace.currentMember).toEqual({
			role: 'admin',
			isOwner: false,
			isAdmin: true,
			canManageMembers: true
		});
		expect(workspace.sections.members.rows).toHaveLength(2);
		expect(workspace.sections.members.invitations).toHaveLength(1);
		expect(workspace.sections.members.roleCounts).toEqual({ owner: 1, admin: 0, member: 1 });
		expect(workspace.sections.members.memberRoleSummary).toBe('1 Owner · 0 Admins · 1 Member');
		expect(workspace.sections.members.pendingApprovalSummary).toEqual({
			count: 0,
			oldestCreatedAt: null
		});
		expect(workspace.sections.members.availableAccessLanes.map((lane) => lane.id)).toEqual([
			'calendar',
			'personnel',
			'training',
			'criticalTasks',
			'onboarding',
			'ratingScheme'
		]);
		expect(workspace.sections.members.rows[1].access.capabilityMap).toMatchObject({
			calendar: 'operate',
			ratingScheme: 'none'
		});
		expect(workspace.sections.members.rows[1].editor).toMatchObject({
			selectedPreset: 'viewer',
			scopeKind: 'groups',
			scopeGroupIds: ['group-alpha']
		});
		expect(workspace.sections.members.rows[1].overriddenCapabilityLabels).toEqual([
			'Calendar: Operate',
			'Rating Scheme: None'
		]);
		expect(workspace.sections.policies.archiveRetention).toEqual({
			savedMonths: 42,
			constraints: { min: 1, max: 120, unit: 'months' }
		});
		expect(workspace.sections.policies.lossWarning).toEqual({
			savedDays: 150,
			constraints: { min: 1, max: 365, unit: 'days' }
		});
		expect(workspace.sections.policies.criticalTasks).toEqual({
			savedDefaultExpirationMonths: 18,
			savedExpiringSoonWarningDays: 45,
			defaultExpirationConstraints: { min: 1, max: 120, unit: 'months' },
			expiringSoonWarningConstraints: { min: 1, max: 365, unit: 'days' }
		});
	});

	it('does not count pending invitations as pending approvals', () => {
		const workspace = buildOrganizationSettingsWorkspace({
			currentMemberRole: 'owner',
			isAdmin: false,
			members: [],
			invitations: [
				{
					id: 'invite-a',
					email: 'invite-a@example.com',
					status: 'pending',
					created_at: '2026-05-21T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'operator',
					capability_overrides: null,
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				},
				{
					id: 'invite-b',
					email: 'invite-b@example.com',
					status: 'pending',
					created_at: '2026-05-22T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'viewer',
					capability_overrides: null,
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				}
			],
			pendingApprovalSummary: {
				count: 1,
				oldestCreatedAt: '2026-05-20T12:00:00Z'
			},
			groups: [],
			organizationSettings: null
		});

		expect(workspace.sections.members.invitations).toHaveLength(2);
		expect(workspace.sections.members.pendingApprovalSummary).toEqual({
			count: 1,
			oldestCreatedAt: '2026-05-20T12:00:00Z'
		});
	});

	it('loads only Members and Policies source tables for this workspace slice', async () => {
		const findMany = vi.fn(async (table: string) => {
			if (table === 'organization_memberships') return [];
			if (table === 'organization_invitations') return [];
			if (table === 'groups') return [];
			throw new Error(`Unexpected table: ${table}`);
		});
		const findOne = vi.fn(async () => ({
			archive_retention_months: 36,
			loss_warning_window_days: 180,
			critical_tasks_default_expiration_months: null,
			critical_tasks_expiring_soon_warning_days: null
		}));

		await loadOrganizationSettingsWorkspace(
			{
				auth: { orgId: 'org-1', role: 'owner' },
				store: { findMany },
				rawStore: { findOne }
			} as never,
			{ isAdmin: false }
		);

		expect(findMany.mock.calls.map((call) => call[0])).toEqual([
			'organization_memberships',
			'organization_invitations',
			'groups'
		]);
		expect(findOne).toHaveBeenCalledWith(
			'organizations',
			'org-1',
			{},
			'archive_retention_months, loss_warning_window_days, critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
		);
		expect(findMany.mock.calls.map((call) => call[0])).not.toContain('personnel');
		expect(findMany.mock.calls.map((call) => call[0])).not.toContain('deletion_requests');
	});
});
