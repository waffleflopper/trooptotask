import { z } from 'zod';
import { dateOnlySchema, uuidSchema } from '$lib/utils/inputSchemas';
import type { Group } from '$features/personnel/contracts';
import type { MemberLabels } from '../events/eventModel';
import type { TaskingListActivityFact, TaskingReadiness } from './taskingListsModel';
import type { TaskingRowFacts } from './taskingReadModel';

export const TASKING_TITLE_MAX = 200;
export const TASKING_QUALIFICATIONS_MAX = 1000;
export const TASKING_INSTRUCTIONS_MAX = 4000;
export const TASKING_NOTE_MAX = 1000;
export const TASKING_STAFFING_MAX = 9999;
export const DUE_SOON_DAYS = 7;

/** Exactly one Group, or the Organization itself. Organization level is always an explicit choice. */
export type TaskingResponsibility = { kind: 'group'; groupId: string } | { kind: 'organization' };

/** When selected people are committed. `reportTime` is local "HH:MM" on the first day, never a timestamp. */
export interface TaskingExecution {
	startsOn: string;
	endsOn: string;
	reportTime: string | null;
}

export interface StaffingRequirement {
	count: number;
	qualifications: string | null;
}

/** `by` is null only when the acting account no longer exists. */
export type TaskingStatus =
	| { kind: 'open' }
	| { kind: 'in_progress' }
	| { kind: 'blocked'; reason: string; at: string; by: string | null }
	| { kind: 'completed'; note: string | null; at: string; by: string | null }
	| { kind: 'cancelled'; reason: string | null; at: string; by: string | null };

export type TaskingStatusKind = TaskingStatus['kind'];

/** The linked Event's shared context, which every Calendar reader may see. */
export interface TaskingEventRef {
	id: string;
	title: string;
	startsOn: string;
	endsOn: string;
	cancelled: boolean;
}

export interface Tasking {
	id: string;
	title: string;
	event: TaskingEventRef | null;
	responsibility: TaskingResponsibility;
	/** When the outcome is due. It does not occupy anyone on that date. */
	suspenseOn: string;
	execution: TaskingExecution | null;
	requirement: StaffingRequirement | null;
	instructions: string | null;
	status: TaskingStatus;
	readiness: TaskingReadiness;
}

export interface TaskingSchedule {
	suspenseOn: string;
	execution: TaskingExecution | null;
}

/** Every pick of a Tasking, counted the same way for every reader. */
export interface StaffingCount {
	/** Picks that fill the requirement. A pick under review never does. */
	picked: number;
	needsReview: number;
	/** Picks whose person is outside the reader's roster scope, shown only as a number. */
	outsideScope: number;
}

/** People named in an Activity entry: names the reader's roster scope covers, and how many others. */
export interface NamedPeople {
	names: string[];
	others: number;
}

export type TaskingActivityFact =
	| { kind: 'created' }
	| { kind: 'outcome_changed'; from: string; to: string }
	| { kind: 'responsibility_changed'; from: TaskingResponsibility; to: TaskingResponsibility }
	| { kind: 'dates_changed'; from: TaskingSchedule; to: TaskingSchedule }
	| { kind: 'linked'; eventId: string }
	| { kind: 'unlinked'; eventId: string }
	| { kind: 'event_deleted'; eventId: string; eventTitle: string }
	| { kind: 'requirement_changed'; from: StaffingRequirement | null; to: StaffingRequirement | null }
	| { kind: 'instructions_changed' }
	| { kind: 'started' }
	/** `edited` corrects the reason of a Tasking that stays Blocked. */
	| { kind: 'blocked'; reason: string; edited?: boolean }
	| { kind: 'unblocked' }
	| { kind: 'completed'; note: string | null }
	| { kind: 'reopened' }
	| { kind: 'cancelled'; reason: string | null }
	| { kind: 'staffing_changed'; added: NamedPeople; removed: NamedPeople; kept: NamedPeople }
	| TaskingListActivityFact;

export type TaskingActivity = TaskingActivityFact & { id: number; at: string; actorUserId: string | null };

/** Groups the viewer's scope covers, by id, labelled with their path. A responsible Group missing here is outside that scope. */
export type GroupLabels = Record<string, string>;

/** What the server loads; Overdue and Blocked narrow Active on the page. */
export type TaskingListScope = 'active' | 'completed' | 'cancelled';
export const CLOSED_TASKING_LIMIT = 100;

export interface TaskingList {
	scope: TaskingListScope;
	taskings: Tasking[];
	groups: GroupLabels;
	/** The same Groups with their parents, for pickers that show the tree. */
	groupCatalog: Group[];
	/** By Tasking id; a Tasking missing here has no picks. */
	staffing: Record<string, StaffingCount>;
}

/** The Taskings under one Event that the reader's scope covers. */
export type EventTaskingList = Omit<TaskingList, 'scope' | 'groupCatalog'>;

export interface TaskingDetail {
	tasking: Tasking;
	groups: GroupLabels;
	groupCatalog: Group[];
	members: MemberLabels;
}

export interface TaskingActivityLog {
	entries: TaskingActivity[];
	/** Titles of the Events named by link and unlink entries. */
	eventTitles: Record<string, string>;
}

export interface TaskingEventOption {
	id: string;
	title: string;
	startsOn: string;
	endsOn: string;
}

/** What the create and edit form offers: the Groups in the viewer's scope and the Events still ahead. */
export interface TaskingChoices {
	groups: Group[];
	events: TaskingEventOption[];
}

export type TaskingAction = 'start' | 'block' | 'unblock' | 'complete' | 'reopen' | 'cancel';

/** Mirrors `transition_calendar_tasking`, which is the authority. */
export const TASKING_TRANSITIONS: Record<TaskingAction, { from: readonly TaskingStatusKind[]; to: TaskingStatusKind }> =
	{
		start: { from: ['open'], to: 'in_progress' },
		block: { from: ['open', 'in_progress'], to: 'blocked' },
		unblock: { from: ['blocked'], to: 'in_progress' },
		complete: { from: ['open', 'in_progress', 'blocked'], to: 'completed' },
		reopen: { from: ['completed'], to: 'in_progress' },
		cancel: { from: ['open', 'in_progress', 'blocked'], to: 'cancelled' }
	};

const ACTION_ORDER: TaskingAction[] = ['start', 'unblock', 'reopen', 'complete', 'block', 'cancel'];

export function availableActions(status: TaskingStatusKind): TaskingAction[] {
	return ACTION_ORDER.filter((action) => TASKING_TRANSITIONS[action].from.includes(status));
}

export const isActiveStatus = (status: TaskingStatusKind) =>
	status === 'open' || status === 'in_progress' || status === 'blocked';

/** Completed and Cancelled Taskings are a record; reopening a completed one is the way back to editing. */
export const isEditable = (tasking: Tasking) => isActiveStatus(tasking.status.kind);

export function addDays(dateOnly: string, days: number): string {
	const [year, month, day] = dateOnly.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export type TaskingAttention = 'overdue' | 'due_today' | 'due_soon';

/** The state and dates a Tasking row reads, whether the reader sees the whole Tasking or another scope's summary. */
export interface TaskingTimeline {
	status: Pick<TaskingStatus, 'kind'>;
	suspenseOn: string;
	execution: (Pick<TaskingExecution, 'startsOn' | 'endsOn'> & { reportTime?: string | null }) | null;
}

/** Derived from the viewer's day at read time; never stored. Only active Taskings ask for attention. */
export function taskingAttention(
	tasking: Pick<TaskingTimeline, 'status' | 'suspenseOn'>,
	today: string
): TaskingAttention | null {
	if (!isActiveStatus(tasking.status.kind)) return null;
	if (tasking.suspenseOn < today) return 'overdue';
	if (tasking.suspenseOn === today) return 'due_today';
	return tasking.suspenseOn <= addDays(today, DUE_SOON_DAYS) ? 'due_soon' : null;
}

export interface TaskingNextDate {
	label: 'Starts' | 'Due';
	on: string;
}

/** An active Tasking whose execution is still ahead of its suspense shows when it starts; anything else shows when it is due. */
export function nextTaskingDate(tasking: TaskingTimeline, today: string): TaskingNextDate {
	const startsOn = tasking.execution?.startsOn;
	if (isActiveStatus(tasking.status.kind) && startsOn && startsOn >= today && startsOn < tasking.suspenseOn)
		return { label: 'Starts', on: startsOn };
	return { label: 'Due', on: tasking.suspenseOn };
}

export type TaskingView = 'active' | 'overdue' | 'blocked' | 'needs_people' | 'completed' | 'cancelled';
export type TaskingWithin = 'any' | '7' | '14' | '30';

/** Every list filter, as it lives in the URL. */
export interface TaskingFilters {
	view: TaskingView;
	/** `all`, `standalone`, or an Event id. */
	event: string;
	/** `all`, `organization`, or a Group id. */
	responsibility: string;
	within: TaskingWithin;
	search: string;
}

export const DEFAULT_TASKING_FILTERS: TaskingFilters = {
	view: 'active',
	event: 'all',
	responsibility: 'all',
	within: 'any',
	search: ''
};

const VIEWS: readonly TaskingView[] = ['active', 'overdue', 'blocked', 'needs_people', 'completed', 'cancelled'];
const WITHIN: readonly TaskingWithin[] = ['any', '7', '14', '30'];
const PARAMS = { view: 'view', event: 'event', responsibility: 'for', within: 'within', search: 'q' } as const;

export function scopeOfView(view: TaskingView): TaskingListScope {
	return view === 'completed' || view === 'cancelled' ? view : 'active';
}

export function parseTaskingView(params: URLSearchParams): TaskingView {
	const view = params.get(PARAMS.view);
	return VIEWS.find((known) => known === view) ?? 'active';
}

export function parseTaskingFilters(params: URLSearchParams): TaskingFilters {
	const within = params.get(PARAMS.within);
	return {
		view: parseTaskingView(params),
		event: params.get(PARAMS.event) || 'all',
		responsibility: params.get(PARAMS.responsibility) || 'all',
		within: WITHIN.find((known) => known === within) ?? 'any',
		search: params.get(PARAMS.search) ?? ''
	};
}

/** The query string for these filters, leaving defaults out so the plain list has a plain URL. */
export function taskingFiltersQuery(filters: TaskingFilters): string {
	const params = new URLSearchParams();
	for (const key of Object.keys(PARAMS) as (keyof TaskingFilters)[]) {
		const value = filters[key].trim();
		if (value && value !== DEFAULT_TASKING_FILTERS[key]) params.set(PARAMS[key], value);
	}
	const query = params.toString();
	return query ? `?${query}` : '';
}

export const responsibilityKey = (responsibility: TaskingResponsibility) =>
	responsibility.kind === 'group' ? responsibility.groupId : 'organization';

/** An active Tasking with fewer counted picks than it requires. */
/** An active Tasking still short of the people it requires. */
export const needsPeople = ({ status, picked, required }: Pick<TaskingRowFacts, 'status' | 'picked' | 'required'>) =>
	isActiveStatus(status) && required !== null && picked < required;

function touchesWindow(tasking: Tasking, from: string, to: string): boolean {
	if (tasking.suspenseOn >= from && tasking.suspenseOn <= to) return true;
	return tasking.execution !== null && tasking.execution.startsOn <= to && tasking.execution.endsOn >= from;
}

/** Narrows a loaded list to the filters. Active views sort by the date each row shows; closed views keep the newest first. */
export function filterTaskings(
	taskings: Tasking[],
	filters: TaskingFilters,
	today: string,
	facts: Record<string, TaskingRowFacts> = {}
): Tasking[] {
	const search = filters.search.trim().toLocaleLowerCase();
	const windowEnd = filters.within === 'any' ? null : addDays(today, Number(filters.within) - 1);
	const shown = taskings.filter(
		(tasking) =>
			(filters.view !== 'overdue' || taskingAttention(tasking, today) === 'overdue') &&
			(filters.view !== 'blocked' || tasking.status.kind === 'blocked') &&
			(filters.view !== 'needs_people' || (tasking.id in facts && needsPeople(facts[tasking.id]))) &&
			(filters.event === 'all' ||
				(filters.event === 'standalone' ? tasking.event === null : tasking.event?.id === filters.event)) &&
			(filters.responsibility === 'all' || responsibilityKey(tasking.responsibility) === filters.responsibility) &&
			(windowEnd === null || touchesWindow(tasking, today, windowEnd)) &&
			(!search ||
				tasking.title.toLocaleLowerCase().includes(search) ||
				Boolean(tasking.event?.title.toLocaleLowerCase().includes(search)))
	);
	if (scopeOfView(filters.view) !== 'active') return shown;
	return shown
		.map((tasking) => ({ tasking, on: nextTaskingDate(tasking, today).on }))
		.sort((a, b) => a.on.localeCompare(b.on) || a.tasking.title.localeCompare(b.tasking.title))
		.map(({ tasking }) => tasking);
}

const requiredText = (label: string, max: number) =>
	z.string().trim().min(1, `Enter ${label}.`).max(max, `Keep ${label} to ${max} characters.`);

const optionalText = (label: string, max: number) =>
	z
		.string()
		.trim()
		.max(max, `Keep ${label} to ${max} characters.`)
		.nullable()
		.transform((value) => value || null);

export const taskingResponsibilitySchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('group'), groupId: uuidSchema }).strict(),
	z.object({ kind: z.literal('organization') }).strict()
]) satisfies z.ZodType<TaskingResponsibility>;

export const reportTimeSchema = z
	.string()
	.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter the time as HH:MM.')
	.nullable();

export const taskingDraftSchema = z
	.object({
		title: requiredText('the outcome', TASKING_TITLE_MAX),
		eventId: uuidSchema.nullable(),
		responsibility: taskingResponsibilitySchema,
		suspenseOn: dateOnlySchema,
		execution: z
			.object({ startsOn: dateOnlySchema, endsOn: dateOnlySchema, reportTime: reportTimeSchema })
			.strict()
			.refine((execution) => execution.endsOn >= execution.startsOn, {
				path: ['endsOn'],
				message: 'End on or after the start date.'
			})
			.nullable(),
		requirement: z
			.object({
				count: z
					.number({ error: 'Enter how many people.' })
					.int('Enter a whole number.')
					.min(1, 'Enter at least 1.')
					.max(TASKING_STAFFING_MAX, `Keep it to ${TASKING_STAFFING_MAX}.`),
				qualifications: optionalText('the qualifications', TASKING_QUALIFICATIONS_MAX)
			})
			.strict()
			.nullable(),
		instructions: optionalText('the instructions', TASKING_INSTRUCTIONS_MAX)
	})
	.strict();

export type TaskingDraft = z.output<typeof taskingDraftSchema>;

export const taskingTransitionSchema = z.discriminatedUnion('action', [
	z.object({ action: z.literal('start') }).strict(),
	z.object({ action: z.literal('block'), reason: requiredText('the reason', TASKING_NOTE_MAX) }).strict(),
	z.object({ action: z.literal('unblock') }).strict(),
	z.object({ action: z.literal('complete'), note: optionalText('the note', TASKING_NOTE_MAX) }).strict(),
	z.object({ action: z.literal('reopen') }).strict(),
	z.object({ action: z.literal('cancel'), reason: optionalText('the reason', TASKING_NOTE_MAX) }).strict()
]);

export type TaskingTransition = z.output<typeof taskingTransitionSchema>;

export const transitionNote = (transition: TaskingTransition): string | null =>
	'reason' in transition ? transition.reason : 'note' in transition ? transition.note : null;
