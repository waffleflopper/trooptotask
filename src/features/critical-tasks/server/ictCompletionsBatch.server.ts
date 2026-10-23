import {
	ICT_IMPORT_MAX_RECORDS,
	type IctCompletionImportRecord,
	type IctImportReply,
	type IctImportRowResult,
	type PersonnelIctCompletion,
	type PersonnelIctCompletionCreate
} from '../contracts';
import { isUnconfirmedWrite } from './criticalTaskWriteOutcome.server';
import type { IctCompletionBatchContext } from './personnelIctCompletionPorts.server';
import { policyResourceForGroup, requirePolicyDecision } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail, RequestFailure } from '$lib/errors';

function errorMessage(error: unknown): string {
	if (isUnconfirmedWrite(error)) throw error;
	if (error instanceof RequestFailure && error.status < 500) return error.message;
	return 'This completion could not be saved.';
}

function rejection(
	person: { archivedAt?: string | null } | undefined,
	task: { taskCode: string; archivedAt: string | null } | undefined,
	repeated: boolean
): string | null {
	if (!person) return 'This person is not on a roster you can record completions for.';
	if (person.archivedAt) return 'This person is archived.';
	if (!task) return 'This task is not in the task library.';
	if (task.archivedAt) return `${task.taskCode} is archived. Restore it in the task library first.`;
	return repeated ? 'This completion appears more than once in this import.' : null;
}

export async function importIctCompletionsBatch(
	ctx: IctCompletionBatchContext,
	input: { records: IctCompletionImportRecord[] }
): Promise<IctImportReply<PersonnelIctCompletion>> {
	await requirePolicyDecision(ctx, POLICY_ACTION_CATALOG.criticalTasks.recordCompletion, { kind: 'unscoped' });
	if (input.records.length === 0) fail(400, 'records array is required');
	if (input.records.length > ICT_IMPORT_MAX_RECORDS) fail(400, `Maximum ${ICT_IMPORT_MAX_RECORDS} records per batch`);
	if (!ctx.personnelCriticalTasksRoster) throw new Error('Personnel Critical Tasks roster provider unavailable');

	const personnel = new Map(
		(await ctx.personnelCriticalTasksRoster.listForBatchImport(ctx.auth)).map((person) => [person.id, person])
	);
	const tasks = new Map((await ctx.criticalTaskLibrary.listImportCandidates()).map((task) => [task.id, task]));
	const results: IctImportRowResult<PersonnelIctCompletion>[] = [];
	const accepted: { index: number; record: IctCompletionImportRecord }[] = [];
	const seen = new Set<string>();
	input.records.forEach((record, index) => {
		const person = personnel.get(record.personnelId);
		const task = tasks.get(record.ictTaskId);
		const key = `${record.personnelId}|${record.ictTaskId}|${record.completedAt}`;
		const message = rejection(person, task, seen.has(key));
		seen.add(key);
		if (message) results[index] = { kind: 'failed', message };
		else accepted.push({ index, record });
	});

	for (const personnelId of new Set(accepted.map((item) => item.record.personnelId)))
		await requirePolicyDecision(
			ctx,
			POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
			policyResourceForGroup(personnel.get(personnelId)?.groupId)
		);

	const pairs = [
		...new Map(
			accepted.map(({ record }) => [
				`${record.personnelId}|${record.ictTaskId}`,
				{ personnelId: record.personnelId, ictTaskId: record.ictTaskId }
			])
		).values()
	];
	const history = new Map(
		(pairs.length ? await ctx.criticalTaskCompletions.listImportHistory(pairs) : []).map((completion) => [
			`${completion.personnelId}|${completion.ictTaskId}|${completion.completedAt}`,
			completion
		])
	);

	const creates: { index: number; completion: PersonnelIctCompletionCreate }[] = [];
	const updates: { index: number; saved: PersonnelIctCompletion; record: IctCompletionImportRecord }[] = [];
	for (const { index, record } of accepted) {
		const saved = history.get(`${record.personnelId}|${record.ictTaskId}|${record.completedAt}`);
		if (saved) updates.push({ index, saved, record });
		else
			creates.push({
				index,
				completion: {
					personnelId: record.personnelId,
					ictTaskId: record.ictTaskId,
					completedAt: record.completedAt,
					validationMethod: record.validationMethod ?? 'Other',
					...(record.validatedBy ? { validatedBy: record.validatedBy } : {}),
					...(record.notes ? { notes: record.notes } : {})
				}
			});
	}

	let added = 0;
	let updated = 0;
	try {
		if (creates.length) {
			try {
				const saved = await ctx.criticalTaskCompletions.createMany(creates.map((item) => item.completion));
				creates.forEach((item, position) => (results[item.index] = { kind: 'added', record: saved[position] }));
				added += saved.length;
			} catch (bulkError) {
				if (isUnconfirmedWrite(bulkError)) throw bulkError;
				for (const item of creates) {
					try {
						results[item.index] = {
							kind: 'added',
							record: await ctx.criticalTaskCompletions.create(item.completion)
						};
						added++;
					} catch (error) {
						results[item.index] = { kind: 'failed', message: errorMessage(error) };
					}
				}
			}
		}
		for (const item of updates) {
			const { validationMethod, validatedBy, notes } = item.record;
			const patch = {
				...(validationMethod && validationMethod !== item.saved.validationMethod ? { validationMethod } : {}),
				...(validatedBy && validatedBy !== item.saved.validatedBy ? { validatedBy } : {}),
				...(notes && notes !== item.saved.notes ? { notes } : {})
			};
			if (!Object.keys(patch).length) {
				results[item.index] = { kind: 'unchanged' };
				continue;
			}
			try {
				results[item.index] = {
					kind: 'updated',
					record: await ctx.criticalTaskCompletions.update(item.saved.id, patch)
				};
				updated++;
			} catch (error) {
				results[item.index] = { kind: 'failed', message: errorMessage(error) };
			}
		}
	} finally {
		await ctx.audit.log({
			action: 'personnel_ict_completion.bulk_imported',
			resourceType: 'personnel_ict_completion',
			details: { inserted: added, updated, failed: results.filter((result) => result?.kind === 'failed').length }
		});
	}
	return { results };
}
