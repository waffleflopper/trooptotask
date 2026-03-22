import { describe, it, expect } from 'vitest';
import { createOrgContext } from './orgContext.svelte';
import type { OrganizationMemberPermissions } from '$lib/types';

const fullPermissions: OrganizationMemberPermissions = {
	canViewCalendar: true,
	canEditCalendar: true,
	canViewPersonnel: true,
	canEditPersonnel: true,
	canViewTraining: true,
	canEditTraining: true,
	canViewOnboarding: true,
	canEditOnboarding: true,
	canViewLeadersBook: true,
	canEditLeadersBook: true,
	canManageMembers: true
};

const viewerPermissions: OrganizationMemberPermissions = {
	canViewCalendar: true,
	canEditCalendar: false,
	canViewPersonnel: true,
	canEditPersonnel: false,
	canViewTraining: true,
	canEditTraining: false,
	canViewOnboarding: true,
	canEditOnboarding: false,
	canViewLeadersBook: true,
	canEditLeadersBook: false,
	canManageMembers: false
};

function makeInput(overrides: Record<string, unknown> = {}) {
	return {
		orgId: 'org-1',
		orgName: 'Test Org',
		userId: 'user-1',
		userRole: 'member' as const,
		permissions: fullPermissions,
		scopedGroupId: null as string | null,
		isReadOnly: false,
		...overrides
	};
}

describe('createOrgContext', () => {
	it('sets isOwner=true when role is owner', () => {
		const ctx = createOrgContext(makeInput({ userRole: 'owner' }));
		expect(ctx.isOwner).toBe(true);
		expect(ctx.role).toBe('owner');
	});

	it('sets isOwner=false when role is not owner', () => {
		const ctx = createOrgContext(makeInput({ userRole: 'admin' }));
		expect(ctx.isOwner).toBe(false);
	});

	it('sets isAdmin=true when role is admin', () => {
		const ctx = createOrgContext(makeInput({ userRole: 'admin' }));
		expect(ctx.isAdmin).toBe(true);
		expect(ctx.role).toBe('admin');
	});

	it('sets isAdmin=false when role is not admin', () => {
		const ctx = createOrgContext(makeInput({ userRole: 'member' }));
		expect(ctx.isAdmin).toBe(false);
	});

	it('sets isPrivileged=true for owner', () => {
		const ctx = createOrgContext(makeInput({ userRole: 'owner' }));
		expect(ctx.isPrivileged).toBe(true);
	});

	it('sets isPrivileged=true for admin', () => {
		const ctx = createOrgContext(makeInput({ userRole: 'admin' }));
		expect(ctx.isPrivileged).toBe(true);
	});

	it('sets isPrivileged=false for member', () => {
		const ctx = createOrgContext(makeInput({ userRole: 'member' }));
		expect(ctx.isPrivileged).toBe(false);
	});

	it('derives isFullEditor=true when all permission booleans are true and not privileged and not scoped', () => {
		const ctx = createOrgContext(
			makeInput({
				userRole: 'member',
				permissions: fullPermissions,
				scopedGroupId: null
			})
		);
		expect(ctx.isFullEditor).toBe(true);
	});

	it('sets isFullEditor=false when any permission is false', () => {
		const ctx = createOrgContext(
			makeInput({
				userRole: 'member',
				permissions: { ...fullPermissions, canEditCalendar: false }
			})
		);
		expect(ctx.isFullEditor).toBe(false);
	});

	it('sets isFullEditor=false for privileged roles even with all permissions', () => {
		const ctx = createOrgContext(
			makeInput({
				userRole: 'owner',
				permissions: fullPermissions
			})
		);
		// Owners/admins are privileged, not "full editors" (they're higher)
		expect(ctx.isFullEditor).toBe(false);
	});

	it('sets isFullEditor=false when member has scoped group even with all permissions', () => {
		const ctx = createOrgContext(
			makeInput({
				userRole: 'member',
				permissions: fullPermissions,
				scopedGroupId: 'group-1'
			})
		);
		expect(ctx.isFullEditor).toBe(false);
	});

	it('sets readOnly from isReadOnly flag', () => {
		const ctx = createOrgContext(makeInput({ isReadOnly: true }));
		expect(ctx.readOnly).toBe(true);
	});

	it('sets readOnly=false when isReadOnly is false', () => {
		const ctx = createOrgContext(makeInput({ isReadOnly: false }));
		expect(ctx.readOnly).toBe(false);
	});

	it('preserves scopedGroupId', () => {
		const ctx = createOrgContext(makeInput({ scopedGroupId: 'group-42' }));
		expect(ctx.scopedGroupId).toBe('group-42');
	});

	it('preserves null scopedGroupId', () => {
		const ctx = createOrgContext(makeInput({ scopedGroupId: null }));
		expect(ctx.scopedGroupId).toBeNull();
	});

	it('preserves all permission fields', () => {
		const ctx = createOrgContext(makeInput({ permissions: viewerPermissions }));
		expect(ctx.permissions).toEqual(viewerPermissions);
	});

	it('preserves orgId, orgName, and userId', () => {
		const ctx = createOrgContext(makeInput({ orgId: 'org-abc', orgName: 'Alpha Co', userId: 'user-xyz' }));
		expect(ctx.orgId).toBe('org-abc');
		expect(ctx.orgName).toBe('Alpha Co');
		expect(ctx.userId).toBe('user-xyz');
	});

	it('handles null userId', () => {
		const ctx = createOrgContext(makeInput({ userId: null }));
		expect(ctx.userId).toBeNull();
	});
});
