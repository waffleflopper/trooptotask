import { getContext, setContext } from 'svelte';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { CalendarOperationsPageAccess } from '../contracts';

export type CalendarTypeKind = 'status' | 'assignments';

export interface CalendarTypeSetup {
	readonly orgUrlSegment: string;
	readonly canSetUp: Readonly<Record<CalendarTypeKind, boolean>>;
}

const KEY = Symbol('calendar-type-setup');

/** The getter keeps the viewer's access current while the page stays mounted. */
export function setCalendarTypeSetup(get: () => CalendarTypeSetup): void {
	setContext(KEY, get);
}

/** Absent outside the Calendar pages, where an empty state only tells the viewer to ask. */
export function getCalendarTypeSetup(): (() => CalendarTypeSetup) | undefined {
	return getContext<(() => CalendarTypeSetup) | undefined>(KEY);
}

export function calendarTypeSetupFor(org: CalendarOperationsPageAccess): CalendarTypeSetup {
	return {
		orgUrlSegment: org.orgUrlSegment,
		canSetUp: {
			status: org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.configureStatusTypes).allowed,
			assignments: org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.configureAssignmentTypes).allowed
		}
	};
}
