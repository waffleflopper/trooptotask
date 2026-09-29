import type { IctTask } from '../criticalTasks.types';
import { IctTaskEntity } from './ictTaskEntity.server';

interface IctTaskReadContext {
	orgId: string;
	store: {
		findMany<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: {
				select?: string;
				isNull?: Record<string, boolean>;
				orderBy?: Array<{ column: string; ascending: boolean }>;
			}
		): Promise<T[]>;
	};
}

/** Organization-local active library tasks for an already admitted readiness caller. */
export async function listActiveIctTasksForReadiness({ orgId, store }: IctTaskReadContext): Promise<IctTask[]> {
	const rows = await store.findMany<Record<string, unknown>>('ict_tasks', orgId, undefined, {
		select: IctTaskEntity.select,
		isNull: { archived_at: true },
		orderBy: [
			{ column: 'sort_order', ascending: true },
			{ column: 'task_code', ascending: true }
		]
	});
	return IctTaskEntity.fromDbArray(rows);
}
