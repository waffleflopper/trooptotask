import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import type {
	CriticalTasksCompletionTrendPoint,
	CriticalTasksReadModelFilters,
	CriticalTasksReadModelPort
} from '../core/ports';

function hasEmptyFilter(values?: string[]): boolean {
	return Array.isArray(values) && values.length === 0;
}

function normalizeIds(values?: string[]): string[] | null {
	if (!values || values.length === 0) return null;
	return [...new Set(values)];
}

export function createSupabaseCriticalTasksReadModelAdapter(supabase: SupabaseClient): CriticalTasksReadModelPort {
	return {
		async findLatestCompletions(orgId: string, filters: CriticalTasksReadModelFilters = {}) {
			if (hasEmptyFilter(filters.personnelIds) || hasEmptyFilter(filters.taskIds)) {
				return [];
			}

			const { data, error } = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) =>
				supabase
					.rpc('latest_active_personnel_ict_completions', {
						p_organization_id: orgId,
						p_personnel_ids: normalizeIds(filters.personnelIds),
						p_ict_task_ids: normalizeIds(filters.taskIds)
					})
					.order('personnel_id')
					.order('ict_task_id')
					.range(from, to)
			);

			if (error) {
				throw new Error((error as { message: string }).message);
			}

			return (data ?? []) as Record<string, unknown>[];
		},

		async findCompletionTrend(
			orgId: string,
			filters: CriticalTasksReadModelFilters = {}
		): Promise<CriticalTasksCompletionTrendPoint[]> {
			if (hasEmptyFilter(filters.personnelIds) || hasEmptyFilter(filters.taskIds)) {
				return [];
			}

			const { data, error } = await supabase.rpc('active_personnel_ict_completion_trend', {
				p_organization_id: orgId,
				p_personnel_ids: normalizeIds(filters.personnelIds),
				p_ict_task_ids: normalizeIds(filters.taskIds)
			});

			if (error) {
				throw new Error(error.message);
			}

			return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
				month: String(row.month ?? ''),
				completions:
					typeof row.completions === 'number'
						? row.completions
						: Number.parseInt(String(row.completions ?? '0'), 10) || 0
			}));
		}
	};
}
