import { describe, expect, it } from 'vitest';
import { buildSettingsInvitationAccessRow, buildSettingsMemberAccessRow } from './settingsMemberAccessReadModel.server';

const legacyAccessRow = {
	scoped_group_id: 'group-alpha',
	can_view_calendar: true,
	can_edit_calendar: true,
	can_view_personnel: true,
	can_edit_personnel: true,
	can_view_training: true,
	can_edit_training: false,
	can_view_critical_tasks: true,
	can_edit_critical_tasks: true,
	can_view_onboarding: true,
	can_edit_onboarding: true,
	can_view_rating_scheme: true,
	can_edit_rating_scheme: true,
	can_manage_members: false,
	member_preset: 'viewer',
	capability_overrides: { calendar: 'operate', ratingScheme: 'none' },
	access_scope_kind: 'groups',
	access_scope_group_ids: ['group-alpha']
};

describe('settings member access read model', () => {
	it('translates a legacy membership row into a shaped workspace member access row', () => {
		const member = buildSettingsMemberAccessRow({
			id: 'member-1',
			organization_id: 'org-1',
			user_id: 'user-1',
			email: 'member@example.com',
			role: 'member',
			created_at: '2026-05-20T12:00:00Z',
			...legacyAccessRow
		});

		expect(member).toMatchObject({
			id: 'member-1',
			organizationId: 'org-1',
			userId: 'user-1',
			email: 'member@example.com',
			membershipRole: 'member',
			createdAt: '2026-05-20T12:00:00Z',
			access: {
				memberPreset: 'viewer',
				capabilityMap: {
					calendar: 'operate',
					training: 'view',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
				organizationGovernanceActions: []
			}
		});
		expect(JSON.stringify(member)).not.toContain('canEdit');
		expect(JSON.stringify(member)).not.toContain('scopedGroupId');
	});

	it('normalizes admin and owner rows through Membership Role governance instead of stored member access', () => {
		const admin = buildSettingsMemberAccessRow({
			id: 'admin-1',
			organization_id: 'org-1',
			user_id: 'admin-user',
			email: 'admin@example.com',
			role: 'admin',
			created_at: '2026-05-20T12:00:00Z',
			...legacyAccessRow,
			member_preset: 'viewer',
			capability_overrides: { calendar: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['legacy-group']
		});
		const owner = buildSettingsMemberAccessRow({
			id: 'owner-1',
			organization_id: 'org-1',
			user_id: 'owner-user',
			email: 'owner@example.com',
			role: 'owner',
			created_at: '2026-05-20T12:00:00Z',
			...legacyAccessRow,
			member_preset: 'viewer',
			capability_overrides: { calendar: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['legacy-group']
		});

		expect(admin.access.memberPreset).toBe('editor');
		expect(admin.access.scopeSet).toEqual({ kind: 'organization' });
		expect(Object.values(admin.access.capabilityMap)).toEqual([
			'configure',
			'configure',
			'configure',
			'configure',
			'configure',
			'configure'
		]);
		expect(admin.access.organizationGovernanceActions).toContain('organization.updateMemberAccess');
		expect(admin.access.organizationGovernanceActions).not.toContain('organization.transferOwnership');
		expect(admin.access.organizationGovernanceActions).not.toContain('organization.deleteOrganization');

		expect(owner.access.organizationGovernanceActions).toContain('organization.transferOwnership');
		expect(owner.access.organizationGovernanceActions).toContain('organization.deleteOrganization');
	});

	it('translates a legacy invitation row into shaped pending access', () => {
		const invitation = buildSettingsInvitationAccessRow({
			id: 'invite-1',
			email: 'invite@example.com',
			status: 'pending',
			created_at: '2026-05-20T12:00:00Z',
			...legacyAccessRow,
			can_edit_training: true,
			member_preset: null,
			capability_overrides: null,
			access_scope_kind: null,
			access_scope_group_ids: null
		});

		expect(invitation).toMatchObject({
			id: 'invite-1',
			email: 'invite@example.com',
			status: 'pending',
			membershipRole: 'member',
			createdAt: '2026-05-20T12:00:00Z',
			access: {
				memberPreset: 'operator',
				capabilityMap: {
					calendar: 'configure',
					training: 'configure'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
				organizationGovernanceActions: []
			}
		});
		expect(JSON.stringify(invitation)).not.toContain('can_view');
		expect(JSON.stringify(invitation)).not.toContain('scoped_group_id');
	});

	it('keeps org-wide legacy invitations as organization Scope Set access', () => {
		const invitation = buildSettingsInvitationAccessRow({
			id: 'invite-1',
			email: 'invite@example.com',
			status: 'pending',
			created_at: '2026-05-20T12:00:00Z',
			...legacyAccessRow,
			scoped_group_id: null,
			member_preset: null,
			capability_overrides: null,
			access_scope_kind: null,
			access_scope_group_ids: null
		});

		expect(invitation.membershipRole).toBe('member');
		expect(invitation.access.scopeSet).toEqual({ kind: 'organization' });
	});

	it('infers admin invitation role when shaping pending access', () => {
		const invitation = buildSettingsInvitationAccessRow({
			id: 'invite-admin',
			email: 'admin-invite@example.com',
			status: 'pending',
			created_at: '2026-05-20T12:00:00Z',
			...legacyAccessRow,
			can_edit_training: true,
			can_manage_members: true
		});

		expect(invitation.membershipRole).toBe('admin');
		expect(invitation.access.memberPreset).toBe('editor');
		expect(invitation.access.scopeSet).toEqual({ kind: 'organization' });
		expect(invitation.access.organizationGovernanceActions).toContain('organization.updateMemberAccess');
	});

	it('preserves admin invitation role when shaping pending access', () => {
		const invitation = buildSettingsInvitationAccessRow({
			id: 'invite-admin',
			email: 'admin-invite@example.com',
			status: 'pending',
			role: 'admin',
			created_at: '2026-05-20T12:00:00Z',
			...legacyAccessRow,
			member_preset: 'viewer',
			capability_overrides: { calendar: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['legacy-group']
		});

		expect(invitation.membershipRole).toBe('admin');
		expect(invitation.access.memberPreset).toBe('editor');
		expect(invitation.access.scopeSet).toEqual({ kind: 'organization' });
		expect(invitation.access.organizationGovernanceActions).toContain('organization.updateMemberAccess');
	});
});
