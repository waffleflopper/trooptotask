import type {
	FeatureLanePolicyAction,
	IdentityOwnedPolicyAction,
	OrganizationGovernancePolicyAction,
	PolicyAction,
	PolicyResource
} from '$lib/access/policyEvaluator';
import type { AuthContext, ReadOnlyGuard } from '$lib/server/core/ports';
import { requirePolicyDecision } from './policyAuthorization';

export type RoutePolicyAction =
	| FeatureLanePolicyAction
	| OrganizationGovernancePolicyAction
	| IdentityOwnedPolicyAction;

export interface RouteAuthorizationPorts {
	auth: AuthContext;
	audit: Parameters<typeof requirePolicyDecision>[0]['audit'];
	readOnlyGuard: ReadOnlyGuard;
}

export interface RouteAuthorizationConfig {
	mutation?: boolean;
	policyAction: RoutePolicyAction;
	policyResource?: PolicyResource;
	/**
	 * Use only for policy-first writes that must remain available during org read-only
	 * mode, such as user preferences or billing recovery paths. Ordinary writes should
	 * let the policy overlay deny.
	 */
	allowReadOnlyMutation?: boolean;
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
	await requirePolicyDecision(ports, config.policyAction, resolveRoutePolicyResource(ports.auth, config), {
		enforceReadOnlyOverlay: !config.allowReadOnlyMutation
	});
}

export function enforceLoadAuthorization(
	ports: Pick<RouteAuthorizationPorts, 'auth' | 'audit' | 'readOnlyGuard'>,
	config: LoadAuthorizationConfig
): void | Promise<void> {
	return requirePolicyDecision(ports, config.policyAction, resolveRoutePolicyResource(ports.auth, config));
}

export function enforceLayoutPolicy(
	ports: Pick<RouteAuthorizationPorts, 'auth' | 'audit' | 'readOnlyGuard'>,
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
		// No user id means the evaluator will deny as unauthenticated before comparing resource ownership.
		return { kind: 'user', userId: auth.userId ?? '' };
	}

	return { kind: 'organization' };
}
