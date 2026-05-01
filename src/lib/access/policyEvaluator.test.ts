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
			action: POLICY_ACTION_CATALOG.personnel.updateRoster,
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
			action: POLICY_ACTION_CATALOG.organization.manageMembers,
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
			action: POLICY_ACTION_CATALOG.organization.manageMembers,
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
});
