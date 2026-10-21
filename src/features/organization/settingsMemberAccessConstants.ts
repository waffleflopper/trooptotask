import {
	CAPABILITY_LEVELS,
	DURABLE_FEATURE_LANES,
	type CapabilityLevel,
	type DurableFeatureLane,
	type MembershipRole,
	type StoredMemberPreset
} from '$lib/access/memberAccessShape';

export type EditableMembershipRole = Exclude<MembershipRole, 'owner'>;
export type EditablePreset = StoredMemberPreset;
export type AccessLaneConfig = { id: DurableFeatureLane; label: string };
export type AccessOption = { value: EditablePreset; label: string; helper: string };
export type GovernanceRoleOption = { value: EditableMembershipRole; label: string; helper: string };

export const ACCESS_LANE_LABELS: Record<DurableFeatureLane, string> = {
	calendar: 'Calendar',
	personnel: 'Personnel',
	training: 'Training',
	criticalTasks: 'Critical Tasks',
	onboarding: 'Onboarding',
	ratingScheme: 'Rating Scheme'
};

export const SETTINGS_ACCESS_OPTIONS: AccessOption[] = [
	{ value: 'editor', label: 'Editor', helper: 'Can view and manage work in the selected areas.' },
	{ value: 'operator', label: 'Operator', helper: 'Can view work and complete daily tasks in the selected areas.' },
	{ value: 'viewer', label: 'Viewer', helper: 'Can view work in the selected areas, but cannot make changes.' }
];

export const SETTINGS_GOVERNANCE_ROLE_OPTIONS: GovernanceRoleOption[] = [
	{ value: 'member', label: 'Member', helper: 'Receives access through presets, capabilities, and group scope.' },
	{ value: 'admin', label: 'Admin', helper: 'Can manage members and organization-level settings.' }
];

export const SETTINGS_ACCESS_LANES: AccessLaneConfig[] = DURABLE_FEATURE_LANES.map((id) => ({
	id,
	label: ACCESS_LANE_LABELS[id]
}));

export const CAPABILITY_LEVEL_LABELS: Record<CapabilityLevel, string> = {
	none: 'None',
	view: 'View',
	operate: 'Update',
	configure: 'Manage'
};

export const SETTINGS_CAPABILITY_OPTIONS: Array<{ value: CapabilityLevel; label: string }> = CAPABILITY_LEVELS.map(
	(value) => ({ value, label: CAPABILITY_LEVEL_LABELS[value] })
);
