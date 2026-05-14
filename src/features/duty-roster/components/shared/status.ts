import type { BadgeVariant } from '$lib/components/ui/badge/index.js';

export type DutyRosterStatus =
	| 'active'
	| 'archived'
	| 'draft-preview'
	| 'official'
	| 'applied'
	| 'needs-sync'
	| 'invalidated'
	| 'latest'
	| 'correction-pending'
	| 'accepted'
	| 'manual'
	| 'review'
	| 'ok'
	| 'unresolved'
	| 'override'
	| 'locked';

export type DutyRosterStatusBadgeConfig = {
	label: string;
	ariaLabel: string;
	variant: BadgeVariant;
};

const STATUS_CONFIG: Record<DutyRosterStatus, DutyRosterStatusBadgeConfig> = {
	active: { label: 'Active', ariaLabel: 'Duty roster status: Active', variant: 'success' },
	archived: { label: 'Archived', ariaLabel: 'Duty roster status: Archived', variant: 'secondary' },
	'draft-preview': {
		label: 'Draft Preview',
		ariaLabel: 'Duty roster status: Draft preview',
		variant: 'warning'
	},
	official: { label: 'Official', ariaLabel: 'Duty roster status: Official', variant: 'success' },
	applied: { label: 'Applied', ariaLabel: 'Duty roster status: Applied to calendar', variant: 'success' },
	'needs-sync': {
		label: 'Needs Sync',
		ariaLabel: 'Duty roster status: Needs calendar sync',
		variant: 'warning'
	},
	invalidated: { label: 'Invalidated', ariaLabel: 'Duty roster status: Invalidated', variant: 'danger' },
	latest: { label: 'Latest', ariaLabel: 'Duty roster status: Latest accepted run', variant: 'default' },
	'correction-pending': {
		label: 'Correction Pending',
		ariaLabel: 'Duty roster status: Correction pending',
		variant: 'warning'
	},
	accepted: { label: 'Accepted', ariaLabel: 'Duty roster status: Accepted', variant: 'success' },
	manual: { label: 'Manual', ariaLabel: 'Duty roster status: Manual change', variant: 'warning' },
	review: { label: 'Review', ariaLabel: 'Duty roster status: Requires review', variant: 'warning' },
	ok: { label: 'OK', ariaLabel: 'Duty roster status: OK', variant: 'success' },
	unresolved: { label: 'Unresolved', ariaLabel: 'Duty roster status: Unresolved', variant: 'danger' },
	override: { label: 'Override', ariaLabel: 'Duty roster status: Manual override', variant: 'warning' },
	locked: { label: 'Locked', ariaLabel: 'Duty roster status: Locked', variant: 'secondary' }
};

export function getDutyRosterStatusBadge(status: DutyRosterStatus): DutyRosterStatusBadgeConfig {
	return STATUS_CONFIG[status];
}
