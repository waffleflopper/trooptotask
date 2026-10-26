import type { TaskingAttentionRow } from '$features/calendar';
import { formatDayMonth, formatDayOffset } from '$lib/utils/dates';
import { toDayNumber } from '$lib/utils/dayNumber';
import type { DashboardInputs } from './dashboardInputs';
import type { NeedsYouLoad, NeedsYouSource } from './dashboardSections';
import type { NeedsYouItem } from './needsYou';
import { pickPeopleAction } from './needsYouActions';
import { orgPath, plural } from './needsYouSources';

function daysBetween(from: string, to: string): number {
	return toDayNumber(to) - toDayNumber(from);
}

function facts(inputs: DashboardInputs, row: TaskingAttentionRow): string[] {
	const group = row.responsibility.kind === 'group' ? row.responsibility.groupId : null;
	return [
		group === null
			? inputs.page.orgName
			: (inputs.groups.find((candidate) => candidate.id === group)?.name ?? 'A Group'),
		...(row.eventTitle ? [row.eventTitle] : []),
		...(row.required === null ? [] : [`${row.picked} of ${row.required} picked`]),
		...(row.equipmentNotReady > 0
			? [`${plural(row.equipmentNotReady, 'equipment item', 'equipment items')} not ready`]
			: [])
	];
}

function toItem(inputs: DashboardInputs, row: TaskingAttentionRow): NeedsYouItem {
	const base = {
		id: `tasking:${row.taskingId}`,
		taskingId: row.taskingId,
		title: row.title,
		href: `${orgPath(inputs)}/calendar/taskings/${row.taskingId}`,
		action: null
	};
	const subtitle = (...lead: string[]) => [...lead, ...facts(inputs, row)].join(' · ');
	const due = `due ${formatDayOffset(daysBetween(inputs.today, row.suspenseOn))}`;
	switch (row.kind) {
		case 'overdue': {
			const daysLate = daysBetween(row.suspenseOn, inputs.today);
			return {
				...base,
				kind: 'taskingOverdue',
				subtitle: subtitle(`Due ${formatDayMonth(row.suspenseOn)}`),
				timing: `${plural(daysLate, 'day', 'days')} late`,
				urgency: { daysLate }
			};
		}
		case 'blocked':
			return {
				...base,
				kind: 'taskingBlocked',
				subtitle: subtitle(`Due ${formatDayMonth(row.suspenseOn)}`),
				timing: due,
				urgency: { date: row.suspenseOn }
			};
		case 'short': {
			const startsOn = row.executionStartsOn ?? row.suspenseOn;
			const away = daysBetween(inputs.today, startsOn);
			return {
				...base,
				kind: 'taskingShort',
				subtitle: subtitle(),
				timing: away < 0 ? 'underway' : `starts ${formatDayOffset(away)}`,
				action: pickPeopleAction(inputs, row),
				urgency: { date: startsOn }
			};
		}
		case 'conflict':
			return {
				...base,
				id: `tasking:${row.taskingId}:conflict:${row.conflict.personnelId}`,
				kind: 'taskingConflict',
				title: `${row.conflict.personLabel} is on ${row.conflict.statusLabel.toLowerCase()} from ${formatDayMonth(row.conflict.startsOn)}`,
				subtitle: `Committed to ${row.title}`,
				timing: formatDayOffset(daysBetween(inputs.today, row.conflict.startsOn)),
				urgency: { date: row.conflict.startsOn }
			};
	}
}

/** The Tasking source's rows; its pending and failed states belong to the queue, not to this list. */
export const taskingAttention: NeedsYouSource = (inputs) =>
	inputs.page.taskings.status === 'ready' ? inputs.page.taskings.attention.rows.map((row) => toItem(inputs, row)) : [];

export function taskingAttentionLoad(inputs: DashboardInputs): NeedsYouLoad | null {
	const { taskings } = inputs.page;
	const retry: NeedsYouLoad['retry'] = (updates) => updates.retryTaskings();
	if (taskings.status === 'pending' || taskings.status === 'failed') {
		return { label: 'Tasking', state: taskings.status, retry };
	}
	if (taskings.status !== 'ready') return null;
	const unlisted = taskings.attention.total - taskings.attention.rows.length;
	return unlisted > 0
		? { label: 'Tasking', state: 'partial', unlisted, href: `${orgPath(inputs)}/calendar/taskings`, retry }
		: null;
}
