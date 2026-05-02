import { describe, expect, it } from 'vitest';
import {
	evaluatePolicyDecision,
	POLICY_ACTION_CATALOG,
	POLICY_REASON_CODES,
	policyEvaluator,
	type PolicyEvaluationInput,
	type PolicyEvaluator
} from './policyEvaluator';

const baseCapabilityMap: PolicyEvaluationInput['capabilityMap'] = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
};

describe('policy evaluator', () => {
	it('allows an authoritative workflow action when capability and scope match', () => {
		const evaluator: PolicyEvaluator = policyEvaluator;
		const decision = evaluator.evaluate({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member' },
			action: POLICY_ACTION_CATALOG.calendar.viewAvailability,
			capabilityMap: { ...baseCapabilityMap, calendar: 'view' },
			scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
			resource: { kind: 'group', groupId: 'group-alpha' },
			overlays: []
		});

		expect(decision).toMatchObject({
			allowed: true,
			decisionKind: 'server-authoritative',
			reasonCode: 'allowed:capability',
			action: {
				id: 'calendar.viewAvailability',
				owner: { kind: 'feature-lane', lane: 'calendar' },
				requiredCapability: 'view'
			},
			matchedCapability: { lane: 'calendar', actual: 'view', required: 'view' },
			matchedScope: { kind: 'group', groupId: 'group-alpha' },
			audit: { capture: false, category: 'ordinary-read' }
		});
	});

	it('denies a feature action when the capability level is too low', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member' },
			action: POLICY_ACTION_CATALOG.calendar.manageAvailability,
			capabilityMap: { ...baseCapabilityMap, calendar: 'view' },
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' },
			overlays: []
		});

		expect(decision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:missing-capability',
			matchedCapability: { lane: 'calendar', actual: 'view', required: 'operate' },
			audit: { capture: true, category: 'denied' }
		});
	});

	it('denies a feature action outside the actor scope set', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member' },
			action: POLICY_ACTION_CATALOG.personnel.manageRecords,
			capabilityMap: { ...baseCapabilityMap, personnel: 'operate' },
			scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
			resource: { kind: 'group', groupId: 'group-bravo' },
			overlays: []
		});

		expect(decision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:out-of-scope',
			matchedCapability: { lane: 'personnel', actual: 'operate', required: 'operate' },
			matchedScope: { kind: 'out-of-scope', resource: { kind: 'group', groupId: 'group-bravo' } }
		});
	});

	it('defines Personnel workflow actions with Personnel lane ownership', () => {
		expect(POLICY_ACTION_CATALOG.personnel.viewRoster).toMatchObject({
			id: 'personnel.viewRoster',
			accessMode: 'read',
			owner: { kind: 'feature-lane', lane: 'personnel' },
			requiredCapability: 'view'
		});
		expect(POLICY_ACTION_CATALOG.personnel.manageRecords).toMatchObject({
			id: 'personnel.manageRecords',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'personnel' },
			requiredCapability: 'operate'
		});
	});

	it('defines Rating Scheme workflow actions with Rating Scheme lane ownership', () => {
		expect(POLICY_ACTION_CATALOG.ratingScheme.viewEntries).toMatchObject({
			id: 'ratingScheme.viewEntries',
			accessMode: 'read',
			owner: { kind: 'feature-lane', lane: 'ratingScheme' },
			requiredCapability: 'view'
		});
		expect(POLICY_ACTION_CATALOG.ratingScheme.updateEntries).toMatchObject({
			id: 'ratingScheme.updateEntries',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'ratingScheme' },
			requiredCapability: 'operate'
		});
		expect(POLICY_ACTION_CATALOG.ratingScheme.configureWorkflows).toMatchObject({
			id: 'ratingScheme.configureWorkflows',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'ratingScheme' },
			requiredCapability: 'configure'
		});
	});

	it('keeps adjacent roster reference reads owned by the adjacent feature lane', () => {
		expect(POLICY_ACTION_CATALOG.ratingScheme.readRosterReferences).toMatchObject({
			id: 'ratingScheme.readRosterReferences',
			accessMode: 'read',
			owner: { kind: 'feature-lane', lane: 'ratingScheme' },
			requiredCapability: 'view'
		});
	});

	it('lets read-only overlays block writes after capability and scope pass', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member' },
			action: POLICY_ACTION_CATALOG.calendar.manageAvailability,
			capabilityMap: { ...baseCapabilityMap, calendar: 'operate' },
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' },
			overlays: [{ id: 'billing-read-only', kind: 'read-only-mode', label: 'Billing read-only mode' }]
		});

		expect(decision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:read-only-overlay',
			blockingOverlay: { id: 'billing-read-only', kind: 'read-only-mode' },
			audit: { capture: true, category: 'denied' }
		});
	});

	it('allows admin governance actions without feature capability checks', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'admin' },
			action: POLICY_ACTION_CATALOG.organization.updateMemberAccess,
			capabilityMap: baseCapabilityMap,
			scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
			resource: { kind: 'organization' },
			overlays: []
		});

		expect(decision).toMatchObject({
			allowed: true,
			reasonCode: 'allowed:governance',
			action: { owner: { kind: 'organization-governance', access: 'admin-or-owner' } },
			audit: { capture: true, category: 'governance' }
		});
		expect(decision.matchedCapability).toBeUndefined();
	});

	it('denies governance actions to ordinary members without feature capability checks', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member' },
			action: POLICY_ACTION_CATALOG.organization.updateMemberAccess,
			capabilityMap: { ...baseCapabilityMap, personnel: 'configure' },
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' },
			overlays: []
		});

		expect(decision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:governance-role',
			action: { owner: { kind: 'organization-governance', access: 'admin-or-owner' } },
			audit: { capture: true, category: 'denied' }
		});
		expect(decision.matchedCapability).toBeUndefined();
	});

	it('keeps owner-only governance actions distinct from ordinary admin governance', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'admin' },
			action: POLICY_ACTION_CATALOG.organization.deleteOrganization,
			capabilityMap: { ...baseCapabilityMap, personnel: 'configure' },
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' },
			overlays: []
		});

		expect(decision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:owner-only',
			action: { owner: { kind: 'organization-governance', access: 'owner-only' } },
			audit: { capture: true, category: 'denied' }
		});
		expect(decision.matchedCapability).toBeUndefined();
	});

	it('lets read-only overlays block governance writes after role checks pass', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'admin' },
			action: POLICY_ACTION_CATALOG.organization.inviteMember,
			capabilityMap: baseCapabilityMap,
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' },
			overlays: [{ id: 'billing-read-only', kind: 'read-only-mode', label: 'Billing read-only mode' }]
		});

		expect(decision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:read-only-overlay',
			blockingOverlay: { id: 'billing-read-only', kind: 'read-only-mode' },
			audit: { capture: true, category: 'denied' }
		});
	});

	it('preserves advisory decisions as non-authoritative contract results', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'client-advisory',
			actor: { membershipRole: 'member' },
			action: POLICY_ACTION_CATALOG.training.viewMatrix,
			capabilityMap: { ...baseCapabilityMap, training: 'view' },
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' },
			overlays: []
		});

		expect(decision).toMatchObject({
			allowed: true,
			decisionKind: 'client-advisory',
			authority: { serverAuthoritative: false },
			reasonCode: 'allowed:capability'
		});
	});

	it('defines Critical Tasks workflow actions on the Critical Tasks lane', () => {
		expect(POLICY_ACTION_CATALOG.criticalTasks.viewReadiness).toMatchObject({
			id: 'criticalTasks.viewReadiness',
			accessMode: 'read',
			owner: { kind: 'feature-lane', lane: 'criticalTasks' },
			requiredCapability: 'view'
		});
		expect(POLICY_ACTION_CATALOG.criticalTasks.recordCompletion).toMatchObject({
			id: 'criticalTasks.recordCompletion',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'criticalTasks' },
			requiredCapability: 'operate'
		});
		expect(POLICY_ACTION_CATALOG.criticalTasks.configureLibrary).toMatchObject({
			id: 'criticalTasks.configureLibrary',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'criticalTasks' },
			requiredCapability: 'configure'
		});

		const operateDecision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member' },
			action: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
			capabilityMap: { ...baseCapabilityMap, training: 'none', criticalTasks: 'operate' },
			scopeSet: { kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] },
			resource: { kind: 'group', groupId: 'group-bravo' },
			overlays: []
		});
		expect(operateDecision).toMatchObject({
			allowed: true,
			matchedCapability: { lane: 'criticalTasks', actual: 'operate', required: 'operate' },
			matchedScope: { kind: 'group', groupId: 'group-bravo' },
			audit: { capture: true, category: 'write' }
		});

		const configureDecision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member' },
			action: POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
			capabilityMap: { ...baseCapabilityMap, training: 'configure', criticalTasks: 'operate' },
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' },
			overlays: []
		});
		expect(configureDecision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:missing-capability',
			matchedCapability: { lane: 'criticalTasks', actual: 'operate', required: 'configure' }
		});
	});

	it('exposes stable reason code constants through the public module', () => {
		expect(POLICY_REASON_CODES).toEqual({
			allowedCapability: 'allowed:capability',
			allowedGovernance: 'allowed:governance',
			deniedMissingCapability: 'denied:missing-capability',
			deniedOutOfScope: 'denied:out-of-scope',
			deniedReadOnlyOverlay: 'denied:read-only-overlay',
			deniedOwnerOnly: 'denied:owner-only',
			deniedGovernanceRole: 'denied:governance-role'
		});
	});

	it('represents Calendar view, operate, and configure workflows in the action catalog', () => {
		expect(POLICY_ACTION_CATALOG.calendar).toMatchObject({
			viewAvailability: {
				id: 'calendar.viewAvailability',
				owner: { kind: 'feature-lane', lane: 'calendar' },
				accessMode: 'read',
				requiredCapability: 'view'
			},
			manageAvailability: {
				id: 'calendar.manageAvailability',
				owner: { kind: 'feature-lane', lane: 'calendar' },
				accessMode: 'write',
				requiredCapability: 'operate'
			},
			configureStatusTypes: {
				id: 'calendar.configureStatusTypes',
				owner: { kind: 'feature-lane', lane: 'calendar' },
				accessMode: 'write',
				requiredCapability: 'configure'
			},
			configureSpecialDays: {
				id: 'calendar.configureSpecialDays',
				owner: { kind: 'feature-lane', lane: 'calendar' },
				accessMode: 'write',
				requiredCapability: 'configure'
			},
			configureAssignmentTypes: {
				id: 'calendar.configureAssignmentTypes',
				owner: { kind: 'feature-lane', lane: 'calendar' },
				accessMode: 'write',
				requiredCapability: 'configure'
			}
		});
	});
});
