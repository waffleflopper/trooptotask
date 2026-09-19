import {
	evaluatePolicyDecision,
	type PolicyAction,
	type PolicyDecision,
	type PolicyEvaluationInput,
	type PolicyResource
} from '$lib/access/policyEvaluator';
import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import type { AuthContext } from '$lib/server/core/ports';

type PolicyAdapterAuth = Pick<AuthContext, 'role' | 'capabilityMap' | 'scopeSet'> &
	Partial<Pick<AuthContext, 'userId' | 'canManageMembers'>>;

export interface PolicyAdapterPorts {
	auth: PolicyAdapterAuth;
}

export interface AuthoritativePolicyDecisionOptions {
	actorUserId?: string | null;
	capabilityMap?: CapabilityMap;
	scopeSet?: ScopeSet;
}

export const NO_FEATURE_CAPABILITIES: CapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
};

export async function evaluateAuthoritativePolicyDecision(
	ports: PolicyAdapterPorts,
	action: PolicyAction,
	resource: PolicyResource,
	options: AuthoritativePolicyDecisionOptions = {}
): Promise<PolicyDecision> {
	return evaluatePolicyDecision(await buildAuthoritativePolicyInput(ports, action, resource, options));
}

export async function buildAuthoritativePolicyInput(
	ports: PolicyAdapterPorts,
	action: PolicyAction,
	resource: PolicyResource,
	options: AuthoritativePolicyDecisionOptions = {}
): Promise<PolicyEvaluationInput> {
	return {
		decisionKind: 'server-authoritative',
		actor: {
			membershipRole: ports.auth.role,
			canManageMembers: ports.auth.canManageMembers,
			userId: options.actorUserId ?? ports.auth.userId
		},
		action,
		capabilityMap: options.capabilityMap ?? ports.auth.capabilityMap,
		scopeSet: options.scopeSet ?? ports.auth.scopeSet,
		resource
	};
}
