import type { SupabaseClient } from '$lib/server/database';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '../calendarPolicy.server';
import { ATTENTION_ROW_LIMIT, taskingDashboardSchema, type TaskingAttentionProjection } from './taskingAttentionModel';

export interface CalendarTaskingAttentionReader {
	/** The viewer's active Taskings needing attention on `today`; a reader sees only the work their scope covers. */
	read(today: string): Promise<TaskingAttentionProjection>;
}

export interface CalendarTaskingAttentionPorts {
	auth: OrganizationAccessGrant;
	taskingAttention: CalendarTaskingAttentionReader;
}

export function createSupabaseCalendarTaskingAttentionReader(
	client: SupabaseClient,
	orgId: string
): CalendarTaskingAttentionReader {
	return {
		async read(today) {
			const { data, error } = await client.rpc('calendar_tasking_dashboard', {
				p_organization_id: orgId,
				p_today: today,
				p_limit: ATTENTION_ROW_LIMIT
			});
			if (error) throw new Error(error.message);
			return taskingDashboardSchema.parse(data);
		}
	};
}

export async function loadTaskingAttention(
	ctx: CalendarTaskingAttentionPorts,
	today: string
): Promise<TaskingAttentionProjection> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	return ctx.taskingAttention.read(today);
}
