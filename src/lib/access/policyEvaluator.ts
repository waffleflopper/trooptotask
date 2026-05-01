import type { CapabilityLevel, CapabilityMap, DurableFeatureLane, MembershipRole, ScopeSet } from './memberAccessShape';

export type PolicyDecisionKind = 'server-authoritative' | 'client-advisory';
export type PolicyActionAccessMode = 'read' | 'write' | 'governance';
export type OrganizationGovernanceAccess = 'admin-or-owner' | 'owner-only';

export type PolicyReasonCode =
	| 'allowed:capability'
	| 'allowed:governance'
	| 'denied:missing-capability'
	| 'denied:out-of-scope'
	| 'denied:read-only-overlay'
	| 'denied:owner-only'
	| 'denied:governance-role';

export const POLICY_REASON_CODES = {
	allowedCapability: 'allowed:capability',
	allowedGovernance: 'allowed:governance',
	deniedMissingCapability: 'denied:missing-capability',
	deniedOutOfScope: 'denied:out-of-scope',
	deniedReadOnlyOverlay: 'denied:read-only-overlay',
	deniedOwnerOnly: 'denied:owner-only',
	deniedGovernanceRole: 'denied:governance-role'
} as const satisfies Record<string, PolicyReasonCode>;

export interface FeatureLanePolicyAction {
	id: string;
	label: string;
	accessMode: Exclude<PolicyActionAccessMode, 'governance'>;
	owner: {
		kind: 'feature-lane';
		lane: DurableFeatureLane;
	};
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

export type PolicyAction = FeatureLanePolicyAction | OrganizationGovernancePolicyAction;

export type PolicyResource = { kind: 'organization' } | { kind: 'group'; groupId: string } | { kind: 'unscoped' };

export interface PolicyOverlay {
	id: string;
	kind: 'read-only-mode';
	label: string;
}

export interface PolicyActor {
	membershipRole: MembershipRole;
}

export interface PolicyEvaluationInput {
	decisionKind: PolicyDecisionKind;
	actor: PolicyActor;
	action: PolicyAction;
	capabilityMap: CapabilityMap;
	scopeSet: ScopeSet;
	resource: PolicyResource;
	overlays?: PolicyOverlay[];
}

export interface MatchedCapability {
	lane: DurableFeatureLane;
	actual: CapabilityLevel;
	required: Exclude<CapabilityLevel, 'none'>;
}

export type MatchedScope =
	| { kind: 'organization' }
	| { kind: 'group'; groupId: string }
	| { kind: 'unscoped' }
	| { kind: 'out-of-scope'; resource: PolicyResource };

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
	blockingOverlay?: PolicyOverlay;
	audit: {
		capture: boolean;
		category: 'ordinary-read' | 'write' | 'governance' | 'denied';
	};
}

export interface PolicyEvaluator {
	evaluate(input: PolicyEvaluationInput): PolicyDecision;
}

type PolicyDecisionResult = Pick<PolicyDecision, 'allowed' | 'reasonCode'> &
	Partial<Pick<PolicyDecision, 'matchedCapability' | 'matchedScope' | 'blockingOverlay'>>;

const GOVERNANCE_MEMBERSHIP_ROLES = new Set<MembershipRole>(['owner', 'admin']);

const CAPABILITY_RANK: Record<CapabilityLevel, number> = {
	none: 0,
	view: 1,
	operate: 2,
	configure: 3
};

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
		})
	},
	personnel: {
		updateRoster: featureAction({
			id: 'personnel.updateRoster',
			label: 'Update personnel roster',
			lane: 'personnel',
			accessMode: 'write',
			requiredCapability: 'operate'
		})
	},
	training: {
		viewMatrix: featureAction({
			id: 'training.viewMatrix',
			label: 'View training matrix',
			lane: 'training',
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
		accessBilling: governanceAction({
			id: 'organization.accessBilling',
			label: 'Access organization billing',
			access: 'owner-only'
		}),
		rename: governanceAction({
			id: 'organization.rename',
			label: 'Rename organization',
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

export const policyEvaluator: PolicyEvaluator = {
	evaluate: evaluatePolicyDecision
};

export function evaluatePolicyDecision(input: PolicyEvaluationInput): PolicyDecision {
	if (isGovernanceAction(input.action)) {
		return evaluateGovernancePolicy(input, input.action);
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

	const matchedScope = matchScope(input.scopeSet, input.resource);
	if (matchedScope.kind === 'out-of-scope') {
		return buildDecision(input, {
			allowed: false,
			reasonCode: POLICY_REASON_CODES.deniedOutOfScope,
			matchedCapability,
			matchedScope
		});
	}

	const blockingOverlay = findBlockingOverlay(input);
	if (blockingOverlay) {
		return buildDecision(input, {
			allowed: false,
			reasonCode: POLICY_REASON_CODES.deniedReadOnlyOverlay,
			matchedCapability,
			matchedScope,
			blockingOverlay
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

function evaluateGovernancePolicy(
	input: PolicyEvaluationInput,
	action: OrganizationGovernancePolicyAction
): PolicyDecision {
	const matchedScope = matchScope(input.scopeSet, input.resource);

	if (action.owner.access === 'owner-only' && input.actor.membershipRole !== 'owner') {
		return buildDecision(input, {
			allowed: false,
			reasonCode: POLICY_REASON_CODES.deniedOwnerOnly,
			matchedScope
		});
	}

	if (!GOVERNANCE_MEMBERSHIP_ROLES.has(input.actor.membershipRole)) {
		return buildDecision(input, {
			allowed: false,
			reasonCode: POLICY_REASON_CODES.deniedGovernanceRole,
			matchedScope
		});
	}

	const blockingOverlay = findBlockingOverlay(input);
	if (blockingOverlay) {
		return buildDecision(input, {
			allowed: false,
			reasonCode: POLICY_REASON_CODES.deniedReadOnlyOverlay,
			matchedScope,
			blockingOverlay
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
		blockingOverlay: result.blockingOverlay,
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

function capabilityMeets(actual: CapabilityLevel, required: Exclude<CapabilityLevel, 'none'>): boolean {
	return CAPABILITY_RANK[actual] >= CAPABILITY_RANK[required];
}

function matchScope(scopeSet: ScopeSet, resource: PolicyResource): MatchedScope {
	if (resource.kind === 'unscoped') {
		return { kind: 'unscoped' };
	}

	if (scopeSet.kind === 'organization') {
		if (resource.kind === 'group') {
			return { kind: 'group', groupId: resource.groupId };
		}

		return { kind: 'organization' };
	}

	if (resource.kind === 'group' && scopeSet.groupIds.includes(resource.groupId)) {
		return { kind: 'group', groupId: resource.groupId };
	}

	return { kind: 'out-of-scope', resource };
}

function findBlockingOverlay(input: PolicyEvaluationInput): PolicyOverlay | undefined {
	if (input.action.accessMode !== 'write' && input.action.accessMode !== 'governance') {
		return undefined;
	}

	return input.overlays?.find((overlay) => overlay.kind === 'read-only-mode');
}
