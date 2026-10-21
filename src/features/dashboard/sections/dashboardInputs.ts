import type { Group, Personnel } from '$features/personnel/contracts';
import type {
	AssignmentType,
	AvailabilityEntry,
	DailyAssignment,
	SpecialDay,
	StatusType
} from '$features/calendar/contracts';
import type { DashboardPageData } from '../contracts';

/** What the page has loaded, as plain data, so a section's sources stay pure. */
export interface DashboardInputs {
	/** The viewer's day, "YYYY-MM-DD". */
	today: string;
	timeZone: string;
	/** Today through today plus 13, the forecast's columns. */
	forecastDays: readonly string[];
	/** Active personnel inside the viewer's scope. */
	personnel: readonly Personnel[];
	availability: readonly AvailabilityEntry[];
	statusTypes: readonly StatusType[];
	groups: readonly Group[];
	assignmentTypes: readonly AssignmentType[];
	assignments: readonly DailyAssignment[];
	/** Stored federal holidays and closures over the loaded window; weekends are not listed. */
	specialDays: readonly SpecialDay[];
	page: DashboardPageData;
}
