import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import {
	CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE,
	ICT_IMPORT_MAX_RECORDS,
	ICT_TASK_UNAVAILABLE_MESSAGE,
	type CriticalTaskLibraryPersistence,
	type IctImportReply,
	type IctImportRowResult,
	type IctTask,
	type IctTaskCreate,
	type IctTaskImportRecord
} from '../contracts';
import { isUnconfirmedWrite } from './criticalTaskWriteOutcome.server';
import { normalizeIctTaskCode } from '../utils/ictTaskLibrary';
import { fail, RequestFailure } from '$lib/errors';
import { requirePolicyDecision } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

interface IctTaskBatchContext {
	auth: Pick<OrganizationAccessGrant, 'orgId' | 'role' | 'capabilityMap' | 'scopeSet'> &
		Partial<Pick<OrganizationAccessGrant, 'userId'>>;
	audit: PolicyAuditSink;
	criticalTaskLibrary: Pick<
		CriticalTaskLibraryPersistence,
		'listImportCandidates' | 'create' | 'createMany' | 'update'
	>;
}

function rowFailure(error: unknown): Extract<IctImportRowResult<never>, { message: string }> {
	if (isUnconfirmedWrite(error)) return { kind: 'unconfirmed', message: CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE };
	return {
		kind: 'failed',
		message: error instanceof RequestFailure && error.status < 500 ? error.message : 'This task could not be saved.'
	};
}

export async function importIctTasksBatch(
	ctx: IctTaskBatchContext,
	input: { records: IctTaskImportRecord[] }
): Promise<IctImportReply<IctTask>> {
	await requirePolicyDecision(ctx, POLICY_ACTION_CATALOG.criticalTasks.configureLibrary, { kind: 'organization' });
	if (input.records.length === 0) fail(400, 'records array is required');
	if (input.records.length > ICT_IMPORT_MAX_RECORDS) fail(400, `Maximum ${ICT_IMPORT_MAX_RECORDS} records per batch`);

	const existing = await ctx.criticalTaskLibrary.listImportCandidates();
	const byCode = new Map(existing.map((task) => [normalizeIctTaskCode(task.taskCode), task]));
	let nextSortOrder = existing.reduce((max, task) => Math.max(max, task.sortOrder + 1), 0);
	const results: IctImportRowResult<IctTask>[] = [];
	const creates: { index: number; task: IctTaskCreate }[] = [];
	const updates: { index: number; id: string; patch: Omit<IctTaskImportRecord, 'taskCode'> }[] = [];
	const seen = new Set<string>();

	input.records.forEach(({ taskCode: rawCode, ...fields }, index) => {
		const taskCode = normalizeIctTaskCode(rawCode);
		if (seen.has(taskCode)) {
			results[index] = { kind: 'failed', message: `Task code ${taskCode} appears more than once in this import.` };
			return;
		}
		seen.add(taskCode);
		const match = byCode.get(taskCode);
		if (match) {
			const { title, description, category, mos, ...values } = fields;
			updates.push({
				index,
				id: match.id,
				patch: {
					...values,
					...(title?.trim() ? { title } : {}),
					...(description?.trim() ? { description } : {}),
					...(category?.trim() ? { category } : {}),
					...(mos?.length ? { mos } : {})
				}
			});
			return;
		}
		if (!fields.title) {
			results[index] = { kind: 'failed', message: 'A new task needs a title.' };
			return;
		}
		creates.push({
			index,
			task: { ...fields, taskCode, title: fields.title, sortOrder: fields.sortOrder ?? nextSortOrder++ }
		});
	});

	let added = 0;
	let updated = 0;
	try {
		if (creates.length) {
			try {
				const saved = await ctx.criticalTaskLibrary.createMany(creates.map((item) => item.task));
				creates.forEach((item, position) => (results[item.index] = { kind: 'added', record: saved[position] }));
				added += saved.length;
			} catch (bulkError) {
				if (isUnconfirmedWrite(bulkError)) {
					for (const item of creates) results[item.index] = rowFailure(bulkError);
				} else {
					for (const item of creates) {
						try {
							results[item.index] = { kind: 'added', record: await ctx.criticalTaskLibrary.create(item.task) };
							added++;
						} catch (error) {
							results[item.index] = rowFailure(error);
						}
					}
				}
			}
		}
		for (const item of updates) {
			try {
				const task = await ctx.criticalTaskLibrary.update(item.id, { ...item.patch, archivedAt: null });
				if (!task) fail(404, ICT_TASK_UNAVAILABLE_MESSAGE);
				results[item.index] = { kind: 'updated', record: task };
				updated++;
			} catch (error) {
				results[item.index] = rowFailure(error);
			}
		}
	} finally {
		await ctx.audit.log({
			action: 'ict_task.bulk_imported',
			resourceType: 'ict_task',
			details: { inserted: added, updated, failed: results.filter((result) => result?.kind === 'failed').length }
		});
	}
	return { results };
}
