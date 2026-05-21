import {
	DURABLE_FEATURE_LANES,
	type CapabilityLevel,
	type DurableFeatureLane,
	type StoredMemberPreset
} from '$lib/access/memberAccessShape';

export type EditablePreset = StoredMemberPreset | 'admin';
export type AccessLaneConfig = { id: DurableFeatureLane; label: string };
export type AccessOption = { value: EditablePreset; label: string; helper: string };

export const ACCESS_LANE_LABELS: Record<DurableFeatureLane, string> = {
	calendar: 'Calendar',
	personnel: 'Personnel',
	training: 'Training',
	criticalTasks: 'Critical Tasks',
	onboarding: 'Onboarding',
	ratingScheme: 'Rating Scheme'
};

export const SETTINGS_ACCESS_OPTIONS: AccessOption[] = [
	{ value: 'admin', label: 'Admin', helper: 'Governance role. Can manage organization access.' },
	{ value: 'editor', label: 'Editor', helper: 'Configure feature lanes without admin governance.' },
	{ value: 'operator', label: 'Operator', helper: 'Day-to-day work across granted lanes.' },
	{ value: 'viewer', label: 'Viewer', helper: 'Read-oriented access across granted lanes.' }
];

export const SETTINGS_ACCESS_LANES: AccessLaneConfig[] = DURABLE_FEATURE_LANES.map((id) => ({
	id,
	label: ACCESS_LANE_LABELS[id]
}));

export const SETTINGS_CAPABILITY_OPTIONS: Array<{ value: CapabilityLevel; label: string }> = [
	{ value: 'none', label: 'None' },
	{ value: 'view', label: 'View' },
	{ value: 'operate', label: 'Operate' },
	{ value: 'configure', label: 'Configure' }
];
