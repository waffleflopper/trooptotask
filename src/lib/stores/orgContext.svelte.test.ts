import { describe, it, expect } from 'vitest';
import { createCompatibilityLaneMap } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createOrgContext } from './orgContext.svelte';
import type { OrganizationMemberPermissions } from '$lib/types';

const fullPermissions: OrganizationMemberPermissions = {
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
	canViewCriticalTasks: true,
	canEditCriticalTasks: false,
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

	it('sets isFullEditor=false when Critical Tasks permissions are disabled', () => {
		const ctx = createOrgContext(
			makeInput({
				userRole: 'member',
				permissions: {
					...fullPermissions,
					canViewCriticalTasks: false,
					canEditCriticalTasks: false
				},
				scopedGroupId: null
			})
		);
		expect(ctx.isFullEditor).toBe(false);
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

	it('can reflect updated layout data through an accessor input', () => {
		let input = makeInput({ orgId: 'org-1', orgName: 'Alpha Co', userRole: 'member', permissions: viewerPermissions });

		const ctx = createOrgContext(() => input);

		expect(ctx.orgId).toBe('org-1');
		expect(ctx.orgName).toBe('Alpha Co');
		expect(ctx.isAdmin).toBe(false);
		expect(ctx.permissions).toEqual(viewerPermissions);

		input = makeInput({ orgId: 'org-2', orgName: 'Bravo Co', userRole: 'admin', permissions: fullPermissions });

		expect(ctx.orgId).toBe('org-2');
		expect(ctx.orgName).toBe('Bravo Co');
		expect(ctx.isAdmin).toBe(true);
		expect(ctx.permissions).toEqual(fullPermissions);
	});

	it('handles null userId', () => {
		const ctx = createOrgContext(makeInput({ userId: null }));
		expect(ctx.userId).toBeNull();
	});

	it('uses Capability Map for viewer, operator, and editor feature affordances', () => {
		const ctx = createOrgContext(
			makeInput({
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'configure',
					criticalTasks: 'none',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			})
		);

		expect(ctx.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.viewAvailability).allowed).toBe(true);
		expect(ctx.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability).reason).toBe(
			'denied:missing-capability'
		);
		expect(ctx.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.manageRecords).allowed).toBe(true);
		expect(ctx.affordanceForFeatureAction(POLICY_ACTION_CATALOG.training.configureRequirements).allowed).toBe(true);
		expect(ctx.hasCapability('training', 'configure')).toBe(true);
		expect(ctx.hasCapability('calendar', 'operate')).toBe(false);
	});

	it("uses compatibility lanes for Leader's Book client affordances without durable lane promotion", () => {
		const ctx = createOrgContext(
			makeInput({
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				compatibilityLanes: createCompatibilityLaneMap('view'),
				scopeSet: { kind: 'organization' }
			})
		);

		expect(Object.keys(ctx.capabilityMap)).not.toContain('leadersBook');
		expect(ctx.affordanceForFeatureAction(POLICY_ACTION_CATALOG.leadersBook.viewRecords).allowed).toBe(true);
		expect(ctx.affordanceForFeatureAction(POLICY_ACTION_CATALOG.leadersBook.updateRecords).reason).toBe(
			'denied:missing-capability'
		);
	});

	it('uses governance role for organization affordances instead of member feature capabilities', () => {
		const owner = createOrgContext(
			makeInput({
				userRole: 'owner',
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			})
		);
		const admin = createOrgContext(makeInput({ userRole: 'admin', capabilityMap: owner.capabilityMap }));
		const member = createOrgContext(makeInput({ userRole: 'member', capabilityMap: owner.capabilityMap }));

		expect(owner.affordanceForGovernanceAction(POLICY_ACTION_CATALOG.organization.accessBilling).allowed).toBe(true);
		expect(admin.affordanceForGovernanceAction(POLICY_ACTION_CATALOG.organization.accessGovernance).allowed).toBe(true);
		expect(admin.affordanceForGovernanceAction(POLICY_ACTION_CATALOG.organization.accessBilling).reason).toBe(
			'denied:owner-only'
		);
		expect(member.affordanceForGovernanceAction(POLICY_ACTION_CATALOG.organization.accessGovernance).reason).toBe(
			'denied:governance-role'
		);
	});

	it('explains in-scope, out-of-scope, and read-only client affordance states', () => {
		const ctx = createOrgContext(
			makeInput({
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
			})
		);
		const readOnlyCtx = createOrgContext(
			makeInput({
				capabilityMap: ctx.capabilityMap,
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
				isReadOnly: true
			})
		);

		expect(
			ctx.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability, {
				kind: 'group',
				groupId: 'group-alpha'
			}).allowed
		).toBe(true);
		expect(ctx.isResourceInScope({ kind: 'group', groupId: 'group-alpha' })).toBe(true);
		expect(ctx.isResourceInScope({ kind: 'group', groupId: 'group-bravo' })).toBe(false);
		expect(
			ctx.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability, {
				kind: 'group',
				groupId: 'group-bravo'
			}).reason
		).toBe('denied:out-of-scope');

		const readOnlyAffordance = readOnlyCtx.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.calendar.manageAvailability,
			{
				kind: 'group',
				groupId: 'group-alpha'
			}
		);
		expect(readOnlyAffordance.allowed).toBe(false);
		expect(readOnlyAffordance.visible).toBe(true);
		expect(readOnlyAffordance.disabled).toBe(true);
		expect(readOnlyAffordance.reason).toBe('denied:read-only-overlay');
		expect(readOnlyAffordance.explanation).toContain('read-only mode');
	});

	it('checks Scope Set membership independently from feature capability', () => {
		const ctx = createOrgContext(
			makeInput({
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
			})
		);

		expect(ctx.isResourceInScope({ kind: 'group', groupId: 'group-alpha' })).toBe(true);
		expect(ctx.isResourceInScope({ kind: 'group', groupId: 'group-bravo' })).toBe(false);
		expect(ctx.isResourceInScope({ kind: 'organization' })).toBe(false);
	});
});
