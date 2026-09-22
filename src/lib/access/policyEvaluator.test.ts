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
			resource: { kind: 'group', groupId: 'group-alpha' }
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
			resource: { kind: 'organization' }
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
			resource: { kind: 'group', groupId: 'group-bravo' }
		});

		expect(decision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:out-of-scope',
			matchedCapability: { lane: 'personnel', actual: 'operate', required: 'operate' },
			matchedScope: { kind: 'out-of-scope', resource: { kind: 'group', groupId: 'group-bravo' } }
		});
	});

	it('denies a group-scoped feature action for ungrouped Personnel Records', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member' },
			action: POLICY_ACTION_CATALOG.personnel.manageRecords,
			capabilityMap: { ...baseCapabilityMap, personnel: 'operate' },
			scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
			resource: { kind: 'organization' }
		});

		expect(decision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:out-of-scope',
			matchedScope: { kind: 'out-of-scope', resource: { kind: 'organization' } }
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
		expect(POLICY_ACTION_CATALOG.personnel.createRecords).toMatchObject({
			id: 'personnel.createRecords',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'personnel' },
			requiredCapability: 'configure'
		});
		expect(POLICY_ACTION_CATALOG.personnel.manageGroups).toMatchObject({
			id: 'personnel.manageGroups',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'personnel' },
			requiredCapability: 'configure'
		});
		expect(POLICY_ACTION_CATALOG.personnel.manageUnits).toMatchObject({
			id: 'personnel.manageUnits',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'personnel' },
			requiredCapability: 'configure'
		});
		expect(POLICY_ACTION_CATALOG.personnel.importRecords).toMatchObject({
			id: 'personnel.importRecords',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'personnel' },
			requiredCapability: 'operate'
		});
		expect(POLICY_ACTION_CATALOG.personnel.mergeRecords).toMatchObject({
			id: 'personnel.mergeRecords',
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
		expect(POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion).toMatchObject({
			id: 'ratingScheme.requestEntryDeletion',
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

	it('defines Training workflow actions with distinct record and configuration capabilities', () => {
		expect(POLICY_ACTION_CATALOG.training.viewRecords).toMatchObject({
			id: 'training.viewRecords',
			accessMode: 'read',
			owner: { kind: 'feature-lane', lane: 'training' },
			requiredCapability: 'view'
		});
		expect(POLICY_ACTION_CATALOG.training.recordCompletions).toMatchObject({
			id: 'training.recordCompletions',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'training' },
			requiredCapability: 'operate'
		});
		expect(POLICY_ACTION_CATALOG.training.manageSignInRosters).toMatchObject({
			id: 'training.manageSignInRosters',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'training' },
			requiredCapability: 'operate'
		});
		expect(POLICY_ACTION_CATALOG.training.configureRequirements).toMatchObject({
			id: 'training.configureRequirements',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'training' },
			requiredCapability: 'configure'
		});
	});

	it('defines Onboarding workflow actions with distinct read, operate, and configure capabilities', () => {
		expect(POLICY_ACTION_CATALOG.onboarding.viewWorkflows).toMatchObject({
			id: 'onboarding.viewWorkflows',
			accessMode: 'read',
			owner: { kind: 'feature-lane', lane: 'onboarding' },
			requiredCapability: 'view'
		});
		expect(POLICY_ACTION_CATALOG.onboarding.manageWorkflows).toMatchObject({
			id: 'onboarding.manageWorkflows',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'onboarding' },
			requiredCapability: 'operate'
		});
		expect(POLICY_ACTION_CATALOG.onboarding.configureWorkflows).toMatchObject({
			id: 'onboarding.configureWorkflows',
			accessMode: 'write',
			owner: { kind: 'feature-lane', lane: 'onboarding' },
			requiredCapability: 'configure'
		});
	});

	it('allows admin governance actions without feature capability checks', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'admin' },
			action: POLICY_ACTION_CATALOG.organization.updateMemberAccess,
			capabilityMap: baseCapabilityMap,
			scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
			resource: { kind: 'organization' }
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
			resource: { kind: 'organization' }
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
			action: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
			capabilityMap: { ...baseCapabilityMap, personnel: 'configure' },
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' }
		});

		expect(decision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:owner-only',
			action: { owner: { kind: 'organization-governance', access: 'owner-only' } },
			audit: { capture: true, category: 'denied' }
		});
		expect(decision.matchedCapability).toBeUndefined();

		const ownerDecision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'owner' },
			action: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
			capabilityMap: baseCapabilityMap,
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' }
		});

		expect(ownerDecision).toMatchObject({
			allowed: true,
			reasonCode: 'allowed:governance',
			action: { owner: { kind: 'organization-governance', access: 'owner-only' } },
			audit: { capture: true, category: 'governance' }
		});
		expect(ownerDecision.matchedCapability).toBeUndefined();
	});

	it('preserves advisory decisions as non-authoritative contract results', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'client-advisory',
			actor: { membershipRole: 'member' },
			action: POLICY_ACTION_CATALOG.training.viewMatrix,
			capabilityMap: { ...baseCapabilityMap, training: 'view' },
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' }
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
			resource: { kind: 'group', groupId: 'group-bravo' }
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
			resource: { kind: 'organization' }
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
			allowedIdentityOwner: 'allowed:identity-owner',
			deniedMissingCapability: 'denied:missing-capability',
			deniedOutOfScope: 'denied:out-of-scope',
			deniedOwnerOnly: 'denied:owner-only',
			deniedGovernanceRole: 'denied:governance-role',
			deniedUnauthenticated: 'denied:unauthenticated',
			deniedNotResourceOwner: 'denied:not-resource-owner'
		});
	});

	it('authorizes identity-owned workflows by authenticated user and resource ownership', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member', userId: 'user-a' },
			action: POLICY_ACTION_CATALOG.identity.updateOwnNotifications,
			capabilityMap: baseCapabilityMap,
			scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
			resource: { kind: 'user', userId: 'user-a' }
		});

		expect(decision).toMatchObject({
			allowed: true,
			reasonCode: 'allowed:identity-owner',
			action: { owner: { kind: 'identity-owned' } },
			audit: { capture: true, category: 'write' }
		});
		expect(decision.matchedCapability).toBeUndefined();
		expect(decision.matchedScope).toBeUndefined();
	});

	it('denies identity-owned workflows for cross-user resources before mutation', () => {
		const decision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member', userId: 'user-a' },
			action: POLICY_ACTION_CATALOG.identity.deleteOwnNotifications,
			capabilityMap: { ...baseCapabilityMap, personnel: 'configure' },
			scopeSet: { kind: 'organization' },
			resource: { kind: 'user', userId: 'user-b' }
		});

		expect(decision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:not-resource-owner',
			audit: { capture: true, category: 'denied' }
		});
		expect(decision.matchedCapability).toBeUndefined();
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
			manageAssignments: {
				id: 'calendar.manageAssignments',
				owner: { kind: 'feature-lane', lane: 'calendar' },
				accessMode: 'write',
				requiredCapability: 'operate'
			},
			viewReports: {
				id: 'calendar.viewReports',
				owner: { kind: 'feature-lane', lane: 'calendar' },
				accessMode: 'read',
				requiredCapability: 'view'
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

	it('defines new rollout workflow actions with the settled ownership semantics', () => {
		expect(POLICY_ACTION_CATALOG.organization.accessAuditLogs).toMatchObject({
			id: 'organization.accessAuditLogs',
			accessMode: 'governance',
			owner: { kind: 'organization-governance', access: 'owner-only' }
		});
		expect(POLICY_ACTION_CATALOG.organization.exportData).toMatchObject({
			id: 'organization.exportData',
			accessMode: 'governance',
			owner: { kind: 'organization-governance', access: 'member-manager-or-admin' }
		});
		expect(POLICY_ACTION_CATALOG.organization.updateSettings).toMatchObject({
			id: 'organization.updateSettings',
			accessMode: 'governance',
			owner: { kind: 'organization-governance', access: 'admin-or-owner' }
		});
		expect(POLICY_ACTION_CATALOG.identity.viewDashboard).toMatchObject({
			id: 'identity.viewDashboard',
			accessMode: 'read',
			owner: { kind: 'identity-owned' }
		});
		expect(POLICY_ACTION_CATALOG.identity.updateOwnPreferences).toMatchObject({
			id: 'identity.updateOwnPreferences',
			accessMode: 'write',
			owner: { kind: 'identity-owned' }
		});
	});

	it('evaluates new organization governance actions with distinct role denial reasons', () => {
		const auditLogsDecision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'admin' },
			action: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
			capabilityMap: baseCapabilityMap,
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' }
		});

		expect(auditLogsDecision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:owner-only',
			action: { owner: { kind: 'organization-governance', access: 'owner-only' } }
		});

		const exportDataDeniedDecision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member', canManageMembers: false },
			action: POLICY_ACTION_CATALOG.organization.exportData,
			capabilityMap: { ...baseCapabilityMap, personnel: 'configure' },
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' }
		});

		expect(exportDataDeniedDecision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:governance-role',
			action: { owner: { kind: 'organization-governance', access: 'member-manager-or-admin' } }
		});
		expect(exportDataDeniedDecision.matchedCapability).toBeUndefined();

		const exportDataAllowedDecision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member', canManageMembers: true },
			action: POLICY_ACTION_CATALOG.organization.exportData,
			capabilityMap: { ...baseCapabilityMap, personnel: 'view' },
			scopeSet: { kind: 'organization' },
			resource: { kind: 'organization' }
		});

		expect(exportDataAllowedDecision).toMatchObject({
			allowed: true,
			reasonCode: 'allowed:governance',
			action: { owner: { kind: 'organization-governance', access: 'member-manager-or-admin' } }
		});
		expect(exportDataAllowedDecision.matchedCapability).toBeUndefined();
	});

	it('evaluates identity-owned actions with ownership checks', () => {
		const dashboardDecision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member', userId: 'user-a' },
			action: POLICY_ACTION_CATALOG.identity.viewDashboard,
			capabilityMap: baseCapabilityMap,
			scopeSet: { kind: 'organization' },
			resource: { kind: 'user', userId: 'user-b' }
		});

		expect(dashboardDecision).toMatchObject({
			allowed: false,
			reasonCode: 'denied:not-resource-owner',
			action: { owner: { kind: 'identity-owned' } }
		});

		const preferencesDecision = evaluatePolicyDecision({
			decisionKind: 'server-authoritative',
			actor: { membershipRole: 'member', userId: 'user-a' },
			action: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
			capabilityMap: baseCapabilityMap,
			scopeSet: { kind: 'organization' },
			resource: { kind: 'user', userId: 'user-a' }
		});

		expect(preferencesDecision).toMatchObject({
			allowed: true,
			reasonCode: 'allowed:identity-owner'
		});
	});
});
