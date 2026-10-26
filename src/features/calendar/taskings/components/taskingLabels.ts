import type { BadgeVariant } from '$lib/components/ui/badge';
import { formatDayMonthYear } from '$lib/utils/dates';
import { eventDateRange } from '../../events/eventModel';
import type { EquipmentReadiness, ChecklistProgress } from '../taskingListsModel';
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
import type { NamedPeople } from '../staffing/staffingModel';
import type { FactTone } from '../taskingRowModel';

export const TONE_TEXT: Record<FactTone, string> = {
	danger: 'text-danger-foreground',
	warning: 'text-accent-text',
	success: 'text-success-foreground',
	plain: 'text-foreground',
	muted: 'text-muted-foreground'
};

export const STATUS_BADGES: Record<TaskingStatusKind, { label: string; variant: BadgeVariant }> = {
	open: { label: 'Open', variant: 'outline' },
	in_progress: { label: 'In progress', variant: 'info' },
	blocked: { label: 'Blocked', variant: 'danger' },
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

function peopleList({ names, others }: NamedPeople): string | null {
	const parts = others > 0 ? [...names, `${others} other ${others === 1 ? 'person' : 'people'}`] : names;
	if (parts.length === 0) return null;
	return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join('; ')} and ${parts.at(-1)}`;
}

function staffingChanges(fact: Extract<TaskingActivityFact, { kind: 'staffing_changed' }>): string {
	const [added, removed, kept] = [peopleList(fact.added), peopleList(fact.removed), peopleList(fact.kept)];
	const changes = [added && `Picked ${added}`, removed && `Removed ${removed}`, kept && `Kept ${kept} after review`];
	return changes.filter(Boolean).join('. ') || 'Changed who is picked';
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
		case 'staffing_changed':
			return { summary: staffingChanges(fact), note: null };
		case 'equipment_added':
			return { summary: `Added equipment ${fact.quantity} × ${fact.name}`, note: null };
		case 'equipment_removed':
			return { summary: `Removed equipment ${fact.quantity} × ${fact.name}`, note: null };
		case 'equipment_changed':
			return {
				summary: `Changed equipment ${fact.from.quantity} × ${fact.from.name} to ${fact.to.quantity} × ${fact.to.name}`,
				note: null
			};
		case 'equipment_returned':
			return { summary: `Returned ${fact.to} of ${fact.quantity} ${fact.name} (was ${fact.from})`, note: null };
		case 'equipment_secured':
			return { summary: `Secured ${fact.to} of ${fact.quantity} ${fact.name} (was ${fact.from})`, note: null };
		case 'checklist_added':
			return { summary: `Added checklist item “${fact.label}”`, note: null };
		case 'checklist_removed':
			return { summary: `Removed checklist item “${fact.label}”`, note: null };
		case 'checklist_renamed':
			return { summary: `Renamed checklist item “${fact.from}” to “${fact.to}”`, note: null };
		case 'checklist_completed':
			return { summary: `Completed checklist item “${fact.label}”`, note: null };
		case 'checklist_reopened':
			return { summary: `Reopened checklist item “${fact.label}”`, note: null };
	}
}

export function equipmentSummary({ total, ready, partial }: EquipmentReadiness): string {
	return `${ready} of ${total} ready${partial > 0 ? ` · ${partial} partial` : ''}`;
}

export const checklistSummary = ({ total, done }: ChecklistProgress) => `${done} of ${total} done`;
