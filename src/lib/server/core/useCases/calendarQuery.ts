/**
 * Calendar page query — fetches all data needed to render the calendar for a date range.
 *
 * `fetchCalendarData(ctx, { rangeStart, rangeEnd })` returns availability entries,
 * special days, assignment types, daily assignments, and pinned groups for the given
 * ISO-string date window. Scoped collections are filtered from the caller's Scope Set.
 */
import type { QueryPorts } from '$lib/server/core/ports';
import type { AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment, Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import { PinnedGroupsEntity } from '$lib/server/entities/pinnedGroups';
import { GroupEntity } from '$lib/server/entities/group';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { withCalendarTiming } from '$lib/server/utils/calendarTiming';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy';
import {
	filterRowsByCalendarAssigneeScope,
	groupInFilter,
	personnelInFilter,
	requirePersonnelCalendarRoster,
	resolveCalendarAssigneeScope
} from './calendarScope';

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
}

export interface CalendarRangeData {
	rangeStart: string;
	rangeEnd: string;
	availabilityEntries: AvailabilityEntry[];
	specialDays: SpecialDay[];
	dailyAssignments: DailyAssignment[];
}

export interface CalendarBootstrap {
	rangeStart: string;
	rangeEnd: string;
	availabilityEntries: AvailabilityEntry[] | Promise<AvailabilityEntry[]>;
	specialDays: SpecialDay[] | Promise<SpecialDay[]>;
	assignmentTypes: AssignmentType[];
	dailyAssignments: DailyAssignment[] | Promise<DailyAssignment[]>;
	pinnedGroups: string[];
	personnel: Personnel[];
	groups: Group[];
	statusTypes: StatusType[];
	activeOnboardingPersonnelIds: string[];
	/** Org-configured loss warning window in days (default: 180). */
	lossWarningWindowDays: number;
}

export async function getActiveOnboardingPersonnelIds(ctx: QueryPorts): Promise<string[]> {
	const rows = await ctx.store.findMany<{ personnel_id: string }>('personnel_onboardings', ctx.auth.orgId, {
		status: 'in_progress'
	});

	return [...new Set(rows.map((row) => row.personnel_id))];
}

export async function fetchCalendarData(ctx: QueryPorts, input: CalendarQueryInput): Promise<CalendarData> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);

	const orgId = ctx.auth.orgId;
	const { rangeStart, rangeEnd } = input;
	const calendarScope = await resolveCalendarAssigneeScope(ctx);

	const [availabilityRows, specialDayRows, assignmentTypeRows, dailyAssignmentRows, pinnedGroupRows] =
		await Promise.all([
			// Availability uses two-column overlap: end_date >= rangeStart AND start_date <= rangeEnd
			ctx.store.findMany<Record<string, unknown>>('availability_entries', orgId, undefined, {
				select: AvailabilityEntryEntity.select,
				...personnelInFilter(calendarScope, 'personnel_id'),
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
			ctx.store.findMany<Record<string, unknown>>(
				'user_pinned_groups',
				orgId,
				{ user_id: ctx.auth.userId },
				{
					orderBy: [{ column: 'sort_order', ascending: true }]
				}
			)
		]);

	return {
		availabilityEntries: AvailabilityEntryEntity.fromDbArray(availabilityRows),
		specialDays: SpecialDayEntity.fromDbArray(specialDayRows),
		assignmentTypes: AssignmentTypeEntity.fromDbArray(assignmentTypeRows),
		dailyAssignments: DailyAssignmentEntity.fromDbArray(
			filterRowsByCalendarAssigneeScope(dailyAssignmentRows, calendarScope)
		),
		pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows)
	};
}

export async function fetchCalendarRangeData(ctx: QueryPorts, input: CalendarQueryInput): Promise<CalendarRangeData> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);

	const orgId = ctx.auth.orgId;
	const { rangeStart, rangeEnd } = input;
	const calendarScope = await resolveCalendarAssigneeScope(ctx);

	return withCalendarTiming(orgId, 'date-ranged-query', async () => {
		const [availabilityRows, specialDayRows, dailyAssignmentRows] = await Promise.all([
			ctx.store.findMany<Record<string, unknown>>('availability_entries', orgId, undefined, {
				select: AvailabilityEntryEntity.select,
				...personnelInFilter(calendarScope, 'personnel_id'),
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
			})
		]);

		return {
			rangeStart,
			rangeEnd,
			availabilityEntries: AvailabilityEntryEntity.fromDbArray(availabilityRows),
			specialDays: SpecialDayEntity.fromDbArray(specialDayRows),
			dailyAssignments: DailyAssignmentEntity.fromDbArray(
				filterRowsByCalendarAssigneeScope(dailyAssignmentRows, calendarScope)
			)
		};
	});
}

export async function fetchCalendarBootstrap(
	ctx: QueryPorts,
	input: CalendarBootstrapQueryInput
): Promise<Omit<CalendarBootstrap, 'activeOnboardingPersonnelIds'>> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);

	const orgId = ctx.auth.orgId;
	const { rangeStart, rangeEnd } = input;
	const specialDaysRange = input.specialDaysRange ?? input;
	const calendarScope = await resolveCalendarAssigneeScope(ctx);
	const availabilityEntries = ctx.store
		.findMany<Record<string, unknown>>('availability_entries', orgId, undefined, {
			select: AvailabilityEntryEntity.select,
			...personnelInFilter(calendarScope, 'personnel_id'),
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
		.then((rows) => DailyAssignmentEntity.fromDbArray(filterRowsByCalendarAssigneeScope(rows, calendarScope)));

	const [assignmentTypeRows, pinnedGroupRows, personnel, groupRows, statusTypeRows, orgSettingsRow] = await Promise.all(
		[
			ctx.store.findMany<Record<string, unknown>>('assignment_types', orgId, undefined, {
				orderBy: [{ column: 'sort_order', ascending: true }]
			}),
			ctx.store.findMany<Record<string, unknown>>(
				'user_pinned_groups',
				orgId,
				{ user_id: ctx.auth.userId },
				{
					orderBy: [{ column: 'sort_order', ascending: true }]
				}
			),
			requirePersonnelCalendarRoster(ctx).listActive(ctx.auth),
			ctx.store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
				...groupInFilter(calendarScope, 'id'),
				orderBy: [{ column: 'sort_order', ascending: true }]
			}),
			ctx.store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
				select: StatusTypeEntity.select,
				orderBy: [{ column: 'sort_order', ascending: true }]
			}),
			ctx.store
				.findOne<{ loss_warning_window_days: number | null }>('organizations', orgId, {}, 'loss_warning_window_days')
				.catch(() => null)
		]
	);

	const lossWarningWindowDays = orgSettingsRow?.loss_warning_window_days ?? 180;

	return {
		rangeStart,
		rangeEnd,
		availabilityEntries,
		specialDays,
		assignmentTypes: AssignmentTypeEntity.fromDbArray(assignmentTypeRows),
		dailyAssignments,
		pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows),
		personnel,
		groups: GroupEntity.fromDbArray(groupRows),
		statusTypes: StatusTypeEntity.fromDbArray(statusTypeRows),
		lossWarningWindowDays
	};
}
