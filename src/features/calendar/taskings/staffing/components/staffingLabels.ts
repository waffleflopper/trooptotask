import { eventDateRange } from '../../../events/eventModel';
import type { GroupLabels } from '../../taskingModel';
import type { PickReview, StaffingAdvisory } from '../staffingModel';

export function advisoryLabel(advisory: StaffingAdvisory): string {
	switch (advisory.kind) {
		case 'availability':
			return `${advisory.label} · ${eventDateRange(advisory)}`;
		case 'tasking':
			return `${advisory.title} · ${eventDateRange(advisory)}`;
		case 'committed_elsewhere':
			return 'Committed elsewhere';
	}
}

export function reviewLabel(review: PickReview, groupId: string | null, groups: GroupLabels): string {
	switch (review) {
		case 'archived':
			return 'Archived';
		case 'left_group':
			return groupId === null ? 'No longer in a Group' : `Moved to ${groups[groupId] ?? 'another Group'}`;
		case 'eligible_again':
			return 'Eligible again';
	}
}

export const groupLabel = (groupId: string | null, groups: GroupLabels) =>
	groupId === null ? 'Unassigned' : (groups[groupId] ?? 'Another group');

export function availabilityGapLabel(uncovered: number, total: number): string {
	if (uncovered === 0) return 'Availability covers every execution day for everyone picked.';
	return `${uncovered} of ${total} picked ${total === 1 ? 'person has' : 'people have'} no Availability covering every execution day.`;
}
