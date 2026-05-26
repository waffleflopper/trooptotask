import type {
	FeatureLanePolicyAction,
	IdentityOwnedPolicyAction,
	OrganizationGovernancePolicyAction,
	PolicyAction,
	PolicyResource
} from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { AuthContext, FeatureArea, ReadOnlyGuard } from '$lib/server/core/ports';
import { requirePolicyDecision } from './policyAuthorization';

export type LegacyRoutePermission = FeatureArea | 'manageMembers' | 'privileged' | 'owner' | 'none';
export type RoutePolicyAction =
	| FeatureLanePolicyAction
	| OrganizationGovernancePolicyAction
	| IdentityOwnedPolicyAction;

export interface RouteAuthorizationPorts {
	auth: AuthContext;
	audit: Parameters<typeof requirePolicyDecision>[0]['audit'];
	readOnlyGuard: ReadOnlyGuard;
}

interface RouteAuthorizationBaseConfig {
	mutation?: boolean;
	policyResource?: PolicyResource;
}

export interface PolicyFirstRouteAuthorizationConfig extends RouteAuthorizationBaseConfig {
	policyAction: RoutePolicyAction;
	permission?: LegacyRoutePermission;
	allowReadOnlyMutation?: never;
	deferPolicyToUseCase?: false;
}

export interface LegacyRouteAuthorizationConfig extends RouteAuthorizationBaseConfig {
	permission: LegacyRoutePermission;
	policyAction?: undefined;
	allowReadOnlyMutation?: boolean;
	deferPolicyToUseCase?: boolean;
}

export type RouteAuthorizationConfig = PolicyFirstRouteAuthorizationConfig | LegacyRouteAuthorizationConfig;

export interface PolicyFirstLoadAuthorizationConfig {
	policyAction: RoutePolicyAction;
	permission?: LegacyRoutePermission;
	policyResource?: PolicyResource;
}

export interface LegacyLoadAuthorizationConfig {
	permission: LegacyRoutePermission;
	policyAction?: undefined;
	policyResource?: PolicyResource;
}

export type LoadAuthorizationConfig = PolicyFirstLoadAuthorizationConfig | LegacyLoadAuthorizationConfig;

export type LayoutPolicyAuthorizationConfig = PolicyFirstLoadAuthorizationConfig;

export async function enforceRouteAuthorization(
	ports: RouteAuthorizationPorts,
	config: RouteAuthorizationConfig
): Promise<void> {
	if (config.policyAction) {
		await requirePolicyDecision(ports, config.policyAction, resolveRoutePolicyResource(ports.auth, config));
		return;
	}

	if (config.deferPolicyToUseCase) {
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

	const state = await ports.readOnlyGuard.checkState?.();
	if (state) {
		if (state.isReadOnly) {
			fail(403, state.message ?? 'Organization is in read-only mode');
		}
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
		return requirePolicyDecision(ports, config.policyAction, resolveRoutePolicyResource(ports.auth, config));
	}

	enforceLegacyRoutePermission(ports.auth, config.permission);
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

export function shouldRunLegacyReadOnlyGuard(config: RouteAuthorizationConfig): boolean {
	// Migration-only compatibility: policy-first writes are blocked by the authoritative
	// policy overlay path. This branch exists only for legacy routes awaiting conversion.
	return Boolean(
		config.mutation &&
		!('allowReadOnlyMutation' in config && config.allowReadOnlyMutation) &&
		!config.deferPolicyToUseCase &&
		!config.policyAction
	);
}

function assertMutationHasAuthoritativePolicy(config: LegacyRouteAuthorizationConfig): void {
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
