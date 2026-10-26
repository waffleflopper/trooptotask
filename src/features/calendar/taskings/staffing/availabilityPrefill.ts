import { dateOnlySchema, isUuid } from '$lib/utils/inputSchemas';
import type { TaskingExecution } from '../taskingModel';
import type { TaskingPick } from './staffingModel';

/** What fits in a link; Bulk Status takes at most this many People from one. */
export const PREFILL_PEOPLE_LIMIT = 200;

/** The People and dates a Tasking hands to Bulk Status. The link is a request, never an authorization. */
export interface AvailabilityPrefill {
	taskingId: string;
	personnelIds: string[];
	startDate: string;
	endDate: string;
}

export const taskingHref = (orgUrlSegment: string, taskingId: string) =>
	`/org/${orgUrlSegment}/calendar/taskings/${taskingId}`;

/** Picks that count, among those the reader may set Availability for. */
export function availabilityTargets(picks: TaskingPick[], canSet: (groupId: string | null) => boolean): TaskingPick[] {
	return picks.filter((pick) => pick.reviewSince === null && !pick.archived && canSet(pick.groupId));
}

export function setAvailabilityHref(
	orgUrlSegment: string,
	taskingId: string,
	execution: Pick<TaskingExecution, 'startsOn' | 'endsOn'>,
	personnelIds: string[]
): string {
	const params = new URLSearchParams({
		tab: 'add',
		tasking: taskingId,
		people: personnelIds.slice(0, PREFILL_PEOPLE_LIMIT).join(','),
		from: execution.startsOn,
		to: execution.endsOn
	});
	return `/org/${orgUrlSegment}/calendar/bulk?${params}`;
}

/** Anything malformed is dropped; a prefill without a Tasking or valid dates is no prefill at all. */
export function readAvailabilityPrefill(params: URLSearchParams): AvailabilityPrefill | null {
	const taskingId = params.get('tasking');
	const startDate = dateOnlySchema.safeParse(params.get('from'));
	const endDate = dateOnlySchema.safeParse(params.get('to'));
	if (!isUuid(taskingId) || !startDate.success || !endDate.success || endDate.data < startDate.data) return null;
	const personnelIds = [...new Set((params.get('people') ?? '').split(',').filter(isUuid))].slice(
		0,
		PREFILL_PEOPLE_LIMIT
	);
	return { taskingId, personnelIds, startDate: startDate.data, endDate: endDate.data };
}
