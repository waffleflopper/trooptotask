import type { AvailabilitySpan, Bar, BarLayout, BarOverflow } from '$lib/components/patterns/calendar-bars';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';

export type CalendarSpan = AvailabilitySpan<AvailabilityEntry, StatusType>;
export type CalendarBar = Bar<AvailabilityEntry, StatusType>;
export type CalendarBarLayout = BarLayout<AvailabilityEntry, StatusType>;
export type CalendarBarOverflow = BarOverflow<AvailabilityEntry, StatusType>;
