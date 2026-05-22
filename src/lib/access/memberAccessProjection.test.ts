import { describe, expect, it } from 'vitest';
import {
	projectEffectiveInvitationAccess,
	projectEffectiveMemberAccess,
	projectMemberPermissions,
	projectStoredMemberAccessPresentation,
	type MemberAccessProjectionRow
} from './memberAccessProjection';

const baseMemberRow: MemberAccessProjectionRow = {
	role: 'member',
	scoped_group_id: null,
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
	can_manage_members: false
};

describe('member access projection', () => {
	it('projects privileged effective access without using stored row limits', () => {
		const projection = projectEffectiveMemberAccess({
			...baseMemberRow,
			role: 'admin',
			scoped_group_id: 'group-alpha',
			can_view_calendar: false,
			can_view_personnel: false,
			can_view_training: false,
			can_view_onboarding: false,
			member_preset: 'viewer',
			capability_overrides: { calendar: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-alpha']
		});

		expect(projection.isPrivileged).toBe(true);
		expect(projection.memberPreset).toBe('editor');
		expect(projection.scopedGroupId).toBeNull();
		expect(projection.scopeSet).toEqual({ kind: 'organization' });
		expect(Object.values(projection.capabilityMap)).toEqual([
			'configure',
			'configure',
			'configure',
			'configure',
			'configure',
			'configure'
		]);
		expect(Object.values(projection.canView)).toEqual([true, true, true, true, true, true]);
		expect(Object.values(projection.canEdit)).toEqual([true, true, true, true, true, true]);
		expect(projection.canManageMembers).toBe(true);
	});

	it('projects legacy nonprivileged access with rating-scheme fallback and group scope', () => {
		const projection = projectEffectiveMemberAccess({
			...baseMemberRow,
			scoped_group_id: 'group-alpha',
			can_edit_calendar: true,
			can_edit_personnel: true,
			can_edit_training: true,
			can_edit_critical_tasks: true,
			can_edit_onboarding: true
		});

		expect(projection.isPrivileged).toBe(false);
		expect(projection.scopedGroupId).toBe('group-alpha');
		expect(projection.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-alpha'] });
		expect(projection.canView['rating-scheme']).toBe(true);
		expect(projection.canEdit['rating-scheme']).toBe(true);
		expect(projection.capabilityMap.ratingScheme).toBe('configure');
	});

	it('prefers stored access columns for effective nonprivileged scope and capabilities', () => {
		const projection = projectEffectiveMemberAccess({
			...baseMemberRow,
			scoped_group_id: 'legacy-group',
			member_preset: 'viewer',
			capability_overrides: { calendar: 'operate', ratingScheme: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['stored-group', 'stored-group', 'other-group']
		});

		expect(projection.scopedGroupId).toBe('legacy-group');
		expect(projection.scopeSet).toEqual({ kind: 'groups', groupIds: ['stored-group', 'other-group'] });
		expect(projection.memberPreset).toBe('viewer');
		expect(projection.capabilityMap.calendar).toBe('operate');
		expect(projection.capabilityMap.ratingScheme).toBe('none');
	});

	it('projects stored presentation without privileged overrides', () => {
		const presentation = projectStoredMemberAccessPresentation({
			...baseMemberRow,
			scoped_group_id: 'group-alpha',
			can_view_calendar: false,
			can_edit_calendar: false,
			can_view_personnel: true,
			can_edit_personnel: false,
			member_preset: 'viewer',
			capability_overrides: { calendar: 'operate', unknown: 'ignored' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-alpha', 42, 'group-bravo']
		});

		expect(presentation.permissions.canViewCalendar).toBe(false);
		expect(presentation.permissions.canEditCalendar).toBe(false);
		expect(presentation.permissions.canViewRatingScheme).toBe(true);
		expect(presentation.permissions.canEditRatingScheme).toBe(false);
		expect(presentation.scopedGroupId).toBe('group-alpha');
		expect(presentation.memberPreset).toBe('viewer');
		expect(presentation.capabilityOverrides).toEqual({ calendar: 'operate', unknown: 'ignored' });
		expect(presentation.accessScopeKind).toBe('groups');
		expect(presentation.accessScopeGroupIds).toEqual(['group-alpha', 'group-bravo']);
	});

	it('centralizes permission fallback for missing rating-scheme columns', () => {
		expect(
			projectMemberPermissions({
				...baseMemberRow,
				can_view_personnel: true,
				can_edit_personnel: false,
				can_view_rating_scheme: null,
				can_edit_rating_scheme: null
			})
		).toMatchObject({
			canViewRatingScheme: true,
			canEditRatingScheme: false
		});
	});

	it('projects legacy invitation access through the shared compatibility defaults', () => {
		const projection = projectEffectiveInvitationAccess({
			scoped_group_id: 'group-alpha',
			can_view_calendar: null,
			can_edit_calendar: null,
			can_view_personnel: null,
			can_edit_personnel: null,
			can_view_training: null,
			can_edit_training: null,
			can_view_critical_tasks: null,
			can_edit_critical_tasks: null,
			can_view_onboarding: null,
			can_edit_onboarding: null,
			can_view_rating_scheme: null,
			can_edit_rating_scheme: null,
			can_manage_members: null
		});

		expect(projection.role).toBe('member');
		expect(projection.memberPreset).toBe('operator');
		expect(projection.permissions.canEditCalendar).toBe(true);
		expect(projection.permissions.canEditRatingScheme).toBe(true);
		expect(projection.scopedGroupId).toBe('group-alpha');
		expect(projection.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-alpha'] });
	});

	it('infers admin invitation access only from full compatibility authority plus member management', () => {
		const projection = projectEffectiveInvitationAccess({
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
			can_manage_members: true,
			member_preset: 'viewer',
			capability_overrides: { calendar: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['legacy-group']
		});

		expect(projection.role).toBe('admin');
		expect(projection.memberPreset).toBe('editor');
		expect(projection.scopeSet).toEqual({ kind: 'organization' });
		expect(projection.permissions.canManageMembers).toBe(true);
	});

	it('infers admin invitation access when nullable rating-scheme flags inherit personnel access', () => {
		const projection = projectEffectiveInvitationAccess({
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
			can_view_rating_scheme: null,
			can_edit_rating_scheme: null,
			can_manage_members: true
		});

		expect(projection.role).toBe('admin');
		expect(projection.permissions.canViewRatingScheme).toBe(true);
		expect(projection.permissions.canEditRatingScheme).toBe(true);
	});

	it('does not infer admin invitation access from nullable compatibility flags', () => {
		const projection = projectEffectiveInvitationAccess({
			can_view_calendar: null,
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
			can_manage_members: true
		});

		expect(projection.role).toBe('member');
		expect(projection.permissions.canViewCalendar).toBe(true);
		expect(projection.permissions.canManageMembers).toBe(true);
	});

	it('does not project owner access from invitation role values', () => {
		const projection = projectEffectiveInvitationAccess({
			role: 'owner',
			can_manage_members: true
		});

		expect(projection.role).toBe('member');
		expect(projection.isOwner).toBe(false);
	});
});
