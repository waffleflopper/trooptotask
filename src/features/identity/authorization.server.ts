import type { AdmittedActor } from './contracts';
import type { PermissionContext } from '$lib/server/permissionContext';

export function createIdentityAuthorization(permCtx: PermissionContext, actor: AdmittedActor, orgId: string) {
	return {
		get userId() {
			return actor.userId;
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
		get scopeSet() {
			return permCtx.scopeSet;
		}
	};
}
