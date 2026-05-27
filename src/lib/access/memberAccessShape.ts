import type { OrganizationMemberPermissions } from '$lib/types';

export type MembershipRole = 'owner' | 'admin' | 'member';
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

export type CapabilityMap = Record<DurableFeatureLane, CapabilityLevel>;
export type CompatibilityLaneMap = Record<string, never>;
export type CapabilityOverrideMap = Partial<Record<DurableFeatureLane, CapabilityLevel>>;

export type ScopeSet = { kind: 'organization' } | { kind: 'groups'; groupIds: string[] };

export const DURABLE_FEATURE_LANES: DurableFeatureLane[] = [
	'calendar',
	'personnel',
	'training',
	'criticalTasks',
	'onboarding',
	'ratingScheme'
];
export const CAPABILITY_LEVELS: CapabilityLevel[] = ['none', 'view', 'operate', 'configure'];

export interface MemberAccessShape {
	membershipRole: MembershipRole;
	memberPreset: MemberPreset;
	capabilityMap: CapabilityMap;
	compatibilityLanes: CompatibilityLaneMap;
	scopeSet: ScopeSet;
	canManageMembers: boolean;
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

export interface TargetMemberAccessInput {
	membershipRole?: MembershipRole;
	memberPreset: string;
	capabilityOverrides?: CapabilityOverrideMap | null;
	scopeSet?: ScopeSet | null;
	canManageMembers?: boolean | null;
}

export interface SerializedScopeSetStorage {
	access_scope_kind: ScopeSet['kind'];
	access_scope_group_ids: string[];
}

const CAPABILITY_RANK: Record<CapabilityLevel, number> = {
	none: 0,
	view: 1,
	operate: 2,
	configure: 3
};

const EDITOR_CAPABILITY_MAP = createCapabilityMap('configure');
const OPERATOR_CAPABILITY_MAP = createCapabilityMap('operate');
const VIEWER_CAPABILITY_MAP = createCapabilityMap('view');

export function toCurrentPermissionFlags(shape: MemberAccessShape): OrganizationMemberPermissions {
	const permissions = fromCapabilityMap(shape.capabilityMap, shape.compatibilityLanes);
	return {
		...permissions,
		canManageMembers: shape.membershipRole === 'owner' || shape.membershipRole === 'admin' || shape.canManageMembers
	};
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
		compatibilityLanes: createCompatibilityLaneMap(),
		scopeSet: normalizeScopeSet(input.scopeSet),
		canManageMembers:
			input.membershipRole === 'owner' || input.membershipRole === 'admin' || input.canManageMembers === true
	};
}

export function targetMemberAccessToStorage(input: TargetMemberAccessInput): MemberAccessStorage {
	const memberPreset = normalizeStoredMemberPreset(input.memberPreset);
	const shape = resolveStoredMemberAccessShape({
		membershipRole: input.membershipRole ?? 'member',
		memberPreset,
		capabilityOverrides: input.capabilityOverrides,
		scopeSet: input.scopeSet,
		canManageMembers: input.canManageMembers
	});

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

export function createCapabilityMap(level: CapabilityLevel): CapabilityMap {
	return {
		calendar: level,
		personnel: level,
		training: level,
		criticalTasks: level,
		onboarding: level,
		ratingScheme: level
	};
}

export function createCompatibilityLaneMap(): CompatibilityLaneMap {
	return {};
}

export function capabilityMeets(actual: CapabilityLevel, required: Exclude<CapabilityLevel, 'none'>): boolean {
	return CAPABILITY_RANK[actual] >= CAPABILITY_RANK[required];
}

export function hasOrganizationWideConfigureAccess(capabilityMap: CapabilityMap, scopeSet: ScopeSet): boolean {
	return scopeSet.kind === 'organization' && DURABLE_FEATURE_LANES.every((lane) => capabilityMap[lane] === 'configure');
}

export function resolveRatingSchemePermissions(
	permissions: Pick<
		OrganizationMemberPermissions,
		'canViewPersonnel' | 'canEditPersonnel' | 'canViewRatingScheme' | 'canEditRatingScheme'
	>
): { canViewRatingScheme: boolean; canEditRatingScheme: boolean } {
	return {
		canViewRatingScheme: permissions.canViewRatingScheme ?? permissions.canViewPersonnel,
		canEditRatingScheme: permissions.canEditRatingScheme ?? permissions.canEditPersonnel
	};
}

function toPermissionFlags(level: CapabilityLevel): { canView: boolean; canEdit: boolean } {
	return {
		canView: level !== 'none',
		canEdit: level === 'configure'
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
	for (const lane of DURABLE_FEATURE_LANES) {
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

	for (const lane of DURABLE_FEATURE_LANES) {
		const level = capabilityOverrides[lane];
		if (isCapabilityLevel(level)) {
			overrides[lane] = level;
		}
	}

	return overrides;
}

export function isCapabilityLevel(value: unknown): value is CapabilityLevel {
	return CAPABILITY_LEVELS.includes(value as CapabilityLevel);
}

function normalizeScopeSet(scopeSet?: ScopeSet | null): ScopeSet {
	if (scopeSet?.kind !== 'groups') {
		return { kind: 'organization' };
	}

	const groupIds = Array.from(new Set(scopeSet.groupIds.filter(Boolean)));
	return groupIds.length > 0 ? { kind: 'groups', groupIds } : { kind: 'organization' };
}

function fromCapabilityMap(
	capabilityMap: CapabilityMap,
	compatibilityLanes: CompatibilityLaneMap
): OrganizationMemberPermissions {
	void compatibilityLanes;
	const calendar = toPermissionFlags(capabilityMap.calendar);
	const personnel = toPermissionFlags(capabilityMap.personnel);
	const training = toPermissionFlags(capabilityMap.training);
	const criticalTasks = toPermissionFlags(capabilityMap.criticalTasks);
	const onboarding = toPermissionFlags(capabilityMap.onboarding);
	const ratingScheme = toPermissionFlags(capabilityMap.ratingScheme);

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
		canManageMembers: false
	};
}

function normalizeStoredMemberPreset(preset: string): StoredMemberPreset {
	if (preset === 'viewer' || preset === 'operator' || preset === 'editor') {
		return preset;
	}
	return 'editor';
}

export const TARGET_MEMBER_PRESET_CAPABILITIES: Record<Exclude<MemberPreset, 'custom'>, CapabilityMap> = {
	viewer: VIEWER_CAPABILITY_MAP,
	operator: OPERATOR_CAPABILITY_MAP,
	editor: EDITOR_CAPABILITY_MAP
};
