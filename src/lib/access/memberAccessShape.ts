import type { OrganizationMemberPermissions } from '$lib/types';

export type MembershipRole = 'owner' | 'admin' | 'member';
export type CurrentPermissionPreset = 'owner' | 'admin' | 'full-editor' | 'team-leader' | 'viewer' | 'custom';
export type MemberPreset = 'viewer' | 'operator' | 'editor' | 'custom';
export type StoredMemberPreset = Exclude<MemberPreset, 'custom'>;
export type CapabilityLevel = 'none' | 'view' | 'operate' | 'configure';
export type DurableFeatureLane =
	| 'calendar'
	| 'personnel'
	| 'training'
	| 'criticalTasks'
	| 'onboarding'
	| 'ratingScheme';
export type CompatibilityFeatureLane = 'leadersBook';

export type CapabilityMap = Record<DurableFeatureLane, CapabilityLevel>;
export type CompatibilityLaneMap = Record<CompatibilityFeatureLane, CapabilityLevel>;
export type CapabilityOverrideMap = Partial<Record<DurableFeatureLane, CapabilityLevel>>;

export type ScopeSet = { kind: 'organization' } | { kind: 'groups'; groupIds: string[] };

export interface MemberAccessShape {
	membershipRole: MembershipRole;
	memberPreset: MemberPreset;
	capabilityMap: CapabilityMap;
	compatibilityLanes: CompatibilityLaneMap;
	scopeSet: ScopeSet;
	canManageMembers: boolean;
}

export interface CurrentMemberAccessInput {
	membershipRole?: MembershipRole;
	permissions: OrganizationMemberPermissions;
	scopedGroupId?: string | null;
}

export interface StoredMemberAccessInput {
	membershipRole: MembershipRole;
	memberPreset: StoredMemberPreset;
	capabilityOverrides?: CapabilityOverrideMap | null;
	scopeSet?: ScopeSet | null;
	canManageMembers?: boolean | null;
}

export interface MemberAccessStorage {
	memberPreset: StoredMemberPreset;
	capabilityOverrides: CapabilityOverrideMap;
	scopeSet: ScopeSet;
}

export interface SerializedScopeSetStorage {
	access_scope_kind: ScopeSet['kind'];
	access_scope_group_ids: string[];
}

export const PERMISSION_PRESETS: Record<
	Exclude<CurrentPermissionPreset, 'owner' | 'custom'>,
	OrganizationMemberPermissions
> = {
	admin: {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewCriticalTasks: true,
		canEditCriticalTasks: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewRatingScheme: true,
		canEditRatingScheme: true,
		canViewLeadersBook: true,
		canEditLeadersBook: true,
		canManageMembers: true
	},
	'full-editor': {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewCriticalTasks: true,
		canEditCriticalTasks: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewRatingScheme: true,
		canEditRatingScheme: true,
		canViewLeadersBook: true,
		canEditLeadersBook: true,
		canManageMembers: false
	},
	'team-leader': {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewCriticalTasks: true,
		canEditCriticalTasks: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewRatingScheme: true,
		canEditRatingScheme: true,
		canViewLeadersBook: true,
		canEditLeadersBook: true,
		canManageMembers: false
	},
	viewer: {
		canViewCalendar: true,
		canEditCalendar: false,
		canViewPersonnel: true,
		canEditPersonnel: false,
		canViewTraining: true,
		canEditTraining: false,
		canViewCriticalTasks: true,
		canEditCriticalTasks: false,
		canViewOnboarding: true,
		canEditOnboarding: false,
		canViewRatingScheme: true,
		canEditRatingScheme: false,
		canViewLeadersBook: true,
		canEditLeadersBook: false,
		canManageMembers: false
	}
};

const EDITOR_CAPABILITY_MAP = buildCapabilityMap('configure');
const OPERATOR_CAPABILITY_MAP = buildCapabilityMap('operate');
const VIEWER_CAPABILITY_MAP = buildCapabilityMap('view');

export function toMemberAccessShape(input: CurrentMemberAccessInput): MemberAccessShape {
	const permissions = withResolvedCompatibilityPermissions(input.permissions);
	const currentPreset = getPermissionPreset(permissions, input.scopedGroupId);
	const membershipRole = input.membershipRole ?? (currentPreset === 'admin' ? 'admin' : 'member');

	return {
		membershipRole,
		memberPreset: toMemberPreset(currentPreset),
		capabilityMap: {
			calendar: toCapabilityLevel(permissions.canViewCalendar, permissions.canEditCalendar),
			personnel: toCapabilityLevel(permissions.canViewPersonnel, permissions.canEditPersonnel),
			training: toCapabilityLevel(permissions.canViewTraining, permissions.canEditTraining),
			criticalTasks: toCapabilityLevel(permissions.canViewCriticalTasks, permissions.canEditCriticalTasks),
			onboarding: toCapabilityLevel(permissions.canViewOnboarding, permissions.canEditOnboarding),
			ratingScheme: toCapabilityLevel(permissions.canViewRatingScheme, permissions.canEditRatingScheme)
		},
		compatibilityLanes: {
			leadersBook: toCapabilityLevel(permissions.canViewLeadersBook, permissions.canEditLeadersBook)
		},
		scopeSet: input.scopedGroupId ? { kind: 'groups', groupIds: [input.scopedGroupId] } : { kind: 'organization' },
		canManageMembers: permissions.canManageMembers || membershipRole === 'owner' || membershipRole === 'admin'
	};
}

export function toCurrentPermissionFlags(shape: MemberAccessShape): OrganizationMemberPermissions {
	const permissions = fromCapabilityMap(shape.capabilityMap, shape.compatibilityLanes);
	return {
		...permissions,
		canManageMembers: shape.membershipRole === 'owner' || shape.membershipRole === 'admin' || shape.canManageMembers
	};
}

export function currentPresetToMemberAccessShape(input: {
	preset: string;
	scopedGroupId?: string | null;
	customPermissions?: Partial<OrganizationMemberPermissions> | null;
}): MemberAccessShape {
	const currentPreset = normalizeCurrentPreset(input.preset);
	const permissions =
		currentPreset === 'custom'
			? normalizeCustomPermissions(input.customPermissions)
			: (PERMISSION_PRESETS[currentPreset] ?? PERMISSION_PRESETS['full-editor']);
	return toMemberAccessShape({
		membershipRole: currentPreset === 'admin' ? 'admin' : 'member',
		permissions,
		scopedGroupId: currentPreset === 'team-leader' ? input.scopedGroupId : null
	});
}

export function resolveStoredMemberAccessShape(input: StoredMemberAccessInput): MemberAccessShape {
	const memberPreset = input.memberPreset;
	const capabilityMap = applyCapabilityOverrides(
		TARGET_MEMBER_PRESET_CAPABILITIES[memberPreset],
		input.capabilityOverrides
	);

	return {
		membershipRole: input.membershipRole,
		memberPreset,
		capabilityMap,
		compatibilityLanes: {
			leadersBook: capabilityMap.personnel
		},
		scopeSet: normalizeScopeSet(input.scopeSet),
		canManageMembers:
			input.membershipRole === 'owner' || input.membershipRole === 'admin' || input.canManageMembers === true
	};
}

export function currentPresetToMemberAccessStorage(input: {
	preset: string;
	scopedGroupId?: string | null;
	customPermissions?: Partial<OrganizationMemberPermissions> | null;
}): MemberAccessStorage {
	const shape = currentPresetToMemberAccessShape(input);
	const memberPreset = storedPresetForCurrentPreset(normalizeCurrentPreset(input.preset));
	return {
		memberPreset,
		capabilityOverrides: diffCapabilityOverrides(TARGET_MEMBER_PRESET_CAPABILITIES[memberPreset], shape.capabilityMap),
		scopeSet: normalizeScopeSet(shape.scopeSet)
	};
}

export function serializeScopeSetForStorage(scopeSet: ScopeSet): SerializedScopeSetStorage {
	const normalizedScopeSet = normalizeScopeSet(scopeSet);
	return {
		access_scope_kind: normalizedScopeSet.kind,
		access_scope_group_ids: normalizedScopeSet.kind === 'groups' ? normalizedScopeSet.groupIds : []
	};
}

export function resolveCurrentPresetPermissions(preset: string): OrganizationMemberPermissions {
	return toCurrentPermissionFlags(currentPresetToMemberAccessShape({ preset }));
}

export function resolveCurrentUpdatePermissions(
	preset: string,
	customPermissions?: Partial<OrganizationMemberPermissions> | null
): OrganizationMemberPermissions {
	return toCurrentPermissionFlags(currentPresetToMemberAccessShape({ preset, customPermissions }));
}

export function resolveRatingSchemePermissions(
	permissions: Pick<
		OrganizationMemberPermissions,
		'canViewPersonnel' | 'canEditPersonnel' | 'canViewRatingScheme' | 'canEditRatingScheme' | 'canEditLeadersBook'
	>
): { canViewRatingScheme: boolean; canEditRatingScheme: boolean } {
	return {
		canViewRatingScheme: permissions.canViewRatingScheme ?? permissions.canViewPersonnel,
		canEditRatingScheme:
			permissions.canEditRatingScheme ?? (permissions.canEditPersonnel && permissions.canEditLeadersBook)
	};
}

export function getPermissionPreset(
	permissions: OrganizationMemberPermissions,
	scopedGroupId?: string | null
): CurrentPermissionPreset {
	const resolvedPermissions = withResolvedCompatibilityPermissions(permissions);

	for (const [preset, presetPermissions] of Object.entries(PERMISSION_PRESETS)) {
		if (matchesPermissionPreset(resolvedPermissions, presetPermissions)) {
			if (preset === 'full-editor' && scopedGroupId) {
				return 'team-leader';
			}
			if (preset === 'team-leader' && !scopedGroupId) {
				continue;
			}
			return preset as CurrentPermissionPreset;
		}
	}
	return 'custom';
}

export function isFullEditor(permissions: OrganizationMemberPermissions, scopedGroupId?: string | null): boolean {
	const shape = toMemberAccessShape({ permissions, scopedGroupId });
	return (
		shape.scopeSet.kind === 'organization' &&
		Object.values(shape.capabilityMap).every((level) => level === 'configure') &&
		shape.compatibilityLanes.leadersBook === 'configure'
	);
}

function toMemberPreset(preset: CurrentPermissionPreset): MemberPreset {
	switch (preset) {
		case 'viewer':
			return 'viewer';
		case 'team-leader':
			return 'operator';
		case 'admin':
		case 'full-editor':
			return 'editor';
		case 'owner':
		case 'custom':
			return 'custom';
	}
}

function toCapabilityLevel(canView: boolean | undefined, canEdit: boolean | undefined): CapabilityLevel {
	if (canEdit) return 'configure';
	if (canView) return 'view';
	return 'none';
}

function toPermissionFlags(level: CapabilityLevel): { canView: boolean; canEdit: boolean } {
	return {
		canView: level !== 'none',
		canEdit: level === 'configure'
	};
}

function buildCapabilityMap(level: CapabilityLevel): CapabilityMap {
	return {
		calendar: level,
		personnel: level,
		training: level,
		criticalTasks: level,
		onboarding: level,
		ratingScheme: level
	};
}

function applyCapabilityOverrides(
	baseCapabilityMap: CapabilityMap,
	capabilityOverrides?: CapabilityOverrideMap | null
): CapabilityMap {
	return {
		...baseCapabilityMap,
		...filterCapabilityOverrides(capabilityOverrides)
	};
}

function diffCapabilityOverrides(
	baseCapabilityMap: CapabilityMap,
	capabilityMap: CapabilityMap
): CapabilityOverrideMap {
	const overrides: CapabilityOverrideMap = {};
	for (const lane of Object.keys(baseCapabilityMap) as DurableFeatureLane[]) {
		if (capabilityMap[lane] !== baseCapabilityMap[lane]) {
			overrides[lane] = capabilityMap[lane];
		}
	}
	return overrides;
}

function filterCapabilityOverrides(capabilityOverrides?: CapabilityOverrideMap | null): CapabilityOverrideMap {
	const overrides: CapabilityOverrideMap = {};
	if (!capabilityOverrides) {
		return overrides;
	}

	for (const lane of Object.keys(TARGET_MEMBER_PRESET_CAPABILITIES.viewer) as DurableFeatureLane[]) {
		const level = capabilityOverrides[lane];
		if (level === 'none' || level === 'view' || level === 'operate' || level === 'configure') {
			overrides[lane] = level;
		}
	}

	return overrides;
}

function normalizeScopeSet(scopeSet?: ScopeSet | null): ScopeSet {
	if (scopeSet?.kind !== 'groups') {
		return { kind: 'organization' };
	}

	const groupIds = Array.from(new Set(scopeSet.groupIds.filter(Boolean)));
	return groupIds.length > 0 ? { kind: 'groups', groupIds } : { kind: 'organization' };
}

function storedPresetForCurrentPreset(preset: Exclude<CurrentPermissionPreset, 'owner'>): StoredMemberPreset {
	switch (preset) {
		case 'viewer':
			return 'viewer';
		case 'team-leader':
			return 'operator';
		case 'admin':
		case 'full-editor':
			return 'editor';
		case 'custom':
			return 'viewer';
	}
}

function fromCapabilityMap(
	capabilityMap: CapabilityMap,
	compatibilityLanes: CompatibilityLaneMap
): OrganizationMemberPermissions {
	const calendar = toPermissionFlags(capabilityMap.calendar);
	const personnel = toPermissionFlags(capabilityMap.personnel);
	const training = toPermissionFlags(capabilityMap.training);
	const criticalTasks = toPermissionFlags(capabilityMap.criticalTasks);
	const onboarding = toPermissionFlags(capabilityMap.onboarding);
	const ratingScheme = toPermissionFlags(capabilityMap.ratingScheme);
	const leadersBook = toPermissionFlags(compatibilityLanes.leadersBook);

	return {
		canViewCalendar: calendar.canView,
		canEditCalendar: calendar.canEdit,
		canViewPersonnel: personnel.canView,
		canEditPersonnel: personnel.canEdit,
		canViewTraining: training.canView,
		canEditTraining: training.canEdit,
		canViewCriticalTasks: criticalTasks.canView,
		canEditCriticalTasks: criticalTasks.canEdit,
		canViewOnboarding: onboarding.canView,
		canEditOnboarding: onboarding.canEdit,
		canViewRatingScheme: ratingScheme.canView,
		canEditRatingScheme: ratingScheme.canEdit,
		canViewLeadersBook: leadersBook.canView,
		canEditLeadersBook: leadersBook.canEdit,
		// Membership management is role/override-driven, not represented by capability lanes.
		canManageMembers: false
	};
}

function normalizeCurrentPreset(preset: string): Exclude<CurrentPermissionPreset, 'owner'> {
	if (preset === 'admin' || preset === 'full-editor' || preset === 'team-leader' || preset === 'viewer') {
		return preset;
	}
	if (preset === 'custom') {
		return 'custom';
	}
	return 'full-editor';
}

function normalizeCustomPermissions(
	customPermissions?: Partial<OrganizationMemberPermissions> | null
): OrganizationMemberPermissions {
	return {
		canViewCalendar: !!customPermissions?.canViewCalendar,
		canEditCalendar: !!customPermissions?.canEditCalendar,
		canViewPersonnel: !!customPermissions?.canViewPersonnel,
		canEditPersonnel: !!customPermissions?.canEditPersonnel,
		canViewTraining: !!customPermissions?.canViewTraining,
		canEditTraining: !!customPermissions?.canEditTraining,
		canViewCriticalTasks: !!customPermissions?.canViewCriticalTasks,
		canEditCriticalTasks: !!customPermissions?.canEditCriticalTasks,
		canViewOnboarding: !!customPermissions?.canViewOnboarding,
		canEditOnboarding: !!customPermissions?.canEditOnboarding,
		canViewRatingScheme: !!customPermissions?.canViewRatingScheme,
		canEditRatingScheme: !!customPermissions?.canEditRatingScheme,
		canViewLeadersBook: !!customPermissions?.canViewLeadersBook,
		canEditLeadersBook: !!customPermissions?.canEditLeadersBook,
		canManageMembers: !!customPermissions?.canManageMembers
	};
}

function withResolvedCompatibilityPermissions(
	permissions: OrganizationMemberPermissions
): Required<OrganizationMemberPermissions> {
	const ratingScheme = resolveRatingSchemePermissions(permissions);
	return {
		...permissions,
		canViewRatingScheme: ratingScheme.canViewRatingScheme,
		canEditRatingScheme: ratingScheme.canEditRatingScheme
	};
}

function matchesPermissionPreset(
	permissions: Required<OrganizationMemberPermissions>,
	presetPermissions: OrganizationMemberPermissions
): boolean {
	const presetRatingScheme = resolveRatingSchemePermissions(presetPermissions);
	return (
		permissions.canViewCalendar === presetPermissions.canViewCalendar &&
		permissions.canEditCalendar === presetPermissions.canEditCalendar &&
		permissions.canViewPersonnel === presetPermissions.canViewPersonnel &&
		permissions.canEditPersonnel === presetPermissions.canEditPersonnel &&
		permissions.canViewTraining === presetPermissions.canViewTraining &&
		permissions.canEditTraining === presetPermissions.canEditTraining &&
		permissions.canViewCriticalTasks === presetPermissions.canViewCriticalTasks &&
		permissions.canEditCriticalTasks === presetPermissions.canEditCriticalTasks &&
		permissions.canViewOnboarding === presetPermissions.canViewOnboarding &&
		permissions.canEditOnboarding === presetPermissions.canEditOnboarding &&
		permissions.canViewRatingScheme === presetRatingScheme.canViewRatingScheme &&
		permissions.canEditRatingScheme === presetRatingScheme.canEditRatingScheme &&
		permissions.canViewLeadersBook === presetPermissions.canViewLeadersBook &&
		permissions.canEditLeadersBook === presetPermissions.canEditLeadersBook &&
		permissions.canManageMembers === presetPermissions.canManageMembers
	);
}

export const TARGET_MEMBER_PRESET_CAPABILITIES: Record<Exclude<MemberPreset, 'custom'>, CapabilityMap> = {
	viewer: VIEWER_CAPABILITY_MAP,
	operator: OPERATOR_CAPABILITY_MAP,
	editor: EDITOR_CAPABILITY_MAP
};
