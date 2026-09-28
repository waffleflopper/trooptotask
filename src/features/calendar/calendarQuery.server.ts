/**
 * Calendar page query — fetches all data needed to render the calendar for a date range.
 *
 * `fetchCalendarData(ctx, { rangeStart, rangeEnd })` returns availability entries,
 * special days, assignment types, daily assignments, and pinned groups for the given
 * ISO-string date window. Scoped collections are filtered from the caller's Scope Set.
 */
import type { DailyAssignment } from '$lib/types';
import type { AvailabilityEntry, SpecialDay, AssignmentType } from '$features/calendar/contracts';
import type { CalendarBootstrap, CalendarRangeData } from './calendar.types';
export type { CalendarBootstrap, CalendarRangeData } from './calendar.types';
import { listAssignmentTypes } from './assignmentTypeRead.server';
import { listAvailabilityEntries } from './availabilityRead.server';
import { listSpecialDaysInRange } from './specialDayRead.server';
import { listStatusTypes } from './statusTypeRead.server';
import { listDailyAssignments } from './dailyAssignmentRead.server';
import { listGroupCatalog, listPinnedGroupNames } from '$features/personnel/index.server';
import { withCalendarTiming } from '$lib/server/utils/calendarTiming';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '$lib/server/core/useCases/calendarPolicy';
import { requirePersonnelCalendarRoster, resolveCalendarAssigneeScope } from '$lib/server/core/useCases/calendarScope';

type CalendarQueryPorts = Parameters<typeof resolveCalendarAssigneeScope>[0];

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

export async function getActiveOnboardingPersonnelIds(ctx: CalendarQueryPorts): Promise<string[]> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);
	if (!ctx.onboardingCalendarMarkers) throw new Error('Onboarding Calendar marker lookup is unavailable');
	return ctx.onboardingCalendarMarkers.listActivePersonnelIds(ctx.auth.orgId);
}

export async function fetchCalendarData(ctx: CalendarQueryPorts, input: CalendarQueryInput): Promise<CalendarData> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);

	const orgId = ctx.auth.orgId;
	const { rangeStart, rangeEnd } = input;
	const calendarScope = await resolveCalendarAssigneeScope(ctx);

	const [availabilityEntries, specialDays, assignmentTypes, dailyAssignments, pinnedGroups] = await Promise.all([
		// Availability uses two-column overlap: end_date >= rangeStart AND start_date <= rangeEnd
		listAvailabilityEntries(ctx, { rangeStart, rangeEnd, personnelIds: calendarScope?.personnelIds }),
		// Special days: single-column date range
		listSpecialDaysInRange(ctx.store, orgId, input),
		// Assignment types: no date filtering
		listAssignmentTypes(ctx.store, orgId),
		listDailyAssignments(ctx, input, calendarScope),
		listPinnedGroupNames(ctx)
	]);

	return {
		availabilityEntries,
		specialDays,
		assignmentTypes,
		dailyAssignments,
		pinnedGroups
	};
}

export async function fetchCalendarRangeData(
	ctx: CalendarQueryPorts,
	input: CalendarQueryInput
): Promise<CalendarRangeData> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);

	const orgId = ctx.auth.orgId;
	const { rangeStart, rangeEnd } = input;
	const calendarScope = await resolveCalendarAssigneeScope(ctx);

	return withCalendarTiming(orgId, 'date-ranged-query', async () => {
		const [availabilityEntries, specialDays, dailyAssignments] = await Promise.all([
			listAvailabilityEntries(ctx, { rangeStart, rangeEnd, personnelIds: calendarScope?.personnelIds }),
			listSpecialDaysInRange(ctx.store, orgId, input),
			listDailyAssignments(ctx, input, calendarScope)
		]);

		return {
			rangeStart,
			rangeEnd,
			availabilityEntries,
			specialDays,
			dailyAssignments
		};
	});
}

export async function fetchCalendarBootstrap(
	ctx: CalendarQueryPorts,
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
	const dailyAssignments = listDailyAssignments(ctx, input, calendarScope);

	const [assignmentTypes, pinnedGroups, personnel, groups, statusTypes, orgSettingsRow] = await Promise.all([
		listAssignmentTypes(ctx.store, orgId),
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
		assignmentTypes,
		dailyAssignments,
		pinnedGroups,
		personnel,
		groups,
		statusTypes,
		lossWarningWindowDays
	};
}
