import { describe, it, expect } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createClientAccess, type ClientAccessFacts } from './clientAccess';

function makeInput(overrides: Partial<ClientAccessFacts> = {}): ClientAccessFacts {
	return { membershipRole: 'member', ...overrides };
}

describe('client advisory access', () => {
	it('falls back for missing maps while explicit grants and empty scopes win', () => {
		const owner = createClientAccess({ membershipRole: 'owner' });
		const member = createClientAccess({ membershipRole: 'member' });
		expect(owner.hasCapability('calendar', 'configure')).toBe(true);
		expect(member.hasCapability('calendar', 'view')).toBe(false);
		const explicit = createClientAccess({
			membershipRole: 'owner',
			capabilityMap: member.capabilityMap,
			scopeSet: { kind: 'groups', groupIds: [] }
		});
		expect(explicit.hasCapability('calendar', 'view')).toBe(false);
		expect(explicit.isResourceInScope({ kind: 'organization' })).toBe(false);
		expect(explicit.isResourceInScope({ kind: 'unscoped' })).toBe(true);
	});
	it('reevaluates same-instance grant refreshes without freezing permissions', () => {
		let facts: ClientAccessFacts = { membershipRole: 'member' };
		const access = createClientAccess(() => facts);
		expect(access.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability).allowed).toBe(false);
		facts = { membershipRole: 'admin' };
		expect(access.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability).allowed).toBe(true);
		facts = {
			membershipRole: 'member',
			capabilityMap: access.capabilityMap,
			scopeSet: { kind: 'groups', groupIds: ['a'] }
		};
		expect(
			access.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability, {
				kind: 'group',
				groupId: 'a'
			}).allowed
		).toBe(true);
		expect(
			access.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability, {
				kind: 'group',
				groupId: 'b'
			}).allowed
		).toBe(false);
	});
	it('uses Capability Map for viewer, operator, and editor feature affordances', () => {
		const ctx = createClientAccess(
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
		const owner = createClientAccess(
			makeInput({
				membershipRole: 'owner',
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
		const admin = createClientAccess(makeInput({ membershipRole: 'admin', capabilityMap: owner.capabilityMap }));
		const member = createClientAccess(makeInput({ membershipRole: 'member', capabilityMap: owner.capabilityMap }));

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
		const ctx = createClientAccess(
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
		const ctx = createClientAccess(
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
