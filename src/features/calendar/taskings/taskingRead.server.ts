import type { SupabaseClient } from '@supabase/supabase-js';
import { taskingWorkspaceSchema, type TaskingWorkspace } from './taskingReadModel';

export interface CalendarTaskingWorkspaceReader {
	read(today: string, eventId?: string): Promise<TaskingWorkspace>;
}

export function createSupabaseCalendarTaskingWorkspaceReader(
	client: SupabaseClient,
	orgId: string
): CalendarTaskingWorkspaceReader {
	return {
		async read(today, eventId) {
			const { data, error } = await client.rpc('calendar_tasking_workspace', {
				p_organization_id: orgId,
				p_today: today,
				p_event_id: eventId ?? null
			});
			if (error) throw new Error(error.message);
			return taskingWorkspaceSchema.parse(data);
		}
	};
}
