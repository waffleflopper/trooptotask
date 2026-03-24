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
		expect(ctx.canManageMembers).toBe(false);
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

		expect(ctx.scopedGroupId).toBe('group-123');
	});

	it('ignores scoped_group_id for privileged roles', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			role: 'owner',
			scoped_group_id: 'group-123'
		});

		expect(ctx.scopedGroupId).toBeNull();
	});

	it('detects full editor (member with all permissions, no scope)', () => {
		const ctx = createPermissionContextFromMembership({
			role: 'member',
			scoped_group_id: null,
			can_view_calendar: true,
			can_edit_calendar: true,
			can_view_personnel: true,
			can_edit_personnel: true,
			can_view_training: true,
			can_edit_training: true,
			can_view_onboarding: true,
			can_edit_onboarding: true,
			can_view_leaders_book: true,
			can_edit_leaders_book: true,
			can_manage_members: true
		});

		expect(ctx.isFullEditor).toBe(true);
	});

	it('requireEdit throws for areas without edit permission', () => {
		const ctx = createPermissionContextFromMembership(baseMembership);

		expect(() => ctx.requireEdit('calendar')).toThrow();
		expect(() => ctx.requireEdit('personnel')).not.toThrow();
	});

	it('requireView throws for areas without view permission', () => {
		const ctx = createPermissionContextFromMembership(baseMembership);

		expect(() => ctx.requireView('training')).toThrow();
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
