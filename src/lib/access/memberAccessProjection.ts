import type { OrganizationMemberPermissions } from '$lib/types';
import {
	createCapabilityMap,
	createCompatibilityLaneMap,
	resolveStoredMemberAccessShape,
	toCurrentPermissionFlags,
	type CapabilityMap,
	type CompatibilityLaneMap,
	type CapabilityOverrideMap,
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
	member_preset?: unknown;
	capability_overrides?: unknown;
	access_scope_kind?: unknown;
	access_scope_group_ids?: unknown;
}

export interface MemberAccessInvitationProjectionRow {
	role?: unknown;
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

export function projectEffectiveMemberAccess(row: MemberAccessProjectionRow): EffectiveMemberAccessProjection {
	const role = row.role;
	const isOwner = role === 'owner';
	const isAdmin = role === 'admin';
	const isPrivileged = isOwner || isAdmin;
	const accessShape = isPrivileged
		? {
				membershipRole: role,
				memberPreset: 'editor' as const,
				capabilityMap: createCapabilityMap('configure'),
				compatibilityLanes: createCompatibilityLaneMap(),
				scopeSet: { kind: 'organization' } as ScopeSet,
				canManageMembers: true
			}
		: resolveStoredMemberAccessShape({
				membershipRole: role,
				memberPreset: parseStoredMemberPreset(row.member_preset),
				capabilityOverrides: parseCapabilityOverrideMap(row.capability_overrides),
				scopeSet: parseStoredScopeSet(row)
			});
	const permissions = toCurrentPermissionFlags(accessShape) as Required<OrganizationMemberPermissions>;

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
		scopedGroupId:
			isPrivileged || accessShape.scopeSet.kind !== 'groups' || accessShape.scopeSet.groupIds.length !== 1
				? null
				: accessShape.scopeSet.groupIds[0],
		memberPreset: accessShape.memberPreset,
		capabilityMap: accessShape.capabilityMap,
		compatibilityLanes: accessShape.compatibilityLanes,
		scopeSet: accessShape.scopeSet
	};
}

export function projectEffectiveInvitationAccess(
	row: MemberAccessInvitationProjectionRow
): EffectiveMemberAccessProjection {
	return projectEffectiveMemberAccess({
		...row,
		role: parseInvitationMembershipRole(row.role)
	});
}

function parseInvitationMembershipRole(value: unknown): MembershipRole {
	return value === 'admin' ? 'admin' : 'member';
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item): item is string => typeof item === 'string');
}

function parseStoredMemberPreset(value: unknown): 'viewer' | 'operator' | 'editor' {
	if (value === 'viewer' || value === 'operator' || value === 'editor') {
		return value;
	}

	throw new Error('Member access projection requires normalized replacement storage');
}

function parseCapabilityOverrideMap(value: unknown): CapabilityOverrideMap {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	const overrides: CapabilityOverrideMap = {};
	for (const [lane, level] of Object.entries(value)) {
		if (
			(lane === 'calendar' ||
				lane === 'personnel' ||
				lane === 'training' ||
				lane === 'criticalTasks' ||
				lane === 'onboarding' ||
				lane === 'ratingScheme') &&
			(level === 'none' || level === 'view' || level === 'operate' || level === 'configure')
		) {
			overrides[lane] = level;
		}
	}

	return overrides;
}

function parseStoredScopeSet(
	input: Pick<MemberAccessProjectionRow, 'access_scope_kind' | 'access_scope_group_ids'>
): ScopeSet {
	if (input.access_scope_kind !== 'groups') {
		return { kind: 'organization' };
	}

	const groupIds = toStringArray(input.access_scope_group_ids);
	return groupIds.length > 0 ? { kind: 'groups', groupIds: Array.from(new Set(groupIds)) } : { kind: 'organization' };
}
