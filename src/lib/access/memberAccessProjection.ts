import { disabledFeatureLanes, type FeatureKey } from './featureSwitches';
import {
	createCapabilityMap,
	resolveStoredMemberAccessShape,
	type CapabilityMap,
	type CapabilityOverrideMap,
	type MemberPreset,
	type OrganizationAccessGrant,
	type GroupCoverage,
	type AdvisoryGroupScope,
	type ScopeSet
} from './memberAccessShape';

export type MembershipRole = 'owner' | 'admin' | 'member';
export interface MemberAccessProjectionRow {
	role: MembershipRole;
	member_preset?: unknown;
	capability_overrides?: unknown;
	access_scope_kind?: unknown;
	access_scope_group_ids?: unknown;
}

export interface OrganizationMembershipFacts extends MemberAccessProjectionRow {
	id?: string;
	covered_group_ids?: unknown;
}

export interface MemberAccessInvitationProjectionRow {
	role?: unknown;
	member_preset?: unknown;
	capability_overrides?: unknown;
	access_scope_kind?: unknown;
	access_scope_group_ids?: unknown;
}

/** Unit-wide facts read from the Organization row the request already selects. */
export interface OrganizationFeatureSwitches {
	disabledFeatures: readonly FeatureKey[];
}

export interface EffectiveMemberAccessProjection {
	role: MembershipRole;
	isOwner: boolean;
	isAdmin: boolean;
	isPrivileged: boolean;
	canManageMembers: boolean;
	memberPreset: MemberPreset;
	capabilityMap: CapabilityMap;
	scopeSet: ScopeSet;
	/** Off for the unit, as distinct from a lane the member has no permission for. */
	disabledFeatures: readonly FeatureKey[];
}

export function projectEffectiveMemberAccess(
	row: MemberAccessProjectionRow,
	switches: OrganizationFeatureSwitches
): EffectiveMemberAccessProjection {
	const role = row.role;
	const isOwner = role === 'owner';
	const isAdmin = role === 'admin';
	const isPrivileged = isOwner || isAdmin;
	const accessShape = isPrivileged
		? {
				membershipRole: role,
				memberPreset: 'editor' as const,
				capabilityMap: createCapabilityMap('configure'),
				scopeSet: { kind: 'organization' } as ScopeSet
			}
		: resolveStoredMemberAccessShape({
				membershipRole: role,
				memberPreset: parseStoredMemberPreset(row.member_preset),
				capabilityOverrides: parseCapabilityOverrideMap(row.capability_overrides),
				scopeSet: parseStoredScopeSet(row)
			});

	return {
		role,
		isOwner,
		isAdmin,
		isPrivileged,
		canManageMembers: isPrivileged,
		memberPreset: accessShape.memberPreset,
		capabilityMap: withFeatureLanesOff(accessShape.capabilityMap, switches.disabledFeatures),
		scopeSet: accessShape.scopeSet,
		disabledFeatures: switches.disabledFeatures
	};
}

/** The levels the row keeps on file. Owners and admins project to Manage everywhere but still carry these. */
export function storedCapabilityMap(
	row: Pick<MemberAccessProjectionRow, 'member_preset' | 'capability_overrides'>
): CapabilityMap {
	return resolveStoredMemberAccessShape({
		membershipRole: 'member',
		memberPreset: parseStoredMemberPreset(row.member_preset),
		capabilityOverrides: parseCapabilityOverrideMap(row.capability_overrides)
	}).capabilityMap;
}

function withFeatureLanesOff(capabilityMap: CapabilityMap, disabledFeatures: readonly FeatureKey[]): CapabilityMap {
	const gated = { ...capabilityMap };
	for (const lane of disabledFeatureLanes(disabledFeatures)) gated[lane] = 'none';
	return gated;
}

export function projectOrganizationAccessGrant(
	membership: OrganizationMembershipFacts,
	userId: string,
	orgId: string,
	switches: OrganizationFeatureSwitches
): OrganizationAccessGrant {
	const access = projectEffectiveMemberAccess(membership, switches);
	return {
		userId,
		orgId,
		role: access.role,
		isPrivileged: access.isPrivileged,
		canManageMembers: access.canManageMembers,
		capabilityMap: access.capabilityMap,
		scopeSet: projectGroupCoverage(access.scopeSet, membership.covered_group_ids)
	};
}

function projectGroupCoverage(scopeSet: ScopeSet, coveredGroupIds: unknown): GroupCoverage {
	if (scopeSet.kind === 'organization') return { kind: 'organization' };
	if (!Array.isArray(coveredGroupIds) || !coveredGroupIds.every((id): id is string => typeof id === 'string')) {
		throw new Error('Request member access requires SQL Group coverage');
	}
	const coverage: Required<Extract<AdvisoryGroupScope, { kind: 'groups' }>> = {
		kind: 'groups',
		groupIds: [...new Set(coveredGroupIds)],
		grantedGroupIds: scopeSet.groupIds
	};
	return coverage as GroupCoverage;
}

export function projectEffectiveInvitationAccess(
	row: MemberAccessInvitationProjectionRow
): EffectiveMemberAccessProjection {
	return projectEffectiveMemberAccess(
		{
			...row,
			role: parseInvitationMembershipRole(row.role)
		},
		{ disabledFeatures: [] }
	);
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
	return { kind: 'groups', groupIds: Array.from(new Set(groupIds)) };
}
