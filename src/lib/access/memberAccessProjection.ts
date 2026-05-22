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

export interface MemberAccessInvitationProjectionRow {
	role?: unknown;
	scoped_group_id?: string | null;
	can_view_calendar?: boolean | null;
	can_edit_calendar?: boolean | null;
	can_view_personnel?: boolean | null;
	can_edit_personnel?: boolean | null;
	can_view_training?: boolean | null;
	can_edit_training?: boolean | null;
	can_view_critical_tasks?: boolean | null;
	can_edit_critical_tasks?: boolean | null;
	can_view_onboarding?: boolean | null;
	can_edit_onboarding?: boolean | null;
	can_view_rating_scheme?: boolean | null;
	can_edit_rating_scheme?: boolean | null;
	can_manage_members?: boolean | null;
	member_preset?: unknown;
	capability_overrides?: unknown;
	access_scope_kind?: unknown;
	access_scope_group_ids?: unknown;
}

export interface MemberAccessInvitationCompatibilityInput {
	role?: unknown;
	scopedGroupId?: string | null;
	canViewCalendar?: boolean | null;
	canEditCalendar?: boolean | null;
	canViewPersonnel?: boolean | null;
	canEditPersonnel?: boolean | null;
	canViewTraining?: boolean | null;
	canEditTraining?: boolean | null;
	canViewCriticalTasks?: boolean | null;
	canEditCriticalTasks?: boolean | null;
	canViewOnboarding?: boolean | null;
	canEditOnboarding?: boolean | null;
	canViewRatingScheme?: boolean | null;
	canEditRatingScheme?: boolean | null;
	canManageMembers?: boolean | null;
	memberPreset?: unknown;
	capabilityOverrides?: unknown;
	accessScopeKind?: unknown;
	accessScopeGroupIds?: unknown;
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

export function projectEffectiveInvitationAccess(
	row: MemberAccessInvitationProjectionRow
): EffectiveMemberAccessProjection {
	const normalized = normalizeInvitationProjectionRow(row);
	return projectEffectiveMemberAccess({
		...normalized,
		role: parseInvitationMembershipRole(row.role) ?? inferInvitationMembershipRole(row)
	});
}

export function projectEffectiveInvitationCompatibilityAccess(
	input: MemberAccessInvitationCompatibilityInput
): EffectiveMemberAccessProjection {
	return projectEffectiveInvitationAccess({
		role: input.role,
		scoped_group_id: input.scopedGroupId,
		can_view_calendar: input.canViewCalendar,
		can_edit_calendar: input.canEditCalendar,
		can_view_personnel: input.canViewPersonnel,
		can_edit_personnel: input.canEditPersonnel,
		can_view_training: input.canViewTraining,
		can_edit_training: input.canEditTraining,
		can_view_critical_tasks: input.canViewCriticalTasks,
		can_edit_critical_tasks: input.canEditCriticalTasks,
		can_view_onboarding: input.canViewOnboarding,
		can_edit_onboarding: input.canEditOnboarding,
		can_view_rating_scheme: input.canViewRatingScheme,
		can_edit_rating_scheme: input.canEditRatingScheme,
		can_manage_members: input.canManageMembers,
		member_preset: input.memberPreset,
		capability_overrides: input.capabilityOverrides,
		access_scope_kind: input.accessScopeKind,
		access_scope_group_ids: input.accessScopeGroupIds
	});
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

function normalizeInvitationProjectionRow(
	row: MemberAccessInvitationProjectionRow
): Omit<MemberAccessProjectionRow, 'role'> {
	return {
		scoped_group_id: row.scoped_group_id ?? null,
		can_view_calendar: row.can_view_calendar ?? true,
		can_edit_calendar: row.can_edit_calendar ?? true,
		can_view_personnel: row.can_view_personnel ?? true,
		can_edit_personnel: row.can_edit_personnel ?? true,
		can_view_training: row.can_view_training ?? true,
		can_edit_training: row.can_edit_training ?? true,
		can_view_critical_tasks: row.can_view_critical_tasks ?? true,
		can_edit_critical_tasks: row.can_edit_critical_tasks ?? true,
		can_view_onboarding: row.can_view_onboarding ?? true,
		can_edit_onboarding: row.can_edit_onboarding ?? true,
		can_view_rating_scheme: row.can_view_rating_scheme ?? row.can_view_personnel ?? true,
		can_edit_rating_scheme: row.can_edit_rating_scheme ?? row.can_edit_personnel ?? true,
		can_manage_members: row.can_manage_members ?? false,
		member_preset: row.member_preset,
		capability_overrides: row.capability_overrides,
		access_scope_kind: row.access_scope_kind,
		access_scope_group_ids: row.access_scope_group_ids
	};
}

function inferInvitationMembershipRole(row: MemberAccessInvitationProjectionRow): MembershipRole {
	const canViewRatingScheme = row.can_view_rating_scheme ?? row.can_view_personnel ?? true;
	const canEditRatingScheme = row.can_edit_rating_scheme ?? row.can_edit_personnel ?? true;

	return !!row.can_view_calendar &&
		!!row.can_edit_calendar &&
		!!row.can_view_personnel &&
		!!row.can_edit_personnel &&
		!!row.can_view_training &&
		!!row.can_edit_training &&
		!!row.can_view_critical_tasks &&
		!!row.can_edit_critical_tasks &&
		!!row.can_view_onboarding &&
		!!row.can_edit_onboarding &&
		!!canViewRatingScheme &&
		!!canEditRatingScheme &&
		!!row.can_manage_members
		? 'admin'
		: 'member';
}

function parseInvitationMembershipRole(value: unknown): MembershipRole | null {
	return value === 'admin' || value === 'member' ? value : null;
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
