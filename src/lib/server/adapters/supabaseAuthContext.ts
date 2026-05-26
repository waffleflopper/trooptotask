/**
 * AuthContext adapter implementations for SvelteKit routes.
 *
 * Wraps the real PermissionContext built from the user's membership row.
 * Enforces role and group-scope checks.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthContext } from '../core/ports';
import type { PermissionContext } from '$lib/server/permissionContext';

export function createSupabaseAuthContextAdapter(
	permCtx: PermissionContext,
	supabase: SupabaseClient,
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
		get capabilityMap() {
			return permCtx.capabilityMap;
		},
		get compatibilityLanes() {
			return permCtx.compatibilityLanes;
		},
		get scopeSet() {
			return permCtx.scopeSet;
		},

		async requireGroupAccess(personnelId: string): Promise<void> {
			await permCtx.requireGroupAccess(supabase, personnelId);
		},
		async requireGroupAccessBatch(personnelIds: string[]): Promise<void> {
			await permCtx.requireGroupAccessBatch(supabase, personnelIds);
		},
		async requireGroupAccessByRecord(table: string, recordId: string, personnelIdColumn: string): Promise<void> {
			await permCtx.requireGroupAccessByRecord(supabase, table, recordId, orgId, personnelIdColumn);
		}
	};
}
