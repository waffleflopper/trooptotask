import type { OrganizationMemberPermissions } from '$lib/types';
import {
	createCapabilityMap,
	createCompatibilityLaneMap,
	resolveMemberAccessShapeFromStoredOrCurrent,
	resolveRatingSchemePermissions,
	type CapabilityMap,
	type CompatibilityLaneMap,
	type MemberPreset,
	type ScopeSet
} from './memberAccessShape';

export type MembershipRole = 'owner' | 'admin' | 'member';
export type MemberAccessFeatureArea =
	| 'calendar'
	| 'personnel'
	| 'training'
	| 'critical-tasks'
	| 'onboarding'
	| 'rating-scheme';

export interface MemberAccessProjectionRow {
	role: MembershipRole;
	scoped_group_id: string | null;
	can_view_calendar: boolean;
	can_edit_calendar: boolean;
	can_view_personnel: boolean;
	can_edit_personnel: boolean;
	can_view_training: boolean;
	can_edit_training: boolean;
	can_view_critical_tasks?: boolean | null;
	can_edit_critical_tasks?: boolean | null;
	can_view_onboarding: boolean;
	can_edit_onboarding: boolean;
	can_view_rating_scheme?: boolean | null;
	can_edit_rating_scheme?: boolean | null;
	can_manage_members: boolean;
	member_preset?: unknown;
	capability_overrides?: unknown;
	access_scope_kind?: unknown;
	access_scope_group_ids?: unknown;
}

export interface MemberAccessPresentationRow {
	scoped_group_id?: string | null;
	can_view_calendar: boolean;
	can_edit_calendar: boolean;
	can_view_personnel: boolean;
	can_edit_personnel: boolean;
	can_view_training: boolean;
	can_edit_training: boolean;
	can_view_critical_tasks?: boolean | null;
	can_edit_critical_tasks?: boolean | null;
	can_view_onboarding: boolean;
	can_edit_onboarding: boolean;
	can_view_rating_scheme?: boolean | null;
	can_edit_rating_scheme?: boolean | null;
	can_manage_members: boolean;
	member_preset?: unknown;
	capability_overrides?: unknown;
	access_scope_kind?: unknown;
	access_scope_group_ids?: unknown;
}

export interface EffectiveMemberAccessProjection {
	role: MembershipRole;
	isOwner: boolean;
	isAdmin: boolean;
	isPrivileged: boolean;
	permissions: Required<OrganizationMemberPermissions>;
	canView: Record<MemberAccessFeatureArea, boolean>;
	canEdit: Record<MemberAccessFeatureArea, boolean>;
	canManageMembers: boolean;
	scopedGroupId: string | null;
	memberPreset: MemberPreset;
	capabilityMap: CapabilityMap;
	compatibilityLanes: CompatibilityLaneMap;
	scopeSet: ScopeSet;
}

export interface StoredMemberAccessPresentation {
	permissions: Required<OrganizationMemberPermissions>;
	scopedGroupId: string | null;
	memberPreset: string | null;
	capabilityOverrides: Record<string, unknown>;
	accessScopeKind: string | null;
	accessScopeGroupIds: string[];
}

export function projectEffectiveMemberAccess(row: MemberAccessProjectionRow): EffectiveMemberAccessProjection {
	const role = row.role;
	const isOwner = role === 'owner';
	const isAdmin = role === 'admin';
	const isPrivileged = isOwner || isAdmin;
	const permissions = projectMemberPermissions(row, { privileged: isPrivileged });
	const accessShape = isPrivileged
		? {
				memberPreset: 'editor' as const,
				capabilityMap: createCapabilityMap('configure'),
				compatibilityLanes: createCompatibilityLaneMap(),
				scopeSet: { kind: 'organization' } as ScopeSet
			}
		: resolveMemberAccessShapeFromStoredOrCurrent({
				membershipRole: role,
				permissions,
				scopedGroupId: row.scoped_group_id ?? null,
				memberPreset: row.member_preset,
				capabilityOverrides: row.capability_overrides,
				accessScopeKind: row.access_scope_kind,
				accessScopeGroupIds: row.access_scope_group_ids
			});

	return {
		role,
		isOwner,
		isAdmin,
		isPrivileged,
		permissions,
		canView: {
			calendar: permissions.canViewCalendar,
			personnel: permissions.canViewPersonnel,
			training: permissions.canViewTraining,
			'critical-tasks': permissions.canViewCriticalTasks,
			onboarding: permissions.canViewOnboarding,
			'rating-scheme': permissions.canViewRatingScheme
		},
		canEdit: {
			calendar: permissions.canEditCalendar,
			personnel: permissions.canEditPersonnel,
			training: permissions.canEditTraining,
			'critical-tasks': permissions.canEditCriticalTasks,
			onboarding: permissions.canEditOnboarding,
			'rating-scheme': permissions.canEditRatingScheme
		},
		canManageMembers: permissions.canManageMembers,
		scopedGroupId: isPrivileged ? null : (row.scoped_group_id ?? null),
		memberPreset: accessShape.memberPreset,
		capabilityMap: accessShape.capabilityMap,
		compatibilityLanes: accessShape.compatibilityLanes,
		scopeSet: accessShape.scopeSet
	};
}

export function projectStoredMemberAccessPresentation(
	row: MemberAccessPresentationRow
): StoredMemberAccessPresentation {
	return {
		permissions: projectMemberPermissions(row, { privileged: false }),
		scopedGroupId: row.scoped_group_id ?? null,
		memberPreset: typeof row.member_preset === 'string' ? row.member_preset : null,
		capabilityOverrides: toRecord(row.capability_overrides),
		accessScopeKind: typeof row.access_scope_kind === 'string' ? row.access_scope_kind : null,
		accessScopeGroupIds: toStringArray(row.access_scope_group_ids)
	};
}

export function projectMemberPermissions(
	row: MemberAccessPresentationRow,
	options: { privileged?: boolean } = {}
): Required<OrganizationMemberPermissions> {
	const privileged = options.privileged === true;
	const ratingScheme = resolveRatingSchemePermissions({
		canViewPersonnel: !!row.can_view_personnel,
		canEditPersonnel: !!row.can_edit_personnel,
		canViewRatingScheme: row.can_view_rating_scheme ?? undefined,
		canEditRatingScheme: row.can_edit_rating_scheme ?? undefined
	});

	return {
		canViewCalendar: privileged || !!row.can_view_calendar,
		canEditCalendar: privileged || !!row.can_edit_calendar,
		canViewPersonnel: privileged || !!row.can_view_personnel,
		canEditPersonnel: privileged || !!row.can_edit_personnel,
		canViewTraining: privileged || !!row.can_view_training,
		canEditTraining: privileged || !!row.can_edit_training,
		canViewCriticalTasks: privileged || !!row.can_view_critical_tasks,
		canEditCriticalTasks: privileged || !!row.can_edit_critical_tasks,
		canViewOnboarding: privileged || !!row.can_view_onboarding,
		canEditOnboarding: privileged || !!row.can_edit_onboarding,
		canViewRatingScheme: privileged || ratingScheme.canViewRatingScheme,
		canEditRatingScheme: privileged || ratingScheme.canEditRatingScheme,
		canManageMembers: privileged || !!row.can_manage_members
	};
}

function toRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item): item is string => typeof item === 'string');
}
