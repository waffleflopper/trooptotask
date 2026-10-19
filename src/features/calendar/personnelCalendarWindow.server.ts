import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import type {
	CalendarAssignmentReader,
	CalendarAvailabilityPersistence,
	CalendarCatalogPersistence,
	CalendarDateRange
} from './contracts';
import type { PersonnelCalendarWindow } from './calendar.types';

interface PersonnelCalendarWindowPorts {
	auth: OrganizationAccessGrant;
	audit?: PolicyAuditSink;
	calendarAvailability: Pick<CalendarAvailabilityPersistence, 'listOverlapping'>;
	calendarAssignments: Pick<CalendarAssignmentReader, 'listRange'>;
	calendarCatalogs: Pick<CalendarCatalogPersistence, 'listStatusTypes' | 'listAssignmentTypes' | 'listSpecialDays'>;
}

export async function loadPersonnelCalendarWindow(
	ctx: PersonnelCalendarWindowPorts,
	person: { id: string; groupId: string | null },
	range: CalendarDateRange
): Promise<PersonnelCalendarWindow> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.calendar.viewAvailability,
		policyResourceForGroup(person.groupId),
		'availability',
		person.id
	);
	const assigneeIds = person.groupId ? [person.id, person.groupId] : [person.id];
	const [availability, statusTypes, assignments, assignmentTypes, specialDays] = await Promise.all([
		ctx.calendarAvailability.listOverlapping({ ...range, personnelId: person.id }),
		ctx.calendarCatalogs.listStatusTypes(),
		ctx.calendarAssignments.listRange({ ...range, assigneeIds }),
		ctx.calendarCatalogs.listAssignmentTypes(),
		ctx.calendarCatalogs.listSpecialDays(range)
	]);
	const usedStatusIds = new Set(availability.map((entry) => entry.statusTypeId));
	const usedTypeIds = new Set(assignments.map((assignment) => assignment.assignmentTypeId));
	return {
		...range,
		availability,
		statusTypes: statusTypes.filter((status) => usedStatusIds.has(status.id)),
		assignments,
		assignmentTypes: assignmentTypes.filter((type) => usedTypeIds.has(type.id)),
		specialDays
	};
}
