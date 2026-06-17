import type {
	FeatureLanePolicyAction,
	IdentityOwnedPolicyAction,
	OrganizationGovernancePolicyAction,
	PolicyAction,
	PolicyResource
} from '$lib/access/policyEvaluator';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
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
	 * Use only for named writes that must remain available during Read-Only Mode.
	 * Ordinary writes should let the policy overlay deny.
	 */
	readOnlyModeException?: ReadOnlyModeException;
}

export type ReadOnlyModeException = 'billing-recovery' | 'identity-owned-preference' | 'identity-owned-data-request';

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
		enforceReadOnlyOverlay: !allowsReadOnlyModeException(config)
	});
}

export function enforceLoadAuthorization(
	ports: Pick<RouteAuthorizationPorts, 'auth' | 'audit' | 'readOnlyGuard'>,
	config: LoadAuthorizationConfig
): void | Promise<void> {
	return requirePolicyDecision(ports, config.policyAction, resolveRoutePolicyResource(ports.auth, config), {
		enforceReadOnlyOverlay: false
	});
}

export function enforceLayoutPolicy(
	ports: Pick<RouteAuthorizationPorts, 'auth' | 'audit' | 'readOnlyGuard'>,
	config: LayoutPolicyAuthorizationConfig
): Promise<void> {
	return requirePolicyDecision(ports, config.policyAction, resolveRoutePolicyResource(ports.auth, config), {
		enforceReadOnlyOverlay: false
	});
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

function allowsReadOnlyModeException(
	config: Pick<RouteAuthorizationConfig, 'policyAction' | 'readOnlyModeException'>
): boolean {
	switch (config.readOnlyModeException) {
		case undefined:
			return false;
		case 'billing-recovery':
			return config.policyAction.id === POLICY_ACTION_CATALOG.organization.manageBilling.id;
		case 'identity-owned-preference':
			return config.policyAction.id === POLICY_ACTION_CATALOG.identity.updateOwnPreferences.id;
		case 'identity-owned-data-request':
			return (
				config.policyAction.id === POLICY_ACTION_CATALOG.identity.createOwnDeletionRequest.id ||
				config.policyAction.id === POLICY_ACTION_CATALOG.identity.cancelOwnDeletionRequest.id
			);
		default: {
			const unhandledException: never = config.readOnlyModeException;
			throw new Error(`Unhandled Read-Only Mode exception: ${String(unhandledException)}`);
		}
	}
}
