import type { Group, Personnel } from '$features/personnel/contracts';
import type { StatusType } from '$features/calendar/contracts';
import type { ToolbarAction } from '$lib/components/patterns/workspace-toolbar';
import type { CalendarReportFeedState } from './calendarReportFeed.svelte';
import type { ReportRange } from './reportQuery';

/** The toolbar filters every lens reads: Group and MOS narrow the people, Counts as away narrows the statuses. */
export interface ReportFilters {
	/** Everyone left after the Group and MOS filters. */
	personnel: Personnel[];
	selectedRootIds: ReadonlySet<string>;
	allGroupsSelected: boolean;
	awayStatusTypeIds: ReadonlySet<string>;
}

export interface LensProps {
	orgId: string;
	/** Everyone the reader can see, before the shared filters. */
	personnel: Personnel[];
	statusTypes: StatusType[];
	groups: Group[];
	filters: ReportFilters;
	/** The span on screen; a lens counts only these days. */
	range: ReportRange | null;
	/** The feed key of the data this lens asked for, which the span plus its `loadAfterDays` decide; null until known. */
	feedKey: string | null;
	/** The viewer's day, or null before the page has mounted. */
	today: string | null;
	feed: CalendarReportFeedState;
	onRetry: () => void;
}

export interface LensHandle {
	exportActions(): ToolbarAction[];
}
