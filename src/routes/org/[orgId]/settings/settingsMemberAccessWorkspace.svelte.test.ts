import { describe, expect, it } from 'vitest';
import type { OrganizationInvitation, OrganizationMember } from '$lib/types';
import { createSettingsMemberAccessWorkspace } from './settingsMemberAccessWorkspace.svelte';

const fullEditorPermissions = {
	canViewCalendar: true,
	canEditCalendar: true,
	canViewPersonnel: true,
	canEditPersonnel: true,
	canViewTraining: true,
	canEditTraining: true,
	canViewCriticalTasks: true,
	canEditCriticalTasks: true,
	canViewOnboarding: true,
	canEditOnboarding: true,
	canViewRatingScheme: true,
	canEditRatingScheme: true,
	canManageMembers: false
};

function member(id: string, email: string, role: OrganizationMember['role'], overrides = {}): OrganizationMember {
	return {
		id,
		organizationId: 'org-1',
		userId: `user-${id}`,
		email,
		role,
		scopedGroupId: null,
		memberPreset: 'editor',
		capabilityOverrides: {},
		accessScopeKind: 'organization',
		accessScopeGroupIds: [],
		createdAt: '2026-04-01T00:00:00Z',
		...fullEditorPermissions,
		...(role === 'admin' || role === 'owner' ? { canManageMembers: true } : {}),
		...overrides
	};
}

function makeWorkspace(overrides: Partial<{ members: OrganizationMember[]; isOwner: boolean }> = {}) {
	return createSettingsMemberAccessWorkspace({
		members: overrides.members ?? [
			member('owner', 'owner@example.com', 'owner'),
			member('alpha', 'alpha@example.com', 'member'),
			member('admin', 'admin@example.com', 'admin')
		],
		invitations: [],
		groups: [
			{ id: 'group-alpha', name: '1st Platoon' },
			{ id: 'group-bravo', name: '2nd Platoon' }
		],
		isOwner: overrides.isOwner ?? true
	});
}

describe('settings member access workspace', () => {
	it('opens and clears a member editor draft with preset and Scope Set state', () => {
		const workspace = makeWorkspace({
			members: [
				member('member-1', 'member-a@example.com', 'member', {
					memberPreset: 'viewer',
					capabilityOverrides: { calendar: 'operate', ratingScheme: 'none' },
					accessScopeKind: 'groups',
					accessScopeGroupIds: ['group-alpha']
				})
			]
		});
		const [editableMember] = workspace.sortedMembers;

		workspace.openMemberEditor(editableMember);

		expect(workspace.memberEditorId).toBe('member-1');
		expect(workspace.getSelectedPreset(editableMember)).toBe('viewer');
		expect(workspace.getSelectedScopeKind(editableMember)).toBe('groups');
		expect(workspace.getSelectedScopeGroupIds(editableMember)).toEqual(['group-alpha']);
		expect(workspace.overriddenCapabilityLabels(editableMember)).toEqual(['Calendar: Operate', 'Rating Scheme: None']);
		expect(workspace.formatScopeSet(workspace.getMemberAccessShape(editableMember).scopeSet)).toBe('1st Platoon');

		workspace.toggleMemberScopeGroup('member-1', 'group-bravo', true);
		expect(workspace.getSelectedScopeGroupIds(editableMember)).toEqual(['group-alpha', 'group-bravo']);

		workspace.closeMemberEditor('member-1');

		expect(workspace.memberEditorId).toBeNull();
		expect(workspace.memberSelectedPreset).toEqual({});
		expect(workspace.memberSelectedScopeKind).toEqual({});
		expect(workspace.memberSelectedScopeGroupIds).toEqual({});
	});

	it('normalizes custom member presets to an editable draft preset', () => {
		const workspace = makeWorkspace({
			members: [
				member('member-1', 'member-a@example.com', 'member', {
					memberPreset: 'custom',
					capabilityOverrides: { calendar: 'operate' }
				})
			]
		});
		const [editableMember] = workspace.sortedMembers;

		expect(workspace.getSelectedPreset(editableMember)).toBe('editor');

		workspace.openMemberEditor(editableMember);

		expect(workspace.getSelectedPreset(editableMember)).toBe('editor');
	});

	it('keeps admin preset choices owner-only and uses editor capabilities for admin drafts', () => {
		const ownerWorkspace = makeWorkspace({ isOwner: true });
		const adminMember = ownerWorkspace.sortedMembers.find((candidate) => candidate.role === 'admin');
		if (!adminMember) throw new Error('Expected admin member');

		expect(ownerWorkspace.availablePresetOptions.map((option) => option.value)).toContain('admin');
		ownerWorkspace.openMemberEditor(adminMember);
		expect(ownerWorkspace.getSelectedPreset(adminMember)).toBe('admin');
		expect(ownerWorkspace.getEditorCapabilityValue(adminMember, 'calendar', 'admin')).toBe('configure');
		expect(ownerWorkspace.getMemberAccessBadge(adminMember, ownerWorkspace.getMemberAccessShape(adminMember))).toBe(
			'admin'
		);
		expect(ownerWorkspace.getAccessLabel('admin')).toBe('Admin governance');

		const adminWorkspace = makeWorkspace({ isOwner: false });
		expect(adminWorkspace.availablePresetOptions.map((option) => option.value)).not.toContain('admin');
	});

	it('owns invite preset and Scope Set draft state alongside member access state', () => {
		const workspace = makeWorkspace();

		expect(workspace.invitePreset).toBe('editor');
		expect(workspace.inviteScopeKind).toBe('organization');
		expect(workspace.inviteScopeGroupIds).toEqual([]);

		workspace.inviteEmail = 'leader@example.com';
		workspace.invitePreset = 'operator';
		workspace.setInviteScopeKind('groups');
		workspace.toggleInviteScopeGroup('group-alpha', true);
		workspace.toggleInviteScopeGroup('group-alpha', true);
		workspace.toggleInviteScopeGroup('group-bravo', true);
		workspace.toggleInviteScopeGroup('group-alpha', false);

		expect(workspace.inviteEmail).toBe('leader@example.com');
		expect(workspace.invitePreset).toBe('operator');
		expect(workspace.inviteScopeKind).toBe('groups');
		expect(workspace.inviteScopeGroupIds).toEqual(['group-bravo']);

		workspace.clearInviteEmail();
		expect(workspace.inviteEmail).toBe('');
		expect(workspace.inviteScopeKind).toBe('organization');
		expect(workspace.inviteScopeGroupIds).toEqual([]);
	});

	it('projects pending invitation legacy permissions through the existing preset labels', () => {
		const workspace = makeWorkspace();
		const invite: OrganizationInvitation = {
			id: 'invite-1',
			organizationId: 'org-1',
			email: 'invite@example.com',
			status: 'pending',
			permissions: {
				...fullEditorPermissions,
				canEditCalendar: false,
				canEditPersonnel: false,
				canEditTraining: false,
				canEditCriticalTasks: false,
				canEditOnboarding: false,
				canEditRatingScheme: false
			},
			scopedGroupId: null,
			createdAt: '2026-04-01T00:00:00Z'
		};

		expect(workspace.getInvitePreset(invite)).toBe('viewer');
	});

	it('projects flat pending invitation permissions through the existing preset labels', () => {
		const workspace = makeWorkspace();

		expect(
			workspace.getInvitePreset({
				id: 'invite-1',
				email: 'invite@example.com',
				status: 'pending',
				...fullEditorPermissions,
				canEditCalendar: false,
				canEditPersonnel: false,
				canEditTraining: false,
				canEditCriticalTasks: false,
				canEditOnboarding: false,
				canEditRatingScheme: false,
				scopedGroupId: null,
				createdAt: '2026-04-01T00:00:00Z'
			})
		).toBe('viewer');
	});
});
