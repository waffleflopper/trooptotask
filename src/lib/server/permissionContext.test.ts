import { describe, it, expect } from 'vitest';
import { createPermissionContextFromMembership } from './permissionContext';

describe('createPermissionContextFromMembership', () => {
	const baseMembership = {
		role: 'member' as const,
		scoped_group_id: null as string | null,
		can_view_calendar: true,
		can_edit_calendar: false,
		can_view_personnel: true,
		can_edit_personnel: true,
		can_view_training: false,
		can_edit_training: false,
		can_view_critical_tasks: false,
		can_edit_critical_tasks: false,
		can_view_onboarding: true,
		can_edit_onboarding: false,
		can_view_leaders_book: true,
		can_edit_leaders_book: false,
		can_manage_members: false
	};

	it('builds correct role and privilege flags for a member', () => {
		const ctx = createPermissionContextFromMembership(baseMembership);

		expect(ctx.role).toBe('member');
		expect(ctx.isOwner).toBe(false);
		expect(ctx.isAdmin).toBe(false);
		expect(ctx.isPrivileged).toBe(false);
	});

	it('builds correct role and privilege flags for an owner', () => {
		const ctx = createPermissionContextFromMembership({ ...baseMembership, role: 'owner' });

		expect(ctx.role).toBe('owner');
		expect(ctx.isOwner).toBe(true);
		expect(ctx.isPrivileged).toBe(true);
	});

	it('builds correct role and privilege flags for an admin', () => {
		const ctx = createPermissionContextFromMembership({ ...baseMembership, role: 'admin' });

		expect(ctx.role).toBe('admin');
		expect(ctx.isAdmin).toBe(true);
		expect(ctx.isPrivileged).toBe(true);
	});

	it('maps permission booleans correctly for a member', () => {
		const ctx = createPermissionContextFromMembership(baseMembership);

		expect(ctx.canView.calendar).toBe(true);
		expect(ctx.canEdit.calendar).toBe(false);
		expect(ctx.canView.personnel).toBe(true);
		expect(ctx.canEdit.personnel).toBe(true);
		expect(ctx.canView.training).toBe(false);
		expect(ctx.canEdit.training).toBe(false);
		expect(ctx.canView['critical-tasks']).toBe(false);
		expect(ctx.canEdit['critical-tasks']).toBe(false);
		expect(ctx.canView['rating-scheme']).toBe(true);
		expect(ctx.canEdit['rating-scheme']).toBe(false);
		expect(ctx.canManageMembers).toBe(false);
	});

	it('prefers explicit rating scheme flags over the legacy fallback shape', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			can_view_rating_scheme: false,
			can_edit_rating_scheme: false,
			can_edit_leaders_book: true
		});

		expect(ctx.canView['rating-scheme']).toBe(false);
		expect(ctx.canEdit['rating-scheme']).toBe(false);
	});

	it('grants all permissions for privileged roles regardless of flags', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			role: 'admin',
			can_view_training: false,
			can_edit_training: false
		});

		expect(ctx.canView.training).toBe(true);
		expect(ctx.canEdit.training).toBe(true);
	});

	it('respects scoped_group_id for members', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			scoped_group_id: 'group-123'
		});

		expect(ctx.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-123'] });
	});

	it('uses stored capability and multi-Group scope when available', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			can_view_personnel: false,
			can_edit_personnel: false,
			member_preset: 'viewer',
			capability_overrides: { personnel: 'operate' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-a', 'group-b']
		});

		expect(ctx.capabilityMap.personnel).toBe('operate');
		expect(ctx.compatibilityLanes.leadersBook).toBe('operate');
		expect(ctx.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
	});

	it("keeps Leader's Book compatibility capability separate from the durable capability map", () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			can_view_leaders_book: false,
			can_edit_leaders_book: false,
			member_preset: 'viewer',
			capability_overrides: { personnel: 'operate' },
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		});

		expect(Object.keys(ctx.capabilityMap)).not.toContain('leadersBook');
		expect(ctx.compatibilityLanes.leadersBook).toBe('operate');
		expect(ctx.canView['leaders-book']).toBe(false);
	});

	it('does not let legacy flags or scoped_group_id override stored member access', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			scoped_group_id: 'legacy-group',
			can_view_calendar: false,
			can_edit_calendar: false,
			member_preset: 'viewer',
			capability_overrides: { calendar: 'operate' },
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		});

		expect(ctx.capabilityMap.calendar).toBe('operate');
		expect(ctx.scopeSet).toEqual({ kind: 'organization' });
	});

	it('ignores scoped_group_id for privileged roles', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			role: 'owner',
			scoped_group_id: 'group-123'
		});

		expect(ctx.scopeSet).toEqual({ kind: 'organization' });
	});

	it('maps all-permission members to organization-wide configure capabilities', () => {
		const ctx = createPermissionContextFromMembership({
			role: 'member',
			scoped_group_id: null,
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
			can_view_leaders_book: true,
			can_edit_leaders_book: true,
			can_manage_members: true
		});

		expect(ctx.capabilityMap).toMatchObject({
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'configure',
			onboarding: 'configure'
		});
	});

	it('does not map disabled critical tasks permissions to configure capability', () => {
		const ctx = createPermissionContextFromMembership({
			role: 'member',
			scoped_group_id: null,
			can_view_calendar: true,
			can_edit_calendar: true,
			can_view_personnel: true,
			can_edit_personnel: true,
			can_view_training: true,
			can_edit_training: true,
			can_view_critical_tasks: false,
			can_edit_critical_tasks: false,
			can_view_onboarding: true,
			can_edit_onboarding: true,
			can_view_leaders_book: true,
			can_edit_leaders_book: true,
			can_manage_members: true
		});

		expect(ctx.capabilityMap.criticalTasks).not.toBe('configure');
	});

	it('requireView throws for areas without view permission', () => {
		const ctx = createPermissionContextFromMembership(baseMembership);

		expect(() => ctx.requireView('training')).toThrow();
		expect(() => ctx.requireView('critical-tasks')).toThrow();
		expect(() => ctx.requireView('calendar')).not.toThrow();
	});

	it('requirePrivileged throws for members', () => {
		const ctx = createPermissionContextFromMembership(baseMembership);
		expect(() => ctx.requirePrivileged()).toThrow();
	});

	it('requireOwner throws for admins', () => {
		const ctx = createPermissionContextFromMembership({ ...baseMembership, role: 'admin' });
		expect(() => ctx.requireOwner()).toThrow();
	});
});
