import {
	capabilityMeets,
	type CapabilityLevel,
	type CapabilityMap,
	type DurableFeatureLane,
	type MembershipRole,
	type ScopeSet
} from './memberAccessShape';
import { matchScopeSet, type MatchedScope, type ScopeSetResource } from './scopeSetAccess';

export type { MatchedScope } from './scopeSetAccess';

export type PolicyDecisionKind = 'server-authoritative' | 'client-advisory';
export type PolicyActionAccessMode = 'read' | 'write' | 'governance';
export type OrganizationGovernanceAccess = 'admin-or-owner' | 'member-manager-or-admin' | 'owner-only';

export type PolicyReasonCode =
	| 'allowed:capability'
	| 'allowed:governance'
	| 'allowed:identity-owner'
	| 'denied:missing-capability'
	| 'denied:out-of-scope'
	| 'denied:owner-only'
	| 'denied:governance-role'
	| 'denied:unauthenticated'
	| 'denied:not-resource-owner';

export const POLICY_REASON_CODES = {
	allowedCapability: 'allowed:capability',
	allowedGovernance: 'allowed:governance',
	allowedIdentityOwner: 'allowed:identity-owner',
	deniedMissingCapability: 'denied:missing-capability',
	deniedOutOfScope: 'denied:out-of-scope',
	deniedOwnerOnly: 'denied:owner-only',
	deniedGovernanceRole: 'denied:governance-role',
	deniedUnauthenticated: 'denied:unauthenticated',
	deniedNotResourceOwner: 'denied:not-resource-owner'
} as const satisfies Record<string, PolicyReasonCode>;

type FeatureLanePolicyActionOwner = {
	kind: 'feature-lane';
	lane: DurableFeatureLane;
};

export interface FeatureLanePolicyAction {
	id: string;
	label: string;
	accessMode: Exclude<PolicyActionAccessMode, 'governance'>;
	owner: FeatureLanePolicyActionOwner;
	requiredCapability: Exclude<CapabilityLevel, 'none'>;
}

export interface OrganizationGovernancePolicyAction {
	id: string;
	label: string;
	accessMode: 'governance';
	owner: {
		kind: 'organization-governance';
		access: OrganizationGovernanceAccess;
	};
}

export interface IdentityOwnedPolicyAction {
	id: string;
	label: string;
	accessMode: Exclude<PolicyActionAccessMode, 'governance'>;
	owner: {
		kind: 'identity-owned';
	};
}

export type PolicyAction = FeatureLanePolicyAction | OrganizationGovernancePolicyAction | IdentityOwnedPolicyAction;

export type PolicyResource = ScopeSetResource;

export interface PolicyActor {
	membershipRole: MembershipRole;
	canManageMembers?: boolean;
	userId?: string | null;
}

export interface PolicyEvaluationInput {
	decisionKind: PolicyDecisionKind;
	actor: PolicyActor;
	action: PolicyAction;
	capabilityMap: CapabilityMap;
	scopeSet: ScopeSet;
	resource: PolicyResource;
}

export interface MatchedCapability {
	lane: DurableFeatureLane;
	actual: CapabilityLevel;
	required: Exclude<CapabilityLevel, 'none'>;
}

export interface PolicyDecision {
	allowed: boolean;
	decisionKind: PolicyDecisionKind;
	authority: {
		serverAuthoritative: boolean;
	};
	reasonCode: PolicyReasonCode;
	action: PolicyAction;
	matchedCapability?: MatchedCapability;
	matchedScope?: MatchedScope;
	audit: {
		capture: boolean;
		category: 'ordinary-read' | 'write' | 'governance' | 'denied';
	};
}

export interface PolicyEvaluator {
	evaluate(input: PolicyEvaluationInput): PolicyDecision;
}

type PolicyDecisionResult = Pick<PolicyDecision, 'allowed' | 'reasonCode'> &
	Partial<Pick<PolicyDecision, 'matchedCapability' | 'matchedScope'>>;

const GOVERNANCE_MEMBERSHIP_ROLES = new Set<MembershipRole>(['owner', 'admin']);

export const POLICY_ACTION_CATALOG = {
	calendar: {
		viewAvailability: featureAction({
			id: 'calendar.viewAvailability',
			label: 'View calendar availability',
			lane: 'calendar',
			accessMode: 'read',
			requiredCapability: 'view'
		}),
		manageAvailability: featureAction({
			id: 'calendar.manageAvailability',
			label: 'Manage calendar availability',
			lane: 'calendar',
			accessMode: 'write',
			requiredCapability: 'operate'
		}),
		manageAssignments: featureAction({
			id: 'calendar.manageAssignments',
			label: 'Manage calendar assignments',
			lane: 'calendar',
			accessMode: 'write',
			requiredCapability: 'operate'
		}),
		viewReports: featureAction({
			id: 'calendar.viewReports',
			label: 'View calendar reports',
			lane: 'calendar',
			accessMode: 'read',
			requiredCapability: 'view'
		}),
		configureStatusTypes: featureAction({
			id: 'calendar.configureStatusTypes',
			label: 'Configure calendar status types',
			lane: 'calendar',
			accessMode: 'write',
			requiredCapability: 'configure'
		}),
		configureSpecialDays: featureAction({
			id: 'calendar.configureSpecialDays',
			label: 'Configure calendar special days',
			lane: 'calendar',
			accessMode: 'write',
			requiredCapability: 'configure'
		}),
		configureAssignmentTypes: featureAction({
			id: 'calendar.configureAssignmentTypes',
			label: 'Configure calendar assignment types',
			lane: 'calendar',
			accessMode: 'write',
			requiredCapability: 'configure'
		}),
		manageDutyRosters: featureAction({
			id: 'calendar.manageDutyRosters',
			label: 'Manage duty rosters',
			lane: 'calendar',
			accessMode: 'write',
			requiredCapability: 'operate'
		}),
		viewDutyRosters: featureAction({
			id: 'calendar.viewDutyRosters',
			label: 'View duty rosters',
			lane: 'calendar',
			accessMode: 'read',
			requiredCapability: 'view'
		}),
		configureDutyTemplates: featureAction({
			id: 'calendar.configureDutyTemplates',
			label: 'Configure duty templates',
			lane: 'calendar',
			accessMode: 'write',
			requiredCapability: 'configure'
		})
	},
	personnel: {
		viewRoster: featureAction({
			id: 'personnel.viewRoster',
			label: 'View personnel roster',
			lane: 'personnel',
			accessMode: 'read',
			requiredCapability: 'view'
		}),
		readSensitiveRecords: featureAction({
			id: 'personnel.readSensitiveRecords',
			label: 'Read sensitive personnel records',
			lane: 'personnel',
			accessMode: 'read',
			requiredCapability: 'configure'
		}),
		manageRecords: featureAction({
			id: 'personnel.manageRecords',
			label: 'Manage personnel records',
			lane: 'personnel',
			accessMode: 'write',
			requiredCapability: 'operate'
		}),
		createRecords: featureAction({
			id: 'personnel.createRecords',
			label: 'Create personnel records',
			lane: 'personnel',
			accessMode: 'write',
			requiredCapability: 'configure'
		}),
		manageGroups: featureAction({
			id: 'personnel.manageGroups',
			label: 'Manage personnel groups',
			lane: 'personnel',
			accessMode: 'write',
			requiredCapability: 'configure'
		}),
		manageUnits: featureAction({
			id: 'personnel.manageUnits',
			label: 'Manage personnel units',
			lane: 'personnel',
			accessMode: 'write',
			requiredCapability: 'configure'
		}),
		archiveRecords: featureAction({
			id: 'personnel.archiveRecords',
			label: 'Archive personnel records',
			lane: 'personnel',
			accessMode: 'write',
			requiredCapability: 'configure'
		}),
		restoreRecords: featureAction({
			id: 'personnel.restoreRecords',
			label: 'Restore personnel records',
			lane: 'personnel',
			accessMode: 'write',
			requiredCapability: 'configure'
		}),
		importRecords: featureAction({
			id: 'personnel.importRecords',
			label: 'Import personnel records',
			lane: 'personnel',
			accessMode: 'write',
			requiredCapability: 'operate'
		}),
		mergeRecords: featureAction({
			id: 'personnel.mergeRecords',
			label: 'Merge personnel records',
			lane: 'personnel',
			accessMode: 'write',
			requiredCapability: 'operate'
		}),
		exportRecords: featureAction({
			id: 'personnel.exportRecords',
			label: 'Export personnel records',
			lane: 'personnel',
			accessMode: 'read',
			requiredCapability: 'configure'
		}),
		permanentlyDeleteRecords: featureAction({
			id: 'personnel.permanentlyDeleteRecords',
			label: 'Permanently delete personnel records',
			lane: 'personnel',
			accessMode: 'write',
			requiredCapability: 'configure'
		})
	},
	training: {
		viewRecords: featureAction({
			id: 'training.viewRecords',
			label: 'View training records',
			lane: 'training',
			accessMode: 'read',
			requiredCapability: 'view'
		}),
		viewMatrix: featureAction({
			id: 'training.viewMatrix',
			label: 'View training matrix',
			lane: 'training',
			accessMode: 'read',
			requiredCapability: 'view'
		}),
		recordCompletions: featureAction({
			id: 'training.recordCompletions',
			label: 'Record training completions',
			lane: 'training',
			accessMode: 'write',
			requiredCapability: 'operate'
		}),
		manageSignInRosters: featureAction({
			id: 'training.manageSignInRosters',
			label: 'Manage training sign-in rosters',
			lane: 'training',
			accessMode: 'write',
			requiredCapability: 'operate'
		}),
		configureRequirements: featureAction({
			id: 'training.configureRequirements',
			label: 'Configure training requirements',
			lane: 'training',
			accessMode: 'write',
			requiredCapability: 'configure'
		})
	},
	criticalTasks: {
		viewReadiness: featureAction({
			id: 'criticalTasks.viewReadiness',
			label: 'View Critical Tasks readiness',
			lane: 'criticalTasks',
			accessMode: 'read',
			requiredCapability: 'view'
		}),
		recordCompletion: featureAction({
			id: 'criticalTasks.recordCompletion',
			label: 'Record Critical Tasks completion',
			lane: 'criticalTasks',
			accessMode: 'write',
			requiredCapability: 'operate'
		}),
		configureLibrary: featureAction({
			id: 'criticalTasks.configureLibrary',
			label: 'Configure Critical Tasks library',
			lane: 'criticalTasks',
			accessMode: 'write',
			requiredCapability: 'configure'
		})
	},
	onboarding: {
		viewWorkflows: featureAction({
			id: 'onboarding.viewWorkflows',
			label: 'View onboarding workflows',
			lane: 'onboarding',
			accessMode: 'read',
			requiredCapability: 'view'
		}),
		manageWorkflows: featureAction({
			id: 'onboarding.manageWorkflows',
			label: 'Manage onboarding workflows',
			lane: 'onboarding',
			accessMode: 'write',
			requiredCapability: 'operate'
		}),
		configureWorkflows: featureAction({
			id: 'onboarding.configureWorkflows',
			label: 'Configure onboarding workflows',
			lane: 'onboarding',
			accessMode: 'write',
			requiredCapability: 'configure'
		})
	},
	ratingScheme: {
		viewEntries: featureAction({
			id: 'ratingScheme.viewEntries',
			label: 'View rating scheme entries',
			lane: 'ratingScheme',
			accessMode: 'read',
			requiredCapability: 'view'
		}),
		updateEntries: featureAction({
			id: 'ratingScheme.updateEntries',
			label: 'Update rating scheme entries',
			lane: 'ratingScheme',
			accessMode: 'write',
			requiredCapability: 'operate'
		}),
		requestEntryDeletion: featureAction({
			id: 'ratingScheme.requestEntryDeletion',
			label: 'Request rating scheme entry deletion',
			lane: 'ratingScheme',
			accessMode: 'write',
			requiredCapability: 'operate'
		}),
		configureWorkflows: featureAction({
			id: 'ratingScheme.configureWorkflows',
			label: 'Configure rating scheme workflows',
			lane: 'ratingScheme',
			accessMode: 'write',
			requiredCapability: 'configure'
		}),
		readRosterReferences: featureAction({
			id: 'ratingScheme.readRosterReferences',
			label: 'Read roster references for rating scheme',
			lane: 'ratingScheme',
			accessMode: 'read',
			requiredCapability: 'view'
		})
	},
	organization: {
		accessGovernance: governanceAction({
			id: 'organization.accessGovernance',
			label: 'Access organization governance',
			access: 'admin-or-owner'
		}),
		accessAuditLogs: governanceAction({
			id: 'organization.accessAuditLogs',
			label: 'Access organization audit logs',
			access: 'owner-only'
		}),
		rename: governanceAction({
			id: 'organization.rename',
			label: 'Rename organization',
			access: 'admin-or-owner'
		}),
		updateSettings: governanceAction({
			id: 'organization.updateSettings',
			label: 'Update organization settings',
			access: 'admin-or-owner'
		}),
		inviteMember: governanceAction({
			id: 'organization.inviteMember',
			label: 'Invite organization member',
			access: 'admin-or-owner'
		}),
		revokeInvitation: governanceAction({
			id: 'organization.revokeInvitation',
			label: 'Revoke organization invitation',
			access: 'admin-or-owner'
		}),
		removeMember: governanceAction({
			id: 'organization.removeMember',
			label: 'Remove organization member',
			access: 'admin-or-owner'
		}),
		updateMemberAccess: governanceAction({
			id: 'organization.updateMemberAccess',
			label: 'Update organization member access',
			access: 'admin-or-owner'
		}),
		updateAdminAccess: governanceAction({
			id: 'organization.updateAdminAccess',
			label: 'Update organization admin access',
			access: 'owner-only'
		}),
		transferOwnership: governanceAction({
			id: 'organization.transferOwnership',
			label: 'Transfer organization ownership',
			access: 'owner-only'
		}),
		deleteOrganization: governanceAction({
			id: 'organization.deleteOrganization',
			label: 'Delete organization',
			access: 'owner-only'
		}),
		deleteRatingSchemeEntry: governanceAction({
			id: 'organization.deleteRatingSchemeEntry',
			label: 'Delete rating scheme entry',
			access: 'admin-or-owner'
		}),
		reviewDeletionRequests: governanceAction({
			id: 'organization.reviewDeletionRequests',
			label: 'Review deletion requests',
			access: 'admin-or-owner'
		}),
		exportData: governanceAction({
			id: 'organization.exportData',
			label: 'Export organization data',
			access: 'member-manager-or-admin'
		})
	},
	identity: {
		viewDashboard: identityAction({
			id: 'identity.viewDashboard',
			label: 'View dashboard',
			accessMode: 'read'
		}),
		updateOwnPreferences: identityAction({
			id: 'identity.updateOwnPreferences',
			label: 'Update own preferences',
			accessMode: 'write'
		}),
		readOwnNotifications: identityAction({
			id: 'identity.readOwnNotifications',
			label: 'Read own notifications',
			accessMode: 'read'
		}),
		updateOwnNotifications: identityAction({
			id: 'identity.updateOwnNotifications',
			label: 'Update own notifications',
			accessMode: 'write'
		}),
		deleteOwnNotifications: identityAction({
			id: 'identity.deleteOwnNotifications',
			label: 'Delete own notifications',
			accessMode: 'write'
		}),
		createOwnDeletionRequest: identityAction({
			id: 'identity.createOwnDeletionRequest',
			label: 'Create own deletion request',
			accessMode: 'write'
		}),
		cancelOwnDeletionRequest: identityAction({
			id: 'identity.cancelOwnDeletionRequest',
			label: 'Cancel own deletion request',
			accessMode: 'write'
		}),
		listOwnDeletionRequests: identityAction({
			id: 'identity.listOwnDeletionRequests',
			label: 'List own deletion requests',
			accessMode: 'read'
		}),
		leaveOrganization: identityAction({
			id: 'identity.leaveOrganization',
			label: 'Leave organization',
			accessMode: 'write'
		})
	}
} as const;

function featureAction(input: {
	id: string;
	label: string;
	lane: DurableFeatureLane;
	accessMode: FeatureLanePolicyAction['accessMode'];
	requiredCapability: FeatureLanePolicyAction['requiredCapability'];
}): FeatureLanePolicyAction {
	return {
		id: input.id,
		label: input.label,
		accessMode: input.accessMode,
		owner: { kind: 'feature-lane', lane: input.lane },
		requiredCapability: input.requiredCapability
	};
}

function governanceAction(input: {
	id: string;
	label: string;
	access: OrganizationGovernanceAccess;
}): OrganizationGovernancePolicyAction {
	return {
		id: input.id,
		label: input.label,
		accessMode: 'governance',
		owner: { kind: 'organization-governance', access: input.access }
	};
}

function identityAction(input: {
	id: string;
	label: string;
	accessMode: IdentityOwnedPolicyAction['accessMode'];
}): IdentityOwnedPolicyAction {
	return {
		id: input.id,
		label: input.label,
		accessMode: input.accessMode,
		owner: { kind: 'identity-owned' }
	};
}

export const policyEvaluator: PolicyEvaluator = {
	evaluate: evaluatePolicyDecision
};

export function evaluatePolicyDecision(input: PolicyEvaluationInput): PolicyDecision {
	if (isGovernanceAction(input.action)) {
		return evaluateGovernancePolicy(input, input.action);
	}

	if (isIdentityOwnedAction(input.action)) {
		return evaluateIdentityOwnedPolicy(input);
	}

	const action = input.action;
	const matchedCapability = matchCapability(input.capabilityMap, action);

	if (!capabilityMeets(matchedCapability.actual, matchedCapability.required)) {
		return buildDecision(input, {
			allowed: false,
			reasonCode: POLICY_REASON_CODES.deniedMissingCapability,
			matchedCapability
		});
	}

	const matchedScope = matchScopeSet(input.scopeSet, input.resource);
	if (matchedScope.kind === 'out-of-scope') {
		return buildDecision(input, {
			allowed: false,
			reasonCode: POLICY_REASON_CODES.deniedOutOfScope,
			matchedCapability,
			matchedScope
		});
	}

	return buildDecision(input, {
		allowed: true,
		reasonCode: POLICY_REASON_CODES.allowedCapability,
		matchedCapability,
		matchedScope
	});
}

function isGovernanceAction(action: PolicyAction): action is OrganizationGovernancePolicyAction {
	return action.owner.kind === 'organization-governance';
}

function isIdentityOwnedAction(action: PolicyAction): action is IdentityOwnedPolicyAction {
	return action.owner.kind === 'identity-owned';
}

function evaluateIdentityOwnedPolicy(input: PolicyEvaluationInput): PolicyDecision {
	if (!input.actor.userId) {
		return buildDecision(input, {
			allowed: false,
			reasonCode: POLICY_REASON_CODES.deniedUnauthenticated
		});
	}

	if (input.resource.kind !== 'user' || input.resource.userId !== input.actor.userId) {
		return buildDecision(input, {
			allowed: false,
			reasonCode: POLICY_REASON_CODES.deniedNotResourceOwner
		});
	}

	return buildDecision(input, {
		allowed: true,
		reasonCode: POLICY_REASON_CODES.allowedIdentityOwner
	});
}

function evaluateGovernancePolicy(
	input: PolicyEvaluationInput,
	action: OrganizationGovernancePolicyAction
): PolicyDecision {
	const matchedScope = matchScopeSet(input.scopeSet, input.resource);

	if (action.owner.access === 'owner-only' && input.actor.membershipRole !== 'owner') {
		return buildDecision(input, {
			allowed: false,
			reasonCode: POLICY_REASON_CODES.deniedOwnerOnly,
			matchedScope
		});
	}

	const hasAdminGovernance = GOVERNANCE_MEMBERSHIP_ROLES.has(input.actor.membershipRole);
	const hasMemberManagerGovernance = hasAdminGovernance || input.actor.canManageMembers === true;

	if (
		(action.owner.access === 'admin-or-owner' && !hasAdminGovernance) ||
		(action.owner.access === 'member-manager-or-admin' && !hasMemberManagerGovernance)
	) {
		return buildDecision(input, {
			allowed: false,
			reasonCode: POLICY_REASON_CODES.deniedGovernanceRole,
			matchedScope
		});
	}

	return buildDecision(input, {
		allowed: true,
		reasonCode: POLICY_REASON_CODES.allowedGovernance,
		matchedScope
	});
}

function buildDecision(input: PolicyEvaluationInput, result: PolicyDecisionResult): PolicyDecision {
	return {
		allowed: result.allowed,
		decisionKind: input.decisionKind,
		authority: { serverAuthoritative: input.decisionKind === 'server-authoritative' },
		reasonCode: result.reasonCode,
		action: input.action,
		matchedCapability: result.matchedCapability,
		matchedScope: result.matchedScope,
		audit: deriveAudit(input.action, result.allowed)
	};
}

function deriveAudit(action: PolicyAction, allowed: boolean): PolicyDecision['audit'] {
	if (!allowed) {
		return { capture: true, category: 'denied' };
	}

	if (action.accessMode === 'governance') {
		return { capture: true, category: 'governance' };
	}

	if (action.accessMode === 'write') {
		return { capture: true, category: 'write' };
	}

	return { capture: false, category: 'ordinary-read' };
}

function matchCapability(capabilityMap: CapabilityMap, action: FeatureLanePolicyAction): MatchedCapability {
	return {
		lane: action.owner.lane,
		actual: capabilityMap[action.owner.lane] ?? 'none',
		required: action.requiredCapability
	};
}
