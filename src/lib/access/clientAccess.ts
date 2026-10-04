import {
	capabilityMeets,
	createCapabilityMap,
	type CapabilityLevel,
	type CapabilityMap,
	type DurableFeatureLane,
	type ScopeSet
} from '$lib/access/memberAccessShape';
import {
	policyEvaluator,
	type FeatureLanePolicyAction,
	type OrganizationGovernancePolicyAction,
	type PolicyAction,
	type PolicyDecision,
	type PolicyResource
} from '$lib/access/policyEvaluator';
import { explainPolicyReasonCode } from '$lib/access/policyDecisionExplanations';

export interface ClientAccess {
	readonly role: 'owner' | 'admin' | 'member';
	readonly isOwner: boolean;
	readonly isAdmin: boolean;
	readonly isPrivileged: boolean;
	readonly capabilityMap: CapabilityMap;
	readonly scopeSet: ScopeSet;
	readonly affordanceForFeatureAction: (action: FeatureLanePolicyAction, resource?: PolicyResource) => ClientAffordance;
	readonly affordanceForGovernanceAction: (
		action: OrganizationGovernancePolicyAction,
		resource?: PolicyResource
	) => ClientAffordance;
	readonly hasCapability: (lane: DurableFeatureLane, capability: Exclude<CapabilityLevel, 'none'>) => boolean;
	readonly isResourceInScope: (resource?: PolicyResource) => boolean;
}

export interface ClientAccessFacts {
	membershipRole: 'owner' | 'admin' | 'member';
	capabilityMap?: CapabilityMap;
	scopeSet?: ScopeSet;
}

export interface ClientAffordance {
	readonly allowed: boolean;
	readonly visible: boolean;
	readonly disabled: boolean;
	readonly reason: PolicyDecision['reasonCode'];
	readonly explanation: string;
	readonly decision: PolicyDecision;
}

type ClientAccessInputAccessor = () => ClientAccessFacts;

function toInputAccessor(input: ClientAccessFacts | ClientAccessInputAccessor): ClientAccessInputAccessor {
	return typeof input === 'function' ? input : () => input;
}

/** Live advisory access for controls. Server policy remains authoritative. */
export function createClientAccess(input: ClientAccessFacts | ClientAccessInputAccessor): ClientAccess {
	const getInput = toInputAccessor(input);
	const getAccessShape = () => {
		const current = getInput();
		return {
			capabilityMap:
				current.capabilityMap ??
				(current.membershipRole === 'owner' || current.membershipRole === 'admin'
					? createCapabilityMap('configure')
					: createCapabilityMap('none')),
			scopeSet: current.scopeSet ?? { kind: 'organization' }
		};
	};
	return {
		get role() {
			return getInput().membershipRole;
		},
		get isOwner() {
			return getInput().membershipRole === 'owner';
		},
		get isAdmin() {
			return getInput().membershipRole === 'admin';
		},
		get isPrivileged() {
			const role = getInput().membershipRole;
			return role === 'owner' || role === 'admin';
		},
		get capabilityMap() {
			return getAccessShape().capabilityMap;
		},
		get scopeSet() {
			return getAccessShape().scopeSet;
		},
		affordanceForFeatureAction(action, resource = { kind: 'organization' }) {
			return evaluateClientAffordance(getInput(), getAccessShape(), action, resource);
		},
		affordanceForGovernanceAction(action, resource = { kind: 'organization' }) {
			return evaluateClientAffordance(getInput(), getAccessShape(), action, resource);
		},
		hasCapability(lane, capability) {
			return capabilityMeets(getAccessShape().capabilityMap[lane] ?? 'none', capability);
		},
		isResourceInScope(resource = { kind: 'organization' }) {
			return isResourceAllowedByScope(getAccessShape().scopeSet, resource);
		}
	};
}

function isResourceAllowedByScope(scopeSet: ScopeSet, resource: PolicyResource): boolean {
	if (resource.kind === 'unscoped') return true;
	if (scopeSet.kind === 'organization') return true;
	if (resource.kind === 'group') return scopeSet.groupIds.includes(resource.groupId);
	return false;
}

function evaluateClientAffordance(
	input: ClientAccessFacts,
	accessShape: { capabilityMap: CapabilityMap; scopeSet: ScopeSet },
	action: PolicyAction,
	resource: PolicyResource
): ClientAffordance {
	const decision = policyEvaluator.evaluate({
		decisionKind: 'client-advisory',
		actor: { membershipRole: input.membershipRole },
		action,
		capabilityMap: accessShape.capabilityMap,
		scopeSet: accessShape.scopeSet,
		resource
	});
	const disabled = !decision.allowed;

	return {
		allowed: decision.allowed,
		visible: decision.allowed,
		disabled,
		reason: decision.reasonCode,
		explanation: explainPolicyReasonCode(decision.reasonCode),
		decision
	};
}
