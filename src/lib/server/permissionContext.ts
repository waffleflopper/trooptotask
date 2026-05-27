/**
 * PermissionContext — runtime permission state for a single authenticated user in an org.
 *
 * Two construction paths:
 * - `createPermissionContext(supabase, userId, orgId)` — fetches the membership row and builds.
 *   Use in routes that don't already have the row (rare; prefer the layout-based path).
 * - `createPermissionContextFromMembership(row)` — builds from an already-fetched membership row.
 *   This is the standard path; the layout server fetches the row once, all routes reuse it.
 *
 * PermissionContext is consumed by authorization adapters, which wrap it in
 * the ports used by use cases. Direct use in routes is discouraged;
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
}

/** The shape of a membership row needed to build a PermissionContext (no DB query required) */
export interface MembershipRow {
	id?: string;
	role: 'owner' | 'admin' | 'member';
	member_preset?: StoredMemberPreset | null;
	capability_overrides?: CapabilityOverrideMap | null;
	access_scope_kind?: ScopeSet['kind'] | null;
	access_scope_group_ids?: string[] | null;
}

/**
 * Build a PermissionContext from an already-fetched membership row.
 * This avoids a redundant DB query when the caller already has the membership data.
 * Group access enforcement is wired through the scope enforcement port.
 */
export function createPermissionContextFromMembership(membership: MembershipRow): PermissionContext {
	const projection = projectEffectiveMemberAccess(membership);

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
		canManageMembers: projection.canManageMembers
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
		.select('id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership) {
		throw error(403, 'Not a member of this organization');
	}

	assertNormalizedMembershipRow(membership);
	return membership as MembershipRow;
}

export function assertNormalizedMembershipRow(data: Record<string, unknown>): void {
	if (data.role === 'owner' || data.role === 'admin') {
		return;
	}

	const preset = data.member_preset;
	if (preset !== 'viewer' && preset !== 'operator' && preset !== 'editor') {
		throw error(500, 'Membership row is missing normalized member access storage');
	}
}
