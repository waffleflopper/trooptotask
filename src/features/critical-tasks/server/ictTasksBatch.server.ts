import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import {
	reviewMappedIctTaskImportRows,
	type IctTaskImportMappedRow,
	type IctTaskImportMode
} from '$features/critical-tasks/utils/ictTaskImport';
import { error } from '@sveltejs/kit';
import { IctTaskEntity } from './ictTaskEntity.server';
import { requirePolicyDecision } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

const MAX_BATCH_SIZE = 500;

interface IctTaskBatchContext {
	auth: Pick<OrganizationAccessGrant, 'orgId' | 'role' | 'capabilityMap' | 'scopeSet'> &
		Partial<Pick<OrganizationAccessGrant, 'userId' | 'canManageMembers'>>;
	audit: PolicyAuditSink;
	store: {
		findMany<T>(table: string, orgId: string, filters?: Record<string, unknown>): Promise<T[]>;
		insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[], select?: string): Promise<T[]>;
		insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;
		update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
	};
}

export interface IctTaskBatchImportInput {
	mode: IctTaskImportMode;
	records: IctTaskImportMappedRow[];
}

export interface IctTaskBatchImportError {
	rowNumber: number;
	taskCode: string;
	title: string;
	message: string;
}

export interface IctTaskBatchImportResult {
	inserted: IctTask[];
	updated: IctTask[];
	restored: IctTask[];
	errors: IctTaskBatchImportError[];
}

function nextSortOrder(tasks: IctTask[]): number {
	if (tasks.length === 0) return 0;
	return Math.max(...tasks.map((task) => task.sortOrder)) + 1;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return 'Batch import failed';
}

function stripOrganizationId(row: Record<string, unknown>): Record<string, unknown> {
	const rest = { ...row };
	delete rest.organization_id;
	return rest;
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

	const existingTaskRows = await ctx.store.findMany<Record<string, unknown>>(IctTaskEntity.table, ctx.auth.orgId);
	const existingTasks = IctTaskEntity.fromDbArray(existingTaskRows);
	const review = reviewMappedIctTaskImportRows(input.records, {
		existingTasks,
		mode: input.mode,
		nextSortOrder: nextSortOrder(existingTasks)
	});

	const inserted: IctTask[] = [];
	const updated: IctTask[] = [];
	const restored: IctTask[] = [];
	const errors: IctTaskBatchImportError[] = review.invalidRows.flatMap((row) =>
		row.errors.map((message) => ({
			rowNumber: row.rowNumber,
			taskCode: (row.values.taskCode ?? '').trim(),
			title: (row.values.title ?? '').trim(),
			message
		}))
	);

	const createRows = review.validRows.filter((row) => row.action === 'create');
	if (createRows.length > 0) {
		try {
			const insertedRows = await ctx.store.insertMany<Record<string, unknown>>(
				IctTaskEntity.table,
				ctx.auth.orgId,
				createRows.map((row) => stripOrganizationId(IctTaskEntity.toDbInsert(row.task, ctx.auth.orgId))),
				IctTaskEntity.select
			);
			inserted.push(...IctTaskEntity.fromDbArray(insertedRows));
		} catch {
			for (const row of createRows) {
				try {
					const insertedRow = await ctx.store.insert<Record<string, unknown>>(
						IctTaskEntity.table,
						ctx.auth.orgId,
						stripOrganizationId(IctTaskEntity.toDbInsert(row.task, ctx.auth.orgId)),
						IctTaskEntity.select
					);
					inserted.push(IctTaskEntity.fromDb(insertedRow));
				} catch (error) {
					errors.push({
						rowNumber: row.rowNumber,
						taskCode: row.task.taskCode,
						title: row.task.title,
						message: errorMessage(error)
					});
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
			const updatedRow = await ctx.store.update<Record<string, unknown>>(
				IctTaskEntity.table,
				ctx.auth.orgId,
				row.taskId,
				IctTaskEntity.toDbUpdate(row.task),
				IctTaskEntity.select
			);
			const task = IctTaskEntity.fromDb(updatedRow);
			if (row.restoresArchivedTask) restored.push(task);
			else updated.push(task);
		} catch (error) {
			errors.push({
				rowNumber: row.rowNumber,
				taskCode: row.task.taskCode,
				title: row.task.title,
				message: errorMessage(error)
			});
		}
	}

	ctx.audit.log({
		action: 'ict_task.bulk_imported',
		resourceType: 'ict_task',
		details: {
			inserted: inserted.length,
			updated: updated.length,
			restored: restored.length,
			errors: errors.length
		}
	});

	return {
		inserted,
		updated,
		restored,
		errors
	};
}
