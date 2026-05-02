/**
 * PermissionContext — runtime permission state for a single authenticated user in an org.
 *
 * Three construction paths:
 * - `createPermissionContext(supabase, userId, orgId)` — fetches the membership row and builds.
 *   Use in routes that don't already have the row (rare; prefer the layout-based path).
 * - `createPermissionContextFromMembership(row)` — builds from an already-fetched membership row.
 *   This is the standard path; the layout server fetches the row once, all routes reuse it.
 * - `createSandboxContext()` — all-permissions-true no-op context used in demo/sandbox orgs.
 *
 * PermissionContext is consumed by the AuthContext adapter (`supabaseAuthContext.ts`), which
 * wraps it in the AuthContext port used by use cases. Direct use in routes is discouraged;
 * go through `ctx.auth` (UseCaseContext) instead.
 */
import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createCompatibilityLaneMap,
	resolveStoredMemberAccessShape,
	toMemberAccessShape,
	type CapabilityMap,
	type CompatibilityLaneMap,
	type CapabilityOverrideMap,
	type ScopeSet,
	type StoredMemberPreset
} from '$lib/access/memberAccessShape';
import type { OrganizationMemberPermissions } from '$lib/types';
import type { FeatureArea } from './core/ports';
import { createSupabaseGroupResolver, enforceGroupAccess, enforceGroupAccessBatch } from './groupAccess';

export type { FeatureArea };

const PRIVILEGED_CAPABILITY_MAP: CapabilityMap = {
	calendar: 'configure',
	personnel: 'configure',
	training: 'configure',
	criticalTasks: 'configure',
	onboarding: 'configure',
	ratingScheme: 'configure'
};
const PRIVILEGED_COMPATIBILITY_LANES: CompatibilityLaneMap = createCompatibilityLaneMap('configure');

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

export function createSandboxContext(): PermissionContext {
	const allTrue: Record<FeatureArea, boolean> = {
		calendar: true,
		personnel: true,
		training: true,
		'critical-tasks': true,
		onboarding: true,
		'rating-scheme': true,
		'leaders-book': true
	};

	const ctx: PermissionContext = {
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		capabilityMap: buildPrivilegedCapabilityMap(),
		compatibilityLanes: buildPrivilegedCompatibilityLanes(),
		scopeSet: { kind: 'organization' },
		canView: { ...allTrue },
		canEdit: { ...allTrue },
		canManageMembers: true,

		requireView(): void {},
		requirePrivileged(): void {},
		requireOwner(): void {},
		requireManageMembers(): void {},

		async requireGroupAccess(): Promise<void> {},
		async requireGroupAccessBatch(): Promise<void> {},
		async requireGroupAccessByRecord(): Promise<void> {}
	};

	return ctx;
}

/** The shape of a membership row needed to build a PermissionContext (no DB query required) */
export interface MembershipRow {
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
	can_view_leaders_book: boolean;
	can_edit_leaders_book: boolean;
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
	const role = membership.role;
	const isOwner = role === 'owner';
	const isAdmin = role === 'admin';
	const isPrivileged = isOwner || isAdmin;
	const scopedGroupId = isPrivileged ? null : (membership.scoped_group_id as string | null);

	const canView: Record<FeatureArea, boolean> = {
		calendar: isPrivileged || !!membership.can_view_calendar,
		personnel: isPrivileged || !!membership.can_view_personnel,
		training: isPrivileged || !!membership.can_view_training,
		'critical-tasks': isPrivileged || !!membership.can_view_critical_tasks,
		onboarding: isPrivileged || !!membership.can_view_onboarding,
		'rating-scheme': isPrivileged || (membership.can_view_rating_scheme ?? !!membership.can_view_personnel),
		'leaders-book': isPrivileged || !!membership.can_view_leaders_book
	};

	const canEdit: Record<FeatureArea, boolean> = {
		calendar: isPrivileged || !!membership.can_edit_calendar,
		personnel: isPrivileged || !!membership.can_edit_personnel,
		training: isPrivileged || !!membership.can_edit_training,
		'critical-tasks': isPrivileged || !!membership.can_edit_critical_tasks,
		onboarding: isPrivileged || !!membership.can_edit_onboarding,
		'rating-scheme':
			isPrivileged ||
			(membership.can_edit_rating_scheme ?? (!!membership.can_edit_personnel && !!membership.can_edit_leaders_book)),
		'leaders-book': isPrivileged || !!membership.can_edit_leaders_book
	};

	const canManageMembers = isPrivileged || !!membership.can_manage_members;
	const memberPermissions: OrganizationMemberPermissions = {
		canViewCalendar: !!membership.can_view_calendar,
		canEditCalendar: !!membership.can_edit_calendar,
		canViewPersonnel: !!membership.can_view_personnel,
		canEditPersonnel: !!membership.can_edit_personnel,
		canViewTraining: !!membership.can_view_training,
		canEditTraining: !!membership.can_edit_training,
		canViewCriticalTasks: !!membership.can_view_critical_tasks,
		canEditCriticalTasks: !!membership.can_edit_critical_tasks,
		canViewOnboarding: !!membership.can_view_onboarding,
		canEditOnboarding: !!membership.can_edit_onboarding,
		canViewRatingScheme: membership.can_view_rating_scheme,
		canEditRatingScheme: membership.can_edit_rating_scheme,
		canViewLeadersBook: !!membership.can_view_leaders_book,
		canEditLeadersBook: !!membership.can_edit_leaders_book,
		canManageMembers: !!membership.can_manage_members
	};

	const accessShape = isPrivileged
		? {
				capabilityMap: buildPrivilegedCapabilityMap(),
				compatibilityLanes: buildPrivilegedCompatibilityLanes(),
				scopeSet: { kind: 'organization' } as ScopeSet
			}
		: resolveMembershipAccessShape(membership, memberPermissions, scopedGroupId);
	const scopedGroupAccess = accessShape.scopeSet.kind === 'groups' ? accessShape.scopeSet.groupIds : null;

	const areaLabel = (area: FeatureArea) => {
		switch (area) {
			case 'leaders-book':
				return 'leaders book';
			case 'critical-tasks':
				return 'critical tasks';
			case 'rating-scheme':
				return 'rating scheme';
			default:
				return area;
		}
	};

	const ctx: PermissionContext = {
		role,
		isOwner,
		isAdmin,
		isPrivileged,
		capabilityMap: accessShape.capabilityMap,
		compatibilityLanes: accessShape.compatibilityLanes,
		scopeSet: accessShape.scopeSet,
		canView,
		canEdit,
		canManageMembers,

		requireView(area: FeatureArea): void {
			if (!canView[area]) {
				throw error(403, `You do not have permission to view ${areaLabel(area)} data`);
			}
		},

		requirePrivileged(): void {
			if (!isPrivileged) {
				throw error(403, 'This action requires admin or owner permissions');
			}
		},

		requireOwner(): void {
			if (!isOwner) {
				throw error(403, 'Only the organization owner can perform this action');
			}
		},

		requireManageMembers(): void {
			if (!canManageMembers) {
				throw error(403, 'You do not have permission to manage this organization');
			}
		},

		async requireGroupAccess(supabaseClient: SupabaseClient, personnelId: string): Promise<void> {
			const resolver = createSupabaseGroupResolver(supabaseClient);
			await enforceGroupAccess(resolver, scopedGroupAccess, personnelId);
		},

		async requireGroupAccessBatch(supabaseClient: SupabaseClient, personnelIds: string[]): Promise<void> {
			const resolver = createSupabaseGroupResolver(supabaseClient);
			await enforceGroupAccessBatch(resolver, scopedGroupAccess, personnelIds);
		},

		async requireGroupAccessByRecord(
			supabaseClient: SupabaseClient,
			table: string,
			recordId: string,
			orgId: string,
			personnelIdColumn: string
		): Promise<void> {
			if (!scopedGroupAccess) return;

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
			await enforceGroupAccess(resolver, scopedGroupAccess, personnelId);
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
			'role, scoped_group_id, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_critical_tasks, can_edit_critical_tasks, can_view_onboarding, can_edit_onboarding, can_view_rating_scheme, can_edit_rating_scheme, can_view_leaders_book, can_edit_leaders_book, can_manage_members, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids'
		)
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership) {
		throw error(403, 'Not a member of this organization');
	}

	return membership as MembershipRow;
}

function buildPrivilegedCapabilityMap(): CapabilityMap {
	return { ...PRIVILEGED_CAPABILITY_MAP };
}

function buildPrivilegedCompatibilityLanes(): CompatibilityLaneMap {
	return { ...PRIVILEGED_COMPATIBILITY_LANES };
}

function resolveMembershipAccessShape(
	membership: MembershipRow,
	permissions: OrganizationMemberPermissions,
	scopedGroupId: string | null
): { capabilityMap: CapabilityMap; compatibilityLanes: CompatibilityLaneMap; scopeSet: ScopeSet } {
	if (isStoredMemberPreset(membership.member_preset)) {
		const shape = resolveStoredMemberAccessShape({
			membershipRole: membership.role,
			memberPreset: membership.member_preset,
			capabilityOverrides: membership.capability_overrides,
			scopeSet: toStoredScopeSet(membership),
			canManageMembers: membership.can_manage_members
		});
		return {
			capabilityMap: shape.capabilityMap,
			compatibilityLanes: shape.compatibilityLanes,
			scopeSet: shape.scopeSet
		};
	}

	const shape = toMemberAccessShape({
		membershipRole: membership.role,
		permissions,
		scopedGroupId
	});
	return {
		capabilityMap: shape.capabilityMap,
		compatibilityLanes: shape.compatibilityLanes,
		scopeSet: shape.scopeSet
	};
}

function isStoredMemberPreset(value: unknown): value is StoredMemberPreset {
	return value === 'viewer' || value === 'operator' || value === 'editor';
}

function toStoredScopeSet(membership: MembershipRow): ScopeSet {
	if (membership.access_scope_kind === 'groups' && Array.isArray(membership.access_scope_group_ids)) {
		return { kind: 'groups', groupIds: membership.access_scope_group_ids };
	}

	return { kind: 'organization' };
}
