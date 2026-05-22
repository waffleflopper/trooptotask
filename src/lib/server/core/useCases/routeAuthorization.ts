import type {
	FeatureLanePolicyAction,
	OrganizationGovernancePolicyAction,
	PolicyResource
} from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { AuthContext, FeatureArea, ReadOnlyGuard } from '$lib/server/core/ports';
import { requirePolicyDecision } from './policyAuthorization';

export type LegacyRoutePermission = FeatureArea | 'manageMembers' | 'privileged' | 'owner' | 'none';
export type RoutePolicyAction = FeatureLanePolicyAction | OrganizationGovernancePolicyAction;

export interface RouteAuthorizationPorts {
	auth: AuthContext;
	audit: Parameters<typeof requirePolicyDecision>[0]['audit'];
	readOnlyGuard: ReadOnlyGuard;
}

export interface RouteAuthorizationConfig {
	permission: LegacyRoutePermission;
	mutation?: boolean;
	allowReadOnlyMutation?: boolean;
	policyAction?: RoutePolicyAction;
	policyResource?: PolicyResource;
	deferPolicyToUseCase?: boolean;
}

export interface LoadAuthorizationConfig {
	permission: LegacyRoutePermission;
	policyAction?: RoutePolicyAction;
	policyResource?: PolicyResource;
}

export async function enforceRouteAuthorization(
	ports: RouteAuthorizationPorts,
	config: RouteAuthorizationConfig
): Promise<void> {
	if (config.deferPolicyToUseCase) {
		return;
	}

	if (config.policyAction) {
		await requirePolicyDecision(ports, config.policyAction, config.policyResource ?? { kind: 'organization' });
		return;
	}

	enforceLegacyRoutePermission(ports.auth, config.permission);
	assertMutationHasAuthoritativePolicy(config);
}

export async function enforceRouteReadOnlyOverlay(
	ports: Pick<RouteAuthorizationPorts, 'readOnlyGuard'>,
	config: RouteAuthorizationConfig
): Promise<void> {
	if (!shouldRunLegacyReadOnlyGuard(config)) {
		return;
	}

	const isReadOnly = await ports.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}
}

export function enforceLoadAuthorization(
	ports: Pick<RouteAuthorizationPorts, 'auth' | 'audit' | 'readOnlyGuard'>,
	config: LoadAuthorizationConfig
): void | Promise<void> {
	if (config.policyAction) {
		return requirePolicyDecision(ports, config.policyAction, config.policyResource ?? { kind: 'organization' });
	}

	enforceLegacyRoutePermission(ports.auth, config.permission);
}

export function shouldRunLegacyReadOnlyGuard(config: RouteAuthorizationConfig): boolean {
	return Boolean(
		config.mutation && !config.allowReadOnlyMutation && !config.deferPolicyToUseCase && !config.policyAction
	);
}

function assertMutationHasAuthoritativePolicy(config: RouteAuthorizationConfig): void {
	if (config.mutation && isFeatureAreaPermission(config.permission)) {
		throw new Error(`Mutation route for ${config.permission} must declare policyAction or deferPolicyToUseCase`);
	}
}

function enforceLegacyRoutePermission(auth: AuthContext, permission: LegacyRoutePermission): void {
	switch (permission) {
		case 'none':
			return;
		case 'privileged':
			auth.requirePrivileged();
			return;
		case 'owner':
			auth.requireOwner();
			return;
		case 'manageMembers':
			auth.requireManageMembers();
			return;
		default:
			auth.requireView(permission);
	}
}

function isFeatureAreaPermission(permission: LegacyRoutePermission): permission is FeatureArea {
	return (
		permission !== 'none' && permission !== 'privileged' && permission !== 'owner' && permission !== 'manageMembers'
	);
}
