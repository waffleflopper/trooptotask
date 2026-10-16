/**
 * Calendar page query — fetches all data needed to render the calendar for a date range.
 *
 * `fetchCalendarData(ctx, { rangeStart, rangeEnd })` returns availability entries,
 * special days, assignment types, daily assignments, and pinned groups for the given
 * ISO-string date window. Scoped collections are filtered from the caller's Scope Set.
 */
import type { AvailabilityEntry, SpecialDay, AssignmentType, DailyAssignment } from '$features/calendar/contracts';
import type { CalendarBootstrap, CalendarRangeData } from './calendar.types';
export type { CalendarBootstrap, CalendarRangeData } from './calendar.types';
import { listAssignmentTypes } from './assignmentTypeRead.server';
import { listAvailabilityEntries } from './availabilityRead.server';
import { listSpecialDaysInRange } from './specialDayRead.server';
import { listStatusTypes } from './statusTypeRead.server';
import { listDailyAssignments } from './dailyAssignmentRead.server';
import { withCalendarTiming } from './calendarTiming.server';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from './calendarPolicy.server';
import { requirePersonnelCalendarRoster, resolveCalendarAssigneeScope } from './calendarScope.server';

import type {
	CalendarAssignmentReader,
	CalendarAvailabilityPersistence,
	CalendarCatalogPersistence
} from './contracts';
import { readLossWarningWindowDays, type OrganizationSettingsReader } from '$features/organization/contracts';
import type { OnboardingCalendarMarkersPort } from '$features/onboarding/contracts';
import type { AuditPort } from '$lib/audit/contracts';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { GroupPersistence, PersonnelCalendarRosterPort, SelfPinPersistence } from '$features/personnel/contracts';
import { visiblePinnedGroupNames } from '$features/personnel/index.server';

interface CalendarQueryPorts {
	auth: OrganizationAccessGrant;
	audit?: AuditPort;
	groups: Pick<GroupPersistence, 'listCatalog'>;
	selfPins: Pick<SelfPinPersistence, 'listNames'>;
	calendarCatalogs: CalendarCatalogPersistence;
	calendarAvailability: Pick<CalendarAvailabilityPersistence, 'listOverlapping'>;
	calendarAssignments: Pick<CalendarAssignmentReader, 'listRange'>;
	personnelCalendarRoster?: Pick<PersonnelCalendarRosterPort, 'listAssigneeIds'>;
}

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

export async function getActiveOnboardingPersonnelIds(ctx: {
	auth: OrganizationAccessGrant;
	audit?: AuditPort;
	onboardingCalendarMarkers?: OnboardingCalendarMarkersPort;
}): Promise<string[]> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);
	if (!ctx.onboardingCalendarMarkers) throw new Error('Onboarding Calendar marker lookup is unavailable');
	return ctx.onboardingCalendarMarkers.listActivePersonnelIds(ctx.auth.orgId);
}

export async function fetchCalendarData(ctx: CalendarQueryPorts, input: CalendarQueryInput): Promise<CalendarData> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewAvailability);

	const { rangeStart, rangeEnd } = input;
	const calendarScope = await resolveCalendarAssigneeScope(ctx);

	const [availabilityEntries, specialDays, assignmentTypes, dailyAssignments, pinnedGroups, groups] = await Promise.all(
		[
			listAvailabilityEntries(ctx, { rangeStart, rangeEnd, personnelIds: calendarScope?.personnelIds }),
			listSpecialDaysInRange(ctx.calendarCatalogs, input),
			listAssignmentTypes(ctx.calendarCatalogs),
			listDailyAssignments(ctx, input, calendarScope),
			ctx.selfPins.listNames(),
			ctx.groups.listCatalog()
		]
	);

	return {
		availabilityEntries,
		specialDays,
		assignmentTypes,
		dailyAssignments,
		pinnedGroups: visiblePinnedGroupNames(pinnedGroups, groups)
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
			listSpecialDaysInRange(ctx.calendarCatalogs, input),
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
	ctx: CalendarQueryPorts & {
		personnelCalendarRoster?: Pick<PersonnelCalendarRosterPort, 'listAssigneeIds' | 'listActive'>;
		organizationSettings: Pick<OrganizationSettingsReader, 'findLossWarningWindowDays'>;
	},
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
	const specialDays = listSpecialDaysInRange(ctx.calendarCatalogs, specialDaysRange);
	const dailyAssignments = listDailyAssignments(ctx, input, calendarScope);
	// Handle early rejections until streaming attaches its consumers. The returned
	// original promises still reject, so hydration can show the source error.
	void availabilityEntries.catch(() => undefined);
	void specialDays.catch(() => undefined);
	void dailyAssignments.catch(() => undefined);

	const [assignmentTypes, pinnedGroups, personnel, groups, statusTypes, lossWarningWindowDays] = await Promise.all([
		listAssignmentTypes(ctx.calendarCatalogs),
		ctx.selfPins.listNames(),
		requirePersonnelCalendarRoster(ctx).listActive(ctx.auth),
		ctx.groups.listCatalog(),
		listStatusTypes(ctx.calendarCatalogs),
		readLossWarningWindowDays(ctx.organizationSettings.findLossWarningWindowDays(orgId))
	]);

	return {
		rangeStart,
		rangeEnd,
		availabilityEntries,
		specialDays,
		specialDaysRange: { rangeStart: specialDaysRange.rangeStart, rangeEnd: specialDaysRange.rangeEnd },
		assignmentTypes,
		dailyAssignments,
		pinnedGroups: visiblePinnedGroupNames(pinnedGroups, groups),
		personnel,
		groups,
		statusTypes,
		lossWarningWindowDays
	};
}
