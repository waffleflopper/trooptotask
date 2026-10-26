import { loadTaskingAttention } from '$features/calendar/index.server';
import type { TaskingAttentionProjection } from '$features/calendar';
import { dashboardSourceAccess } from './dashboardSources.server';

type DashboardTaskingContext = Parameters<typeof loadTaskingAttention>[0] & Parameters<typeof dashboardSourceAccess>[0];

/** Null when the unit has Events & Taskings off or the viewer has no Calendar, which is not an empty queue. */
export async function fetchDashboardTaskingAttention(
	ctx: DashboardTaskingContext,
	today: string
): Promise<TaskingAttentionProjection | null> {
	if (!dashboardSourceAccess(ctx)('taskingAttention')) return null;
	return loadTaskingAttention(ctx, today);
}
