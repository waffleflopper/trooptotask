import type {
	FeatureLanePolicyAction,
	IdentityOwnedPolicyAction,
	OrganizationGovernancePolicyAction,
	PolicyAction,
	PolicyResource
} from '$lib/access/policyEvaluator';
import type { AuthContext } from '$lib/server/core/ports';
import { requirePolicyDecision } from './policyAuthorization';

export type RoutePolicyAction =
	| FeatureLanePolicyAction
	| OrganizationGovernancePolicyAction
	| IdentityOwnedPolicyAction;

export interface RouteAuthorizationPorts {
	auth: AuthContext;
	audit: Parameters<typeof requirePolicyDecision>[0]['audit'];
}

export interface RouteAuthorizationConfig {
	mutation?: boolean;
	policyAction: RoutePolicyAction;
	policyResource?: PolicyResource;
}

export interface LoadAuthorizationConfig {
	policyAction: RoutePolicyAction;
	policyResource?: PolicyResource;
}

export type LayoutPolicyAuthorizationConfig = LoadAuthorizationConfig;

export async function enforceRouteAuthorization(
	ports: RouteAuthorizationPorts,
	config: RouteAuthorizationConfig
): Promise<void> {
	await requirePolicyDecision(ports, config.policyAction, resolveRoutePolicyResource(ports.auth, config));
}

export function enforceLoadAuthorization(
	ports: Pick<RouteAuthorizationPorts, 'auth' | 'audit'>,
	config: LoadAuthorizationConfig
): void | Promise<void> {
	return requirePolicyDecision(ports, config.policyAction, resolveRoutePolicyResource(ports.auth, config));
}

export function enforceLayoutPolicy(
	ports: Pick<RouteAuthorizationPorts, 'auth' | 'audit'>,
	config: LayoutPolicyAuthorizationConfig
): Promise<void> {
	return requirePolicyDecision(ports, config.policyAction, resolveRoutePolicyResource(ports.auth, config));
}

function resolveRoutePolicyResource(
	auth: Pick<AuthContext, 'userId'>,
	config: { policyAction?: PolicyAction; policyResource?: PolicyResource }
): PolicyResource {
	if (config.policyResource) {
		return config.policyResource;
	}

	if (config.policyAction?.owner.kind === 'identity-owned') {
		return { kind: 'user', userId: auth.userId };
	}

	return { kind: 'organization' };
}
