import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '../calendarPolicy.server';
import { ATTENTION_ROW_LIMIT, attentionRowSchema, type TaskingAttentionProjection } from './taskingAttentionModel';

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
			const { data, error } = await client.rpc('calendar_tasking_attention', {
				p_organization_id: orgId,
				p_today: today,
				p_limit: ATTENTION_ROW_LIMIT
			});
			if (error) throw new Error(error.message);
			const parsed = ((data ?? []) as unknown[]).map((row) => attentionRowSchema.parse(row));
			return { rows: parsed.map(({ row }) => row), total: parsed[0]?.total ?? 0 };
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
