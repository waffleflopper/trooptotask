import type { Component } from 'svelte';
import type { AssignmentType, StatusType } from '$features/calendar/contracts';
import DutyLegendMark from '$features/calendar/components/calendar-legend/DutyLegendMark.svelte';
import ProjectionLegendMark, {
	type ProjectionLegendKind
} from '$features/calendar/components/calendar-legend/ProjectionLegendMark.svelte';
import StatusLegendMark from '$features/calendar/components/calendar-legend/StatusLegendMark.svelte';
import { drawsDutyMarker } from '$features/calendar/utils/calendarRenderState';
import { oneDayLabel } from '$lib/components/patterns/calendar-bars';

export interface LegendMark {
	readonly Mark: Component<{ value: unknown }>;
	readonly value: unknown;
}

export function legendMark<T>(Mark: Component<{ value: T }>, value: T): LegendMark {
	return { Mark: Mark as Component<{ value: unknown }>, value };
}

export interface LegendEntry {
	readonly key: string;
	readonly label: string;
	readonly mark: LegendMark;
}

export interface LegendSource {
	readonly key: string;
	readonly ariaLabel: string;
	readonly entries: readonly LegendEntry[];
	readonly hint?: string;
}

export const DRAG_TO_ADD_HINT = 'Drag across days to add';

export function statusLegend(statusTypes: readonly StatusType[], hint?: string): LegendSource {
	return {
		key: 'statuses',
		ariaLabel: 'Statuses',
		hint,
		entries: statusTypes.map((status) => ({
			key: status.id,
			label: status.name,
			mark: legendMark(StatusLegendMark, { status, text: oneDayLabel(status) })
		}))
	};
}

export function dutyMarkerLegend(assignmentTypes: readonly AssignmentType[]): LegendSource {
	const types = assignmentTypes.filter(drawsDutyMarker).sort((a, b) => a.sortOrder - b.sortOrder);
	const sample = types.find((type) => !type.archivedAt) ?? types[0];
	return {
		key: 'duty-markers',
		ariaLabel: 'Duty markers',
		entries: sample
			? [
					{
						key: 'duty',
						label: `Duty (${types.map((type) => type.shortName).join(', ')})`,
						mark: legendMark(DutyLegendMark, { code: sample.shortName, color: sample.color })
					}
				]
			: []
	};
}

export function eventsLegend(): LegendSource {
	const entry = (kind: ProjectionLegendKind, label: string): LegendEntry => ({
		key: kind,
		label,
		mark: legendMark(ProjectionLegendMark, kind)
	});
	return {
		key: 'events',
		ariaLabel: 'Events and Taskings',
		entries: [entry('event', 'Event'), entry('suspense', 'Suspense'), entry('commitment', 'Tasking commitment')]
	};
}
