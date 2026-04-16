import type { PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import {
	reviewMappedIctCompletionImportRows,
	type IctCompletionImportMappedRow
} from '$features/critical-tasks/utils/ictCompletionImport';
import { fail } from '$lib/server/core/errors';
import type { WritePorts } from '$lib/server/core/ports';
import { IctTaskEntity } from '$lib/server/entities/ictTask';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { PersonnelIctCompletionEntity } from '$lib/server/entities/personnelIctCompletion';
import { stripOrganizationId } from './stripOrganizationId';

const MAX_BATCH_SIZE = 500;

export interface IctCompletionBatchImportInput {
	records: IctCompletionImportMappedRow[];
}

export interface IctCompletionBatchImportError {
	rowNumber: number;
	personnelName: string;
	taskCode: string;
	message: string;
}

export interface IctCompletionBatchImportResult {
	inserted: PersonnelIctCompletion[];
	updated: PersonnelIctCompletion[];
	errors: IctCompletionBatchImportError[];
}

function errorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return 'Batch import failed';
}

function buildPersonnelName(values: Record<string, string>): string {
	const rank = (values.rank ?? '').trim();
	const firstName = (values.firstName ?? '').trim();
	const lastName = (values.lastName ?? '').trim();

	return [rank, firstName, lastName].filter(Boolean).join(' ').trim();
}

function toBatchErrors(
	rows: Array<{ rowNumber: number; values: Record<string, string>; errors: string[] }>
): IctCompletionBatchImportError[] {
	return rows.flatMap((row) =>
		row.errors.map((message) => ({
			rowNumber: row.rowNumber,
			personnelName: buildPersonnelName(row.values),
			taskCode: (row.values.taskCode ?? '').trim().toUpperCase(),
			message
		}))
	);
}

export async function importIctCompletionsBatch(
	ctx: WritePorts,
	input: IctCompletionBatchImportInput
): Promise<IctCompletionBatchImportResult> {
	ctx.auth.requireEdit('training');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) fail(403, 'Organization is in read-only mode');

	if (!Array.isArray(input.records) || input.records.length === 0) {
		fail(400, 'records array is required');
	}

	if (input.records.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	const personnelRows = await ctx.store.findMany<Record<string, unknown>>(
		PersonnelEntity.table,
		ctx.auth.orgId,
		undefined,
		{ select: PersonnelEntity.select }
	);
	const taskRows = await ctx.store.findMany<Record<string, unknown>>(IctTaskEntity.table, ctx.auth.orgId, undefined, {
		select: IctTaskEntity.select
	});
	const personnel = PersonnelEntity.fromDbArray(personnelRows);
	const tasks = IctTaskEntity.fromDbArray(taskRows);

	// First pass resolves only valid personnel/task references so we can scope access checks
	// and the existing-completion lookup without loading unrelated completion history.
	const preliminaryReview = reviewMappedIctCompletionImportRows(input.records, {
		personnel,
		tasks,
		existingCompletions: []
	});

	const matchedPersonnelIds = [...new Set(preliminaryReview.validRows.map((row) => row.personnelId))];
	if (matchedPersonnelIds.length > 0) {
		await ctx.auth.requireGroupAccessBatch(matchedPersonnelIds);
	}

	const matchedTaskIds = [...new Set(preliminaryReview.validRows.map((row) => row.ictTaskId))];
	const existingCompletionRows =
		matchedPersonnelIds.length > 0 && matchedTaskIds.length > 0
			? await ctx.store.findMany<Record<string, unknown>>(
					PersonnelIctCompletionEntity.table,
					ctx.auth.orgId,
					undefined,
					{
						inFilters: {
							personnel_id: matchedPersonnelIds,
							ict_task_id: matchedTaskIds
						}
					}
				)
			: [];
	const existingCompletions = PersonnelIctCompletionEntity.fromDbArray(existingCompletionRows);

	const review = reviewMappedIctCompletionImportRows(input.records, {
		personnel,
		tasks,
		existingCompletions
	});

	const inserted: PersonnelIctCompletion[] = [];
	const updated: PersonnelIctCompletion[] = [];
	const errors: IctCompletionBatchImportError[] = [
		...toBatchErrors(review.invalidRows),
		...toBatchErrors(review.ambiguousRows)
	];

	const createRows = review.validRows.filter((row) => !row.completionId);
	if (createRows.length > 0) {
		try {
			const insertedRows = await ctx.store.insertMany<Record<string, unknown>>(
				PersonnelIctCompletionEntity.table,
				ctx.auth.orgId,
				createRows.map((row) =>
					stripOrganizationId(PersonnelIctCompletionEntity.toDbInsert(row.completion, ctx.auth.orgId))
				),
				PersonnelIctCompletionEntity.select
			);
			inserted.push(...PersonnelIctCompletionEntity.fromDbArray(insertedRows));
		} catch {
			for (const row of createRows) {
				try {
					const insertedRow = await ctx.store.insert<Record<string, unknown>>(
						PersonnelIctCompletionEntity.table,
						ctx.auth.orgId,
						stripOrganizationId(PersonnelIctCompletionEntity.toDbInsert(row.completion, ctx.auth.orgId)),
						PersonnelIctCompletionEntity.select
					);
					inserted.push(PersonnelIctCompletionEntity.fromDb(insertedRow));
				} catch (error) {
					errors.push({
						rowNumber: row.rowNumber,
						personnelName: buildPersonnelName({
							rank: row.personnel.rank,
							firstName: row.personnel.firstName,
							lastName: row.personnel.lastName
						}),
						taskCode: row.task.taskCode,
						message: errorMessage(error)
					});
				}
			}
		}
	}

	for (const row of review.validRows.filter((entry) => entry.completionId)) {
		try {
			const updatedRow = await ctx.store.update<Record<string, unknown>>(
				PersonnelIctCompletionEntity.table,
				ctx.auth.orgId,
				row.completionId!,
				PersonnelIctCompletionEntity.toDbUpdate(row.completion),
				PersonnelIctCompletionEntity.select
			);
			updated.push(PersonnelIctCompletionEntity.fromDb(updatedRow));
		} catch (error) {
			errors.push({
				rowNumber: row.rowNumber,
				personnelName: buildPersonnelName({
					rank: row.personnel.rank,
					firstName: row.personnel.firstName,
					lastName: row.personnel.lastName
				}),
				taskCode: row.task.taskCode,
				message: errorMessage(error)
			});
		}
	}

	ctx.audit.log({
		action: 'personnel_ict_completion.bulk_imported',
		resourceType: 'personnel_ict_completion',
		details: {
			inserted: inserted.length,
			updated: updated.length,
			errors: errors.length
		}
	});

	errors.sort((left, right) => left.rowNumber - right.rowNumber || left.message.localeCompare(right.message));

	return {
		inserted,
		updated,
		errors
	};
}
