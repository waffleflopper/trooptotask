import { describe, it, expect } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createOrgContext } from './orgContext.svelte';

function makeInput(overrides: Record<string, unknown> = {}) {
	return {
		orgId: 'org-1',
		orgName: 'Test Org',
		userId: 'user-1',
		userRole: 'member' as const,
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

	it('preserves orgId, orgName, and userId', () => {
		const ctx = createOrgContext(makeInput({ orgId: 'org-abc', orgName: 'Alpha Co', userId: 'user-xyz' }));
		expect(ctx.orgId).toBe('org-abc');
		expect(ctx.orgName).toBe('Alpha Co');
		expect(ctx.userId).toBe('user-xyz');
	});

	it('can reflect updated layout data through an accessor input', () => {
		let input = makeInput({
			orgId: 'org-1',
			orgName: 'Alpha Co',
			userRole: 'member',
			capabilityMap: {
				calendar: 'view',
				personnel: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			}
		});

		const ctx = createOrgContext(() => input);

		expect(ctx.orgId).toBe('org-1');
		expect(ctx.orgName).toBe('Alpha Co');
		expect(ctx.isAdmin).toBe(false);
		expect(ctx.hasCapability('calendar', 'operate')).toBe(false);

		input = makeInput({
			orgId: 'org-2',
			orgName: 'Bravo Co',
			userRole: 'admin',
			capabilityMap: {
				calendar: 'operate',
				personnel: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			}
		});

		expect(ctx.orgId).toBe('org-2');
		expect(ctx.orgName).toBe('Bravo Co');
		expect(ctx.isAdmin).toBe(true);
		expect(ctx.hasCapability('calendar', 'operate')).toBe(true);
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

		expect(owner.affordanceForGovernanceAction(POLICY_ACTION_CATALOG.organization.accessAuditLogs).allowed).toBe(true);
		expect(admin.affordanceForGovernanceAction(POLICY_ACTION_CATALOG.organization.accessGovernance).allowed).toBe(true);
		expect(admin.affordanceForGovernanceAction(POLICY_ACTION_CATALOG.organization.accessAuditLogs).reason).toBe(
			'denied:owner-only'
		);
		expect(member.affordanceForGovernanceAction(POLICY_ACTION_CATALOG.organization.accessGovernance).reason).toBe(
			'denied:governance-role'
		);
	});

	it('explains in-scope and out-of-scope client affordance states', () => {
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

		expect(
			ctx.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability, {
				kind: 'group',
				groupId: 'group-alpha'
			}).allowed
		).toBe(true);
		expect(
			ctx.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability, {
				kind: 'group',
				groupId: 'group-alpha'
			})
		).toMatchObject({ allowed: true, visible: true, disabled: false });
		expect(
			ctx.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability, {
				kind: 'group',
				groupId: 'group-bravo'
			})
		).toMatchObject({ allowed: false, visible: false, disabled: true });
		expect(ctx.isResourceInScope({ kind: 'group', groupId: 'group-alpha' })).toBe(true);
		expect(ctx.isResourceInScope({ kind: 'group', groupId: 'group-bravo' })).toBe(false);
		expect(
			ctx.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability, {
				kind: 'group',
				groupId: 'group-bravo'
			}).reason
		).toBe('denied:out-of-scope');
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
