import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import {
	CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE,
	type CriticalTaskLibraryPersistence,
	type IctTask,
	type IctTaskBatchImportError,
	type IctTaskBatchImportResult
} from '../contracts';
import { isUnconfirmedWrite } from './criticalTaskWriteOutcome.server';
import {
	reviewMappedIctTaskImportRows,
	type IctTaskImportMappedRow,
	type IctTaskImportMode
} from '$features/critical-tasks/utils/ictTaskImport';
import { error } from '@sveltejs/kit';
import { requirePolicyDecision } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

const MAX_BATCH_SIZE = 500;

interface IctTaskBatchContext {
	auth: Pick<OrganizationAccessGrant, 'orgId' | 'role' | 'capabilityMap' | 'scopeSet'> &
		Partial<Pick<OrganizationAccessGrant, 'userId'>>;
	audit: PolicyAuditSink;
	criticalTaskLibrary: Pick<
		CriticalTaskLibraryPersistence,
		'listImportCandidates' | 'create' | 'createMany' | 'update'
	>;
}

export interface IctTaskBatchImportInput {
	mode: IctTaskImportMode;
	records: IctTaskImportMappedRow[];
}

function nextSortOrder(tasks: IctTask[]): number {
	if (tasks.length === 0) return 0;
	return Math.max(...tasks.map((task) => task.sortOrder)) + 1;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return 'Batch import failed';
}

export async function importIctTasksBatch(
	ctx: IctTaskBatchContext,
	input: IctTaskBatchImportInput
): Promise<IctTaskBatchImportResult> {
	await requirePolicyDecision(ctx, POLICY_ACTION_CATALOG.criticalTasks.configureLibrary, { kind: 'organization' });

	if (!Array.isArray(input.records) || input.records.length === 0) {
		throw error(400, 'records array is required');
	}

	if (input.records.length > MAX_BATCH_SIZE) {
		throw error(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	const existingTasks = await ctx.criticalTaskLibrary.listImportCandidates();
	const review = reviewMappedIctTaskImportRows(input.records, {
		existingTasks,
		mode: input.mode,
		nextSortOrder: nextSortOrder(existingTasks)
	});

	const inserted: IctTask[] = [];
	const updated: IctTask[] = [];
	const restored: IctTask[] = [];
	const unconfirmed: IctTaskBatchImportError[] = [];
	const errors: IctTaskBatchImportError[] = review.invalidRows.flatMap((row) =>
		row.errors.map((message) => ({
			rowNumber: row.rowNumber,
			taskCode: (row.values.taskCode ?? '').trim(),
			title: (row.values.title ?? '').trim(),
			message
		}))
	);

	function recordFailure(row: { rowNumber: number; task: { taskCode: string; title: string } }, error: unknown) {
		const issue = { rowNumber: row.rowNumber, taskCode: row.task.taskCode, title: row.task.title };
		if (isUnconfirmedWrite(error)) unconfirmed.push({ ...issue, message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE });
		else errors.push({ ...issue, message: errorMessage(error) });
	}

	const createRows = review.validRows.filter((row) => row.action === 'create');
	if (createRows.length > 0) {
		try {
			inserted.push(...(await ctx.criticalTaskLibrary.createMany(createRows.map((row) => row.task))));
		} catch (bulkError) {
			if (isUnconfirmedWrite(bulkError)) {
				for (const row of createRows) recordFailure(row, bulkError);
			} else {
				for (const row of createRows) {
					try {
						inserted.push(await ctx.criticalTaskLibrary.create(row.task));
					} catch (error) {
						recordFailure(row, error);
					}
				}
			}
		}
	}

	for (const row of review.validRows.filter((entry) => entry.action === 'update')) {
		if (!row.taskId) {
			errors.push({
				rowNumber: row.rowNumber,
				taskCode: row.task.taskCode,
				title: row.task.title,
				message: 'Task code could not be resolved for update'
			});
			continue;
		}

		try {
			const task = await ctx.criticalTaskLibrary.update(row.taskId, row.task);
			if (row.restoresArchivedTask) restored.push(task);
			else updated.push(task);
		} catch (error) {
			recordFailure(row, error);
		}
	}

	ctx.audit.log({
		action: 'ict_task.bulk_imported',
		resourceType: 'ict_task',
		details: {
			inserted: inserted.length,
			updated: updated.length,
			restored: restored.length,
			errors: errors.length,
			unconfirmed: unconfirmed.length
		}
	});

	return {
		inserted,
		updated,
		restored,
		errors,
		unconfirmed
	};
}
