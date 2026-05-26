/**
 * AuthContext adapter implementations for SvelteKit routes.
 *
 * Wraps the real PermissionContext built from the user's membership row.
 * Exposes authorization data used by policy evaluation.
 */
import type { AuthContext } from '../core/ports';
import type { PermissionContext } from '$lib/server/permissionContext';

export function createSupabaseAuthContextAdapter(
	permCtx: PermissionContext,
	userId: string | null,
	orgId: string
): AuthContext {
	return {
		get userId() {
			return userId;
		},
		get orgId() {
			return orgId;
		},
		get role() {
			return permCtx.role;
		},
		get isPrivileged() {
			return permCtx.isPrivileged;
		},
		get canManageMembers() {
			return permCtx.canManageMembers;
		},
		get capabilityMap() {
			return permCtx.capabilityMap;
		},
		get compatibilityLanes() {
			return permCtx.compatibilityLanes;
		},
		get scopeSet() {
			return permCtx.scopeSet;
		}
	};
}
