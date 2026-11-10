import {
	ACCESS_LANE_LABELS,
	CAPABILITY_LEVEL_LABELS,
	CAPABILITY_LEVELS,
	DURABLE_FEATURE_LANES,
	type CapabilityLevel,
	type DurableFeatureLane,
	type MembershipRole,
	type StoredMemberPreset,
	TARGET_MEMBER_PRESET_CAPABILITIES
} from '$lib/access/memberAccessShape';

export type EditableMembershipRole = Exclude<MembershipRole, 'owner'>;
export type EditablePreset = StoredMemberPreset;
export type AccessLaneConfig = { id: DurableFeatureLane; label: string };
export type AccessOption = { value: EditablePreset; label: string; helper: string };
export type GovernanceRoleOption = { value: EditableMembershipRole; label: string; helper: string };

export const SETTINGS_ACCESS_OPTIONS: AccessOption[] = [
	{ value: 'editor', label: 'Editor', helper: 'Sees and changes everything, including how each area is set up.' },
	{
		value: 'operator',
		label: 'Operator',
		helper: "Sees everything and keeps it up to date day to day, but can't change how an area is set up."
	},
	{ value: 'viewer', label: 'Viewer', helper: "Sees everything but can't change anything." }
];

export const SETTINGS_GOVERNANCE_ROLE_OPTIONS: GovernanceRoleOption[] = [
	{ value: 'member', label: 'Member', helper: 'Gets what their preset allows, in the Groups you choose.' },
	{ value: 'admin', label: 'Admin', helper: 'Sees and changes everything, and manages members and unit settings.' }
];

export const SETTINGS_ACCESS_LANES: AccessLaneConfig[] = DURABLE_FEATURE_LANES.map((id) => ({
	id,
	label: ACCESS_LANE_LABELS[id]
}));

export const SETTINGS_CAPABILITY_OPTIONS: Array<{ value: CapabilityLevel; label: string }> = CAPABILITY_LEVELS.map(
	(value) => ({ value, label: CAPABILITY_LEVEL_LABELS[value] })
);

/** What a level lets someone change in an area, in the words the invite form's preset table uses. */
const CHANGE_LABELS: Record<CapabilityLevel, string> = {
	none: 'No',
	view: 'No',
	operate: 'Day to day',
	configure: 'Everything'
};

export type PresetAreaAccess = { id: DurableFeatureLane; label: string; view: boolean; change: string };

/** Each area the unit has turned on, with what the preset lets someone view and change there. */
export function presetAreaAccess(preset: EditablePreset, offLanes: readonly DurableFeatureLane[]): PresetAreaAccess[] {
	const levels = TARGET_MEMBER_PRESET_CAPABILITIES[preset];
	return SETTINGS_ACCESS_LANES.flatMap(({ id, label }) =>
		offLanes.includes(id) ? [] : [{ id, label, view: levels[id] !== 'none', change: CHANGE_LABELS[levels[id]] }]
	);
}
