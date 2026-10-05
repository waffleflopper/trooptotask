import type { IctTask, IctTaskCreate, IctTaskPatch } from '../contracts';

export interface SavedIctTask extends Record<string, unknown> {
	id: string;
	task_code: string;
	title: string;
	description: string | null;
	category?: string | null;
	mos: string[] | null;
	expiration_months: number | null;
	sort_order: number;
	archived_at: string | null;
	created_at: string;
}

export const TASK_SELECT =
	'id,task_code,title,description,category,mos,expiration_months,sort_order,archived_at,created_at';

export function mapIctTask(row: SavedIctTask): IctTask {
	return {
		id: row.id,
		taskCode: row.task_code,
		title: row.title,
		description: row.description,
		category: row.category,
		mos: row.mos ?? [],
		expirationMonths: row.expiration_months,
		sortOrder: row.sort_order,
		archivedAt: row.archived_at,
		createdAt: row.created_at
	};
}

export function taskPatchValues(input: IctTaskPatch): Record<string, unknown> {
	const values = {
		task_code: input.taskCode,
		title: input.title,
		description: input.description,
		category: input.category,
		mos: input.mos,
		expiration_months: input.expirationMonths,
		sort_order: input.sortOrder,
		archived_at: input.archivedAt
	};
	return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

export function taskCreateValues(input: IctTaskCreate): Record<string, unknown> {
	return {
		task_code: input.taskCode,
		title: input.title,
		description: input.description ?? null,
		category: input.category ?? null,
		mos: input.mos ?? [],
		expiration_months: input.expirationMonths ?? null,
		sort_order: input.sortOrder ?? 0,
		archived_at: input.archivedAt ?? null
	};
}
