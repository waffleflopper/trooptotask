import { describe, expect, it } from 'vitest';
import { buildSettingsInvitationAccessRow, buildSettingsMemberAccessRow } from './settingsMemberAccessReadModel.server';

const replacementAccessRow = {
	member_preset: 'viewer' as const,
	capability_overrides: { calendar: 'operate' as const, ratingScheme: 'none' as const },
	access_scope_kind: 'groups' as const,
	access_scope_group_ids: ['group-alpha']
};

describe('settings member access read model', () => {
	it('translates a replacement membership row into a shaped workspace member access row', () => {
		const member = buildSettingsMemberAccessRow({
			id: 'member-1',
			organization_id: 'org-1',
			user_id: 'user-1',
			email: 'member@example.com',
			role: 'member',
			created_at: '2026-05-20T12:00:00Z',
			...replacementAccessRow
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

	it('shapes organization-wide member access from replacement scope storage', () => {
		const member = buildSettingsMemberAccessRow({
			id: 'member-org-wide',
			organization_id: 'org-1',
			user_id: 'user-org-wide',
			email: 'org-wide@example.com',
			role: 'member',
			created_at: '2026-05-20T12:00:00Z',
			member_preset: 'editor',
			capability_overrides: {},
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		});

		expect(member.access.memberPreset).toBe('editor');
		expect(member.access.scopeSet).toEqual({ kind: 'organization' });
	});

	it('shapes multi-Group Scope Set access from replacement storage', () => {
		const member = buildSettingsMemberAccessRow({
			id: 'member-multi-group',
			organization_id: 'org-1',
			user_id: 'user-multi-group',
			email: 'multi-group@example.com',
			role: 'member',
			created_at: '2026-05-20T12:00:00Z',
			member_preset: 'operator',
			capability_overrides: {},
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-a', 'group-b']
		});

		expect(member.access.memberPreset).toBe('operator');
		expect(member.access.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
	});

	it('normalizes admin and owner rows through Membership Role governance instead of stored member access', () => {
		const admin = buildSettingsMemberAccessRow({
			id: 'admin-1',
			organization_id: 'org-1',
			user_id: 'admin-user',
			email: 'admin@example.com',
			role: 'admin',
			created_at: '2026-05-20T12:00:00Z',
			...replacementAccessRow,
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
			...replacementAccessRow,
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

	it('translates a replacement invitation row into shaped pending access', () => {
		const invitation = buildSettingsInvitationAccessRow({
			id: 'invite-1',
			email: 'invite@example.com',
			status: 'pending',
			created_at: '2026-05-20T12:00:00Z',
			...replacementAccessRow,
			member_preset: 'editor',
			capability_overrides: {},
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-alpha']
		});

		expect(invitation).toMatchObject({
			id: 'invite-1',
			email: 'invite@example.com',
			status: 'pending',
			membershipRole: 'member',
			createdAt: '2026-05-20T12:00:00Z',
			access: {
				memberPreset: 'editor',
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

	it('keeps org-wide invitations as organization Scope Set access', () => {
		const invitation = buildSettingsInvitationAccessRow({
			id: 'invite-1',
			email: 'invite@example.com',
			status: 'pending',
			created_at: '2026-05-20T12:00:00Z',
			member_preset: 'viewer',
			capability_overrides: {},
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		});

		expect(invitation.membershipRole).toBe('member');
		expect(invitation.access.scopeSet).toEqual({ kind: 'organization' });
	});

	it('shapes multi-Group Scope Set invitations from replacement storage', () => {
		const invitation = buildSettingsInvitationAccessRow({
			id: 'invite-multi-group',
			email: 'multi-invite@example.com',
			status: 'pending',
			created_at: '2026-05-20T12:00:00Z',
			member_preset: 'operator',
			capability_overrides: {},
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-a', 'group-b']
		});

		expect(invitation.access.memberPreset).toBe('operator');
		expect(invitation.access.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
	});

	it('reads admin invitation role from replacement row role field', () => {
		const invitation = buildSettingsInvitationAccessRow({
			id: 'invite-admin',
			email: 'admin-invite@example.com',
			status: 'pending',
			created_at: '2026-05-20T12:00:00Z',
			...replacementAccessRow,
			role: 'admin'
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
			...replacementAccessRow,
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
