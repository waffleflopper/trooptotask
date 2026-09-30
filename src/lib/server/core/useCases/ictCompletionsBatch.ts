import type { PersonnelIctCompletion } from '$features/critical-tasks/contracts';
import {
	reviewMappedIctCompletionImportRows,
	type IctCompletionImportMappedRow
} from '$features/critical-tasks/utils/ictCompletionImport';
import { fail } from '$lib/server/core/errors';
import type { WritePorts } from '$lib/server/core/ports';
import { IctTaskEntity, PersonnelIctCompletionEntity } from '$features/critical-tasks/index.server';
import { requirePolicyDecision } from './policyAuthorization';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

const MAX_BATCH_SIZE = 500;
// Both UUID filters contribute to the provider URL. Bound pairs together so
// a supported batch stays below its request-line limit in either dimension.
const LOOKUP_PAIR_BATCH_SIZE = 50;

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

function stripOrganizationId(row: Record<string, unknown>): Record<string, unknown> {
	const rest = { ...row };
	delete rest.organization_id;
	return rest;
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

function toPersonnelPolicyResource(person?: { groupId?: string | null }) {
	return person?.groupId ? { kind: 'group' as const, groupId: person.groupId } : { kind: 'organization' as const };
}

export async function importIctCompletionsBatch(
	ctx: WritePorts,
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
	const taskRows = await ctx.store.findMany<Record<string, unknown>>(IctTaskEntity.table, ctx.auth.orgId, undefined, {
		select: IctTaskEntity.select
	});
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
		const personnelById = new Map(personnel.map((person) => [person.id, person]));
		for (const personnelId of matchedPersonnelIds) {
			const resource = toPersonnelPolicyResource(personnelById.get(personnelId));
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
	const lookups: Array<Promise<Record<string, unknown>[]>> = [];
	for (let index = 0; index < matchedPairs.length; index += LOOKUP_PAIR_BATCH_SIZE) {
		const pairs = matchedPairs.slice(index, index + LOOKUP_PAIR_BATCH_SIZE);
		lookups.push(
			ctx.store.findMany<Record<string, unknown>>(PersonnelIctCompletionEntity.table, ctx.auth.orgId, undefined, {
				inFilters: {
					personnel_id: [...new Set(pairs.map((pair) => pair.personnelId))],
					ict_task_id: [...new Set(pairs.map((pair) => pair.ictTaskId))]
				}
			})
		);
	}
	// The two filters can return overlapping history; retain each stored ID once.
	const existingCompletionRows = [...new Map((await Promise.all(lookups)).flat().map((row) => [row.id, row])).values()];
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
