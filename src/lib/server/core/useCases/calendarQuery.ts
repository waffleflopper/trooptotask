/**
 * Calendar page query — fetches all data needed to render the calendar for a date range.
 *
 * `fetchCalendarData(ctx, { rangeStart, rangeEnd })` returns availability entries,
 * special days, assignment types, daily assignments, and pinned groups for the given
 * ISO-string date window. All collections are group-scoped if the caller has a
 * `scopedGroupId` on their AuthContext.
 *
 * For onboarding-specific calendar data, see `onboardingCalendarQuery.ts`.
 */
import type { QueryPorts } from '$lib/server/core/ports';
import type { AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment, Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import { PinnedGroupsEntity } from '$lib/server/entities/pinnedGroups';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { GroupEntity } from '$lib/server/entities/group';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { listDutyEventsInRange } from '$lib/server/core/useCases/dutyEventCrud';
import { withCalendarTiming } from '$lib/server/utils/calendarTiming';

export interface CalendarDateRange {
	rangeStart: string;
	rangeEnd: string;
}

export type CalendarQueryInput = CalendarDateRange;

export interface CalendarBootstrapQueryInput extends CalendarQueryInput {
	specialDaysRange?: CalendarDateRange;
}

export interface CalendarData {
	availabilityEntries: AvailabilityEntry[];
	specialDays: SpecialDay[];
	assignmentTypes: AssignmentType[];
	dailyAssignments: DailyAssignment[];
	pinnedGroups: string[];
	advancedDutyEvents: DutyEvent[];
}

export interface CalendarRangeData {
	rangeStart: string;
	rangeEnd: string;
	availabilityEntries: AvailabilityEntry[];
	specialDays: SpecialDay[];
	dailyAssignments: DailyAssignment[];
	advancedDutyEvents: DutyEvent[];
}

export interface CalendarBootstrap {
	rangeStart: string;
	rangeEnd: string;
	availabilityEntries: AvailabilityEntry[] | Promise<AvailabilityEntry[]>;
	specialDays: SpecialDay[] | Promise<SpecialDay[]>;
	assignmentTypes: AssignmentType[];
	dailyAssignments: DailyAssignment[] | Promise<DailyAssignment[]>;
	pinnedGroups: string[];
	advancedDutyEvents: DutyEvent[];
	personnel: Personnel[];
	groups: Group[];
	statusTypes: StatusType[];
	activeOnboardingPersonnelIds: string[];
	/** Org-configured loss warning window in days (default: 180). */
	lossWarningWindowDays: number;
}

export async function fetchCalendarData(ctx: QueryPorts, input: CalendarQueryInput): Promise<CalendarData> {
	ctx.auth.requireView('calendar');

	const orgId = ctx.auth.orgId;
	const { rangeStart, rangeEnd } = input;

	const [
		availabilityRows,
		specialDayRows,
		assignmentTypeRows,
		dailyAssignmentRows,
		pinnedGroupRows,
		advancedDutyEvents
	] = await Promise.all([
		// Availability uses two-column overlap: end_date >= rangeStart AND start_date <= rangeEnd
		ctx.store.findMany<Record<string, unknown>>('availability_entries', orgId, undefined, {
			select: AvailabilityEntryEntity.select,
			rangeFilters: [
				{ column: 'end_date', op: 'gte', value: rangeStart },
				{ column: 'start_date', op: 'lte', value: rangeEnd }
			]
		}),
		// Special days: single-column date range
		ctx.store.findMany<Record<string, unknown>>('special_days', orgId, undefined, {
			rangeFilters: [
				{ column: 'date', op: 'gte', value: rangeStart },
				{ column: 'date', op: 'lte', value: rangeEnd }
			],
			orderBy: [{ column: 'date', ascending: true }]
		}),
		// Assignment types: no date filtering
		ctx.store.findMany<Record<string, unknown>>('assignment_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		// Daily assignments: single-column date range
		ctx.store.findMany<Record<string, unknown>>('daily_assignments', orgId, undefined, {
			rangeFilters: [
				{ column: 'date', op: 'gte', value: rangeStart },
				{ column: 'date', op: 'lte', value: rangeEnd }
			]
		}),
		// Pinned groups: filtered by userId
		ctx.auth.userId
			? ctx.store.findMany<Record<string, unknown>>(
					'user_pinned_groups',
					orgId,
					{ user_id: ctx.auth.userId },
					{
						orderBy: [{ column: 'sort_order', ascending: true }]
					}
				)
			: Promise.resolve([]),
		// Advanced duty events: filtered by event_date window
		listDutyEventsInRange(ctx, { rangeStart, rangeEnd })
	]);

	return {
		availabilityEntries: AvailabilityEntryEntity.fromDbArray(availabilityRows),
		specialDays: SpecialDayEntity.fromDbArray(specialDayRows),
		assignmentTypes: AssignmentTypeEntity.fromDbArray(assignmentTypeRows),
		dailyAssignments: DailyAssignmentEntity.fromDbArray(dailyAssignmentRows),
		pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows),
		advancedDutyEvents
	};
}

export async function fetchCalendarRangeData(ctx: QueryPorts, input: CalendarQueryInput): Promise<CalendarRangeData> {
	ctx.auth.requireView('calendar');

	const orgId = ctx.auth.orgId;
	const { rangeStart, rangeEnd } = input;

	return withCalendarTiming(orgId, 'date-ranged-query', async () => {
		const [availabilityRows, specialDayRows, dailyAssignmentRows, advancedDutyEvents] = await Promise.all([
			ctx.store.findMany<Record<string, unknown>>('availability_entries', orgId, undefined, {
				select: AvailabilityEntryEntity.select,
				rangeFilters: [
					{ column: 'end_date', op: 'gte', value: rangeStart },
					{ column: 'start_date', op: 'lte', value: rangeEnd }
				]
			}),
			ctx.store.findMany<Record<string, unknown>>('special_days', orgId, undefined, {
				rangeFilters: [
					{ column: 'date', op: 'gte', value: rangeStart },
					{ column: 'date', op: 'lte', value: rangeEnd }
				],
				orderBy: [{ column: 'date', ascending: true }]
			}),
			ctx.store.findMany<Record<string, unknown>>('daily_assignments', orgId, undefined, {
				rangeFilters: [
					{ column: 'date', op: 'gte', value: rangeStart },
					{ column: 'date', op: 'lte', value: rangeEnd }
				]
			}),
			withCalendarTiming(orgId, 'duty-event-hydration', () => listDutyEventsInRange(ctx, { rangeStart, rangeEnd }))
		]);

		return {
			rangeStart,
			rangeEnd,
			availabilityEntries: AvailabilityEntryEntity.fromDbArray(availabilityRows),
			specialDays: SpecialDayEntity.fromDbArray(specialDayRows),
			dailyAssignments: DailyAssignmentEntity.fromDbArray(dailyAssignmentRows),
			advancedDutyEvents
		};
	});
}

export async function fetchCalendarBootstrap(
	ctx: QueryPorts,
	input: CalendarBootstrapQueryInput
): Promise<Omit<CalendarBootstrap, 'activeOnboardingPersonnelIds'>> {
	ctx.auth.requireView('calendar');

	const orgId = ctx.auth.orgId;
	const { rangeStart, rangeEnd } = input;
	const specialDaysRange = input.specialDaysRange ?? input;
	const availabilityEntries = ctx.store
		.findMany<Record<string, unknown>>('availability_entries', orgId, undefined, {
			select: AvailabilityEntryEntity.select,
			rangeFilters: [
				{ column: 'end_date', op: 'gte', value: rangeStart },
				{ column: 'start_date', op: 'lte', value: rangeEnd }
			]
		})
		.then((rows) => AvailabilityEntryEntity.fromDbArray(rows));
	const specialDays = ctx.store
		.findMany<Record<string, unknown>>('special_days', orgId, undefined, {
			rangeFilters: [
				{ column: 'date', op: 'gte', value: specialDaysRange.rangeStart },
				{ column: 'date', op: 'lte', value: specialDaysRange.rangeEnd }
			],
			orderBy: [{ column: 'date', ascending: true }]
		})
		.then((rows) => SpecialDayEntity.fromDbArray(rows));
	const dailyAssignments = ctx.store
		.findMany<Record<string, unknown>>('daily_assignments', orgId, undefined, {
			rangeFilters: [
				{ column: 'date', op: 'gte', value: rangeStart },
				{ column: 'date', op: 'lte', value: rangeEnd }
			]
		})
		.then((rows) => DailyAssignmentEntity.fromDbArray(rows));

	const [
		assignmentTypeRows,
		pinnedGroupRows,
		advancedDutyEvents,
		personnelRows,
		groupRows,
		statusTypeRows,
		orgSettingsRow
	] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('assignment_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.auth.userId
			? ctx.store.findMany<Record<string, unknown>>(
					'user_pinned_groups',
					orgId,
					{ user_id: ctx.auth.userId },
					{
						orderBy: [{ column: 'sort_order', ascending: true }]
					}
				)
			: Promise.resolve([]),
		withCalendarTiming(orgId, 'duty-event-hydration', () => listDutyEventsInRange(ctx, { rangeStart, rangeEnd })),
		ctx.store.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
			select: PersonnelEntity.select,
			isNull: { archived_at: true },
			orderBy: [{ column: 'last_name', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store
			.findOne<{ loss_warning_window_days: number | null }>('organizations', orgId, {}, 'loss_warning_window_days')
			.catch(() => null)
	]);

	const lossWarningWindowDays = orgSettingsRow?.loss_warning_window_days ?? 180;

	return {
		rangeStart,
		rangeEnd,
		availabilityEntries,
		specialDays,
		assignmentTypes: AssignmentTypeEntity.fromDbArray(assignmentTypeRows),
		dailyAssignments,
		pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows),
		advancedDutyEvents,
		personnel: PersonnelEntity.fromDbArray(personnelRows),
		groups: GroupEntity.fromDbArray(groupRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		lossWarningWindowDays
	};
}
