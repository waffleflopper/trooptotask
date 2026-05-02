/**
 * AuthContext adapter implementations for SvelteKit routes.
 *
 * Two variants:
 * - `createSupabaseAuthContextAdapter` — real implementation backed by a PermissionContext
 *   (built from the user's membership row). Enforces role and group-scope checks.
 * - `createSandboxAuthContext` — no-op implementation used in demo/sandbox orgs.
 *   All permission checks pass silently; userId is null.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthContext, FeatureArea } from '../core/ports';
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
		get isFullEditor() {
			return permCtx.isFullEditor;
		},
		get scopedGroupId() {
			return permCtx.scopedGroupId;
		},
		get capabilityMap() {
			return permCtx.capabilityMap;
		},
		get scopeSet() {
			return permCtx.scopeSet;
		},

		requireEdit(area: FeatureArea): void {
			permCtx.requireEdit(area);
		},
		requireView(area: FeatureArea): void {
			permCtx.requireView(area);
		},
		requirePrivileged(): void {
			permCtx.requirePrivileged();
		},
		requireOwner(): void {
			permCtx.requireOwner();
		},
		requireFullEditor(): void {
			permCtx.requireFullEditor();
		},
		requireManageMembers(): void {
			permCtx.requireManageMembers();
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

export function createSandboxAuthContext(orgId: string): AuthContext {
	return {
		userId: null,
		orgId,
		role: 'owner',
		isPrivileged: true,
		isFullEditor: false,
		scopedGroupId: null,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'configure',
			onboarding: 'configure',
			ratingScheme: 'configure'
		},
		scopeSet: { kind: 'organization' },

		requireEdit() {},
		requireView() {},
		requirePrivileged() {},
		requireOwner() {},
		requireFullEditor() {},
		requireManageMembers() {},
		async requireGroupAccess() {},
		async requireGroupAccessBatch() {},
		async requireGroupAccessByRecord() {}
	};
}
