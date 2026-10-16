import type { Component } from 'svelte';
import type { AssignmentType, StatusType } from '$features/calendar/contracts';
import DutyLegendMark from '$features/calendar/components/calendar-legend/DutyLegendMark.svelte';
import StatusLegendMark from '$features/calendar/components/calendar-legend/StatusLegendMark.svelte';
import { oneDayLabel } from '$features/calendar/utils/oneDayLabel';

/** A decorative swatch: a component and the value it draws. */
export interface LegendMark {
	readonly Mark: Component<{ value: unknown }>;
	readonly value: unknown;
}

// The only place a mark's value type meets its renderer, as dayTrack does for lanes.
export function legendMark<T>(Mark: Component<{ value: T }>, value: T): LegendMark {
	return { Mark: Mark as Component<{ value: unknown }>, value };
}

export interface LegendEntry {
	readonly key: string;
	/** The entry's visible text. */
	readonly label: string;
	readonly mark: LegendMark;
}

/** One kind of thing the calendar draws, explained. A source with no entries renders nothing. */
export interface LegendSource {
	readonly key: string;
	/** Names the source's list for assistive technology. */
	readonly label: string;
	readonly entries: readonly LegendEntry[];
	/** A gesture this source enables, shown at the end of the legend. */
	readonly hint?: string;
}

export const DRAG_TO_ADD_HINT = 'Drag across days to add';

/** Status types in their stored order, each marked with the one-day bar the grid draws for it. */
export function statusLegend(statusTypes: readonly StatusType[], hint?: string): LegendSource {
	return {
		key: 'statuses',
		label: 'Statuses',
		hint,
		entries: statusTypes.map((status) => ({
			key: status.id,
			label: status.name,
			mark: legendMark(StatusLegendMark, { status, text: oneDayLabel(status) })
		}))
	};
}

/** One "Duty (SD, CQ)" entry for the types that draw row markers; none when no such type exists. */
export function dutyMarkerLegend(assignmentTypes: readonly AssignmentType[]): LegendSource {
	const types = assignmentTypes
		.filter((type) => type.assignTo === 'personnel' && !type.archivedAt)
		.sort((a, b) => a.sortOrder - b.sortOrder);
	const [first] = types;
	return {
		key: 'duty-markers',
		label: 'Duty markers',
		entries: first
			? [
					{
						key: 'duty',
						label: `Duty (${types.map((type) => type.shortName).join(', ')})`,
						mark: legendMark(DutyLegendMark, { code: first.shortName, color: first.color })
					}
				]
			: []
	};
}
