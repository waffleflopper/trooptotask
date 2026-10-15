import {
	CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE,
	type PersonnelIctCompletion,
	type IctCompletionBatchImportInput,
	type IctCompletionBatchImportError,
	type IctCompletionBatchImportResult
} from '../contracts';
import { isUnconfirmedWrite } from './criticalTaskWriteOutcome.server';
import { importRowPersonnelName, reviewMappedIctCompletionImportRows } from '../utils/ictCompletionImport';
import type { IctCompletionBatchContext } from './personnelIctCompletionPorts.server';
import { policyResourceForGroup, requirePolicyDecision } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail, RequestFailure } from '$lib/errors';

const MAX_BATCH_SIZE = 500;
function errorMessage(error: unknown): string {
	if (error instanceof RequestFailure && error.status < 500) return error.message;
	return 'Batch import failed';
}

function toBatchErrors(
	rows: Array<{ rowNumber: number; values: Record<string, string>; errors: string[] }>
): IctCompletionBatchImportError[] {
	return rows.flatMap((row) =>
		row.errors.map((message) => ({
			rowNumber: row.rowNumber,
			personnelName: importRowPersonnelName(row.values),
			taskCode: (row.values.taskCode ?? '').trim().toUpperCase(),
			message
		}))
	);
}

export async function importIctCompletionsBatch(
	ctx: IctCompletionBatchContext,
	input: IctCompletionBatchImportInput
): Promise<IctCompletionBatchImportResult> {
	await requirePolicyDecision(ctx, POLICY_ACTION_CATALOG.criticalTasks.recordCompletion, { kind: 'unscoped' });

	if (!Array.isArray(input.records) || input.records.length === 0) {
		fail(400, 'records array is required');
	}

	if (input.records.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	if (!ctx.personnelCriticalTasksRoster) throw new Error('Personnel Critical Tasks roster provider unavailable');
	const personnel = await ctx.personnelCriticalTasksRoster.listForBatchImport(ctx.auth);
	const tasks = await ctx.criticalTaskLibrary.listImportCandidates();

	const preliminaryReview = reviewMappedIctCompletionImportRows(input.records, {
		personnel,
		tasks,
		existingCompletions: []
	});

	const matchedPersonnelIds = [...new Set(preliminaryReview.validRows.map((row) => row.personnelId))];
	if (matchedPersonnelIds.length > 0) {
		const personnelById = new Map(personnel.map((person) => [person.id, person]));
		for (const personnelId of matchedPersonnelIds) {
			const resource = policyResourceForGroup(personnelById.get(personnelId)?.groupId);
			await requirePolicyDecision(ctx, POLICY_ACTION_CATALOG.criticalTasks.recordCompletion, resource);
		}
	}

	const matchedPairs = [
		...new Map(
			preliminaryReview.validRows.map((row) => [
				`${row.personnelId}:${row.ictTaskId}`,
				{ personnelId: row.personnelId, ictTaskId: row.ictTaskId }
			])
		).values()
	];
	const existingCompletions = await ctx.criticalTaskCompletions.listImportHistory(matchedPairs);

	const review = reviewMappedIctCompletionImportRows(input.records, {
		personnel,
		tasks,
		existingCompletions
	});

	const inserted: PersonnelIctCompletion[] = [];
	const updated: PersonnelIctCompletion[] = [];
	const unconfirmed: IctCompletionBatchImportError[] = [];
	const errors: IctCompletionBatchImportError[] = [
		...toBatchErrors(review.invalidRows),
		...toBatchErrors(review.ambiguousRows)
	];

	function recordFailure(row: (typeof review.validRows)[number], error: unknown) {
		const issue = {
			rowNumber: row.rowNumber,
			personnelName: importRowPersonnelName({
				rank: row.personnel.rank,
				firstName: row.personnel.firstName,
				lastName: row.personnel.lastName
			}),
			taskCode: row.task.taskCode
		};
		if (isUnconfirmedWrite(error)) unconfirmed.push({ ...issue, message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE });
		else errors.push({ ...issue, message: errorMessage(error) });
	}

	const createRows = review.validRows.filter((row) => !row.completionId);
	if (createRows.length > 0) {
		try {
			const insertedRows = await ctx.criticalTaskCompletions.createMany(createRows.map((row) => row.completion));
			inserted.push(...insertedRows);
		} catch (bulkError) {
			if (isUnconfirmedWrite(bulkError)) {
				for (const row of createRows) recordFailure(row, bulkError);
			} else {
				for (const row of createRows) {
					try {
						inserted.push(await ctx.criticalTaskCompletions.create(row.completion));
					} catch (error) {
						recordFailure(row, error);
					}
				}
			}
		}
	}

	for (const row of review.validRows.filter((entry) => entry.completionId)) {
		try {
			updated.push(await ctx.criticalTaskCompletions.update(row.completionId!, row.completion));
		} catch (error) {
			recordFailure(row, error);
		}
	}

	ctx.audit.log({
		action: 'personnel_ict_completion.bulk_imported',
		resourceType: 'personnel_ict_completion',
		details: {
			inserted: inserted.length,
			updated: updated.length,
			errors: errors.length,
			unconfirmed: unconfirmed.length
		}
	});

	const byRow = (left: IctCompletionBatchImportError, right: IctCompletionBatchImportError) =>
		left.rowNumber - right.rowNumber || left.message.localeCompare(right.message);
	errors.sort(byRow);
	unconfirmed.sort(byRow);

	return {
		inserted,
		updated,
		errors,
		unconfirmed
	};
}
