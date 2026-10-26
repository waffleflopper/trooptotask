import type { BadgeVariant } from '$lib/components/ui/badge';
import { formatDayMonthYear } from '$lib/utils/dates';
import { eventDateRange } from '../../events/eventModel';
import type {
	GroupLabels,
	StaffingRequirement,
	TaskingAction,
	TaskingActivityFact,
	TaskingAttention,
	TaskingExecution,
	TaskingResponsibility,
	TaskingSchedule,
	TaskingStatusKind
} from '../taskingModel';

export const STATUS_BADGES: Record<TaskingStatusKind, { label: string; variant: BadgeVariant }> = {
	open: { label: 'Open', variant: 'outline' },
	in_progress: { label: 'In progress', variant: 'info' },
	blocked: { label: 'Blocked', variant: 'warning' },
	completed: { label: 'Completed', variant: 'success' },
	cancelled: { label: 'Cancelled', variant: 'secondary' }
};

export const ATTENTION_BADGES: Record<TaskingAttention, { label: string; variant: BadgeVariant }> = {
	overdue: { label: 'Overdue', variant: 'danger' },
	due_today: { label: 'Due today', variant: 'warning' },
	due_soon: { label: 'Due soon', variant: 'info' }
};

export const ACTION_LABELS: Record<TaskingAction, string> = {
	start: 'Start',
	block: 'Block',
	unblock: 'Unblock',
	complete: 'Complete',
	reopen: 'Reopen',
	cancel: 'Cancel tasking'
};

export const responsibilityLabel = (responsibility: TaskingResponsibility, groups: GroupLabels, orgName: string) =>
	responsibility.kind === 'organization' ? orgName : (groups[responsibility.groupId] ?? 'Another group');

export function executionLabel(execution: TaskingExecution | null): string | null {
	return execution ? eventDateRange(execution) : null;
}

export function requirementLabel(requirement: StaffingRequirement | null): string | null {
	if (!requirement) return null;
	const people = `${requirement.count} ${requirement.count === 1 ? 'person' : 'people'}`;
	return requirement.qualifications ? `${people} · ${requirement.qualifications}` : people;
}

function scheduleChanges(from: TaskingSchedule, to: TaskingSchedule): string[] {
	const changes: string[] = [];
	if (from.suspenseOn !== to.suspenseOn)
		changes.push(`the suspense from ${formatDayMonthYear(from.suspenseOn)} to ${formatDayMonthYear(to.suspenseOn)}`);
	const [fromRange, toRange] = [executionLabel(from.execution), executionLabel(to.execution)];
	if (fromRange !== toRange)
		changes.push(
			fromRange && toRange
				? `execution from ${fromRange} to ${toRange}`
				: toRange
					? `execution to ${toRange}`
					: 'execution off'
		);
	const [fromTime, toTime] = [from.execution?.reportTime ?? null, to.execution?.reportTime ?? null];
	if (fromRange && toRange && fromTime !== toTime)
		changes.push(toTime ? `the report time to ${toTime}` : 'the report time off');
	return changes;
}

/** One Activity line, with a reason or note kept apart so it reads as the actor's own words. */
export function describeActivity(
	fact: TaskingActivityFact,
	groups: GroupLabels,
	eventTitles: Record<string, string>,
	orgName: string
): { summary: string; note: string | null } {
	const eventTitle = (id: string) => eventTitles[id] ?? 'an event no longer available';
	switch (fact.kind) {
		case 'created':
			return { summary: 'Created the tasking', note: null };
		case 'outcome_changed':
			return { summary: `Changed the outcome from “${fact.from}” to “${fact.to}”`, note: null };
		case 'responsibility_changed':
			return {
				summary: `Moved responsibility from ${responsibilityLabel(fact.from, groups, orgName)} to ${responsibilityLabel(fact.to, groups, orgName)}`,
				note: null
			};
		case 'dates_changed':
			return { summary: `Changed ${scheduleChanges(fact.from, fact.to).join(' and ') || 'the dates'}`, note: null };
		case 'linked':
			return { summary: `Linked to ${eventTitle(fact.eventId)}`, note: null };
		case 'unlinked':
			return { summary: `Unlinked from ${eventTitle(fact.eventId)}`, note: null };
		case 'requirement_changed':
			return {
				summary: `Changed the requirement from ${requirementLabel(fact.from) ?? 'none'} to ${requirementLabel(fact.to) ?? 'none'}`,
				note: null
			};
		case 'instructions_changed':
			return { summary: 'Edited the instructions', note: null };
		case 'started':
			return { summary: 'Started work', note: null };
		case 'blocked':
			return { summary: 'Blocked the tasking', note: fact.reason };
		case 'unblocked':
			return { summary: 'Unblocked the tasking', note: null };
		case 'completed':
			return { summary: 'Completed the tasking', note: fact.note };
		case 'reopened':
			return { summary: 'Reopened the tasking', note: null };
		case 'cancelled':
			return { summary: 'Cancelled the tasking', note: fact.reason };
	}
}
