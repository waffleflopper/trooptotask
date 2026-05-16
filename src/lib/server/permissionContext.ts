/**
 * PermissionContext — runtime permission state for a single authenticated user in an org.
 *
 * Two construction paths:
 * - `createPermissionContext(supabase, userId, orgId)` — fetches the membership row and builds.
 *   Use in routes that don't already have the row (rare; prefer the layout-based path).
 * - `createPermissionContextFromMembership(row)` — builds from an already-fetched membership row.
 *   This is the standard path; the layout server fetches the row once, all routes reuse it.
 *
 * PermissionContext is consumed by the AuthContext adapter (`supabaseAuthContext.ts`), which
 * wraps it in the AuthContext port used by use cases. Direct use in routes is discouraged;
 * go through `ctx.auth` (UseCaseContext) instead.
 */
import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	CapabilityMap,
	CompatibilityLaneMap,
	CapabilityOverrideMap,
	ScopeSet,
	StoredMemberPreset
} from '$lib/access/memberAccessShape';
import { projectEffectiveMemberAccess } from '$lib/access/memberAccessProjection';
import type { FeatureArea } from './core/ports';
import { createSupabaseGroupResolver, enforceGroupAccess, enforceGroupAccessBatch } from './groupAccess';

export type { FeatureArea };

export interface PermissionContext {
	readonly role: 'owner' | 'admin' | 'member';
	readonly isOwner: boolean;
	readonly isAdmin: boolean;
	readonly isPrivileged: boolean;
	readonly capabilityMap: CapabilityMap;
	readonly compatibilityLanes: CompatibilityLaneMap;
	readonly scopeSet: ScopeSet;
	readonly canView: Record<FeatureArea, boolean>;
	readonly canEdit: Record<FeatureArea, boolean>;
	readonly canManageMembers: boolean;

	requireView(area: FeatureArea): void;
	requirePrivileged(): void;
	requireOwner(): void;
	requireManageMembers(): void;

	requireGroupAccess(supabase: SupabaseClient, personnelId: string): Promise<void>;
	requireGroupAccessBatch(supabase: SupabaseClient, personnelIds: string[]): Promise<void>;
	requireGroupAccessByRecord(
		supabase: SupabaseClient,
		table: string,
		recordId: string,
		orgId: string,
		personnelIdColumn: string
	): Promise<void>;
}

/** The shape of a membership row needed to build a PermissionContext (no DB query required) */
export interface MembershipRow {
	id?: string;
	role: 'owner' | 'admin' | 'member';
	scoped_group_id: string | null;
	can_view_calendar: boolean;
	can_edit_calendar: boolean;
	can_view_personnel: boolean;
	can_edit_personnel: boolean;
	can_view_training: boolean;
	can_edit_training: boolean;
	can_view_critical_tasks?: boolean;
	can_edit_critical_tasks?: boolean;
	can_view_onboarding: boolean;
	can_edit_onboarding: boolean;
	can_view_rating_scheme?: boolean;
	can_edit_rating_scheme?: boolean;
	can_manage_members: boolean;
	member_preset?: StoredMemberPreset | null;
	capability_overrides?: CapabilityOverrideMap | null;
	access_scope_kind?: ScopeSet['kind'] | null;
	access_scope_group_ids?: string[] | null;
}

/**
 * Build a PermissionContext from an already-fetched membership row.
 * This avoids a redundant DB query when the caller already has the membership data.
 * Group access enforcement requires a SupabaseClient, so those methods are no-ops here —
 * they are wired up in the AuthContext adapter layer which has the client.
 */
export function createPermissionContextFromMembership(membership: MembershipRow): PermissionContext {
	const projection = projectEffectiveMemberAccess(membership);

	const areaLabel = (area: FeatureArea) => {
		switch (area) {
			case 'critical-tasks':
				return 'critical tasks';
			case 'rating-scheme':
				return 'rating scheme';
			default:
				return area;
		}
	};

	const ctx: PermissionContext = {
		role: projection.role,
		isOwner: projection.isOwner,
		isAdmin: projection.isAdmin,
		isPrivileged: projection.isPrivileged,
		capabilityMap: projection.capabilityMap,
		compatibilityLanes: projection.compatibilityLanes,
		scopeSet: projection.scopeSet,
		canView: projection.canView,
		canEdit: projection.canEdit,
		canManageMembers: projection.canManageMembers,

		requireView(area: FeatureArea): void {
			if (!projection.canView[area]) {
				throw error(403, `You do not have permission to view ${areaLabel(area)} data`);
			}
		},

		requirePrivileged(): void {
			if (!projection.isPrivileged) {
				throw error(403, 'This action requires admin or owner permissions');
			}
		},

		requireOwner(): void {
			if (!projection.isOwner) {
				throw error(403, 'Only the organization owner can perform this action');
			}
		},

		requireManageMembers(): void {
			if (!projection.canManageMembers) {
				throw error(403, 'You do not have permission to manage this organization');
			}
		},

		async requireGroupAccess(supabaseClient: SupabaseClient, personnelId: string): Promise<void> {
			const resolver = createSupabaseGroupResolver(supabaseClient);
			await enforceGroupAccess(resolver, projection.scopeSet, personnelId);
		},

		async requireGroupAccessBatch(supabaseClient: SupabaseClient, personnelIds: string[]): Promise<void> {
			const resolver = createSupabaseGroupResolver(supabaseClient);
			await enforceGroupAccessBatch(resolver, projection.scopeSet, personnelIds);
		},

		async requireGroupAccessByRecord(
			supabaseClient: SupabaseClient,
			table: string,
			recordId: string,
			orgId: string,
			personnelIdColumn: string
		): Promise<void> {
			if (projection.scopeSet.kind === 'organization') return;

			const { data: record } = await supabaseClient
				.from(table)
				.select(personnelIdColumn)
				.eq('id', recordId)
				.eq('organization_id', orgId)
				.single();

			if (!record) return;

			const personnelId = (record as unknown as Record<string, unknown>)[personnelIdColumn] as string | null;
			if (!personnelId) return;

			const resolver = createSupabaseGroupResolver(supabaseClient);
			await enforceGroupAccess(resolver, projection.scopeSet, personnelId);
		}
	};

	return ctx;
}

export async function createPermissionContext(
	supabase: SupabaseClient,
	userId: string,
	orgId: string
): Promise<PermissionContext> {
	const membership = await getMembershipRow(supabase, userId, orgId);
	return createPermissionContextFromMembership(membership);
}

export async function getMembershipRow(
	supabase: SupabaseClient,
	userId: string,
	orgId: string
): Promise<MembershipRow> {
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select(
			'id, role, scoped_group_id, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_critical_tasks, can_edit_critical_tasks, can_view_onboarding, can_edit_onboarding, can_view_rating_scheme, can_edit_rating_scheme, can_manage_members, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids'
		)
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership) {
		throw error(403, 'Not a member of this organization');
	}

	return membership as MembershipRow;
}
