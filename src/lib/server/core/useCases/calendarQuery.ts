/**
 * Calendar page query — fetches all data needed to render the calendar for a date range.
 *
 * `fetchCalendarData(ctx, { rangeStart, rangeEnd })` returns availability entries,
 * special days, assignment types, daily assignments, and pinned groups for the given
 * ISO-string date window. Scoped collections are filtered from the caller's Scope Set.
 */
import type { QueryPorts } from '$lib/server/core/ports';
import type { AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment, Personnel, StatusType } from '$lib/types';
import type { Group } from '$features/personnel/contracts';
import type { CalendarRangeData } from '$features/calendar/calendar.types';
export type { CalendarRangeData } from '$features/calendar/calendar.types';
import { listAvailabilityEntries, listSpecialDaysInRange, listStatusTypes } from '$features/calendar/index.server';
import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import { DailyAssignmentEntity } from '$lib/server/entities/dailyAssignment';
import { listGroupCatalog, listPinnedGroupNames } from '$features/personnel/index.server';
import { withCalendarTiming } from '$lib/server/utils/calendarTiming';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy';
import {
	filterRowsByCalendarAssigneeScope,
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
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);
	if (!ctx.onboardingCalendarMarkers) throw new Error('Onboarding Calendar marker lookup is unavailable');
	return ctx.onboardingCalendarMarkers.listActivePersonnelIds(ctx.auth.orgId);
}

export async function fetchCalendarData(ctx: QueryPorts, input: CalendarQueryInput): Promise<CalendarData> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);

	const orgId = ctx.auth.orgId;
	const { rangeStart, rangeEnd } = input;
	const calendarScope = await resolveCalendarAssigneeScope(ctx);

	const [availabilityEntries, specialDays, assignmentTypeRows, dailyAssignmentRows, pinnedGroups] = await Promise.all([
		// Availability uses two-column overlap: end_date >= rangeStart AND start_date <= rangeEnd
		listAvailabilityEntries(ctx, { rangeStart, rangeEnd, personnelIds: calendarScope?.personnelIds }),
		// Special days: single-column date range
		listSpecialDaysInRange(ctx.store, orgId, input),
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
		listPinnedGroupNames(ctx)
	]);

	return {
		availabilityEntries,
		specialDays,
		assignmentTypes: AssignmentTypeEntity.fromDbArray(assignmentTypeRows),
		dailyAssignments: DailyAssignmentEntity.fromDbArray(
			filterRowsByCalendarAssigneeScope(dailyAssignmentRows, calendarScope)
		),
		pinnedGroups
	};
}

export async function fetchCalendarRangeData(ctx: QueryPorts, input: CalendarQueryInput): Promise<CalendarRangeData> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);

	const orgId = ctx.auth.orgId;
	const { rangeStart, rangeEnd } = input;
	const calendarScope = await resolveCalendarAssigneeScope(ctx);

	return withCalendarTiming(orgId, 'date-ranged-query', async () => {
		const [availabilityEntries, specialDays, dailyAssignmentRows] = await Promise.all([
			listAvailabilityEntries(ctx, { rangeStart, rangeEnd, personnelIds: calendarScope?.personnelIds }),
			listSpecialDaysInRange(ctx.store, orgId, input),
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
			availabilityEntries,
			specialDays,
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
	const availabilityEntries = listAvailabilityEntries(ctx, {
		rangeStart,
		rangeEnd,
		personnelIds: calendarScope?.personnelIds
	});
	const specialDays = listSpecialDaysInRange(ctx.store, orgId, specialDaysRange);
	const dailyAssignments = ctx.store
		.findMany<Record<string, unknown>>('daily_assignments', orgId, undefined, {
			rangeFilters: [
				{ column: 'date', op: 'gte', value: rangeStart },
				{ column: 'date', op: 'lte', value: rangeEnd }
			]
		})
		.then((rows) => DailyAssignmentEntity.fromDbArray(filterRowsByCalendarAssigneeScope(rows, calendarScope)));

	const [assignmentTypeRows, pinnedGroups, personnel, groups, statusTypes, orgSettingsRow] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('assignment_types', orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		listPinnedGroupNames(ctx),
		requirePersonnelCalendarRoster(ctx).listActive(ctx.auth),
		listGroupCatalog(ctx, { groupIds: calendarScope?.groupIds }),
		listStatusTypes(ctx.store, orgId),
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
		pinnedGroups,
		personnel,
		groups,
		statusTypes,
		lossWarningWindowDays
	};
}
