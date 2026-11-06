import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import {
	CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE,
	ICT_IMPORT_MAX_RECORDS,
	type CriticalTaskLibraryPersistence,
	type IctImportReply,
	type IctImportRowResult,
	type IctTask,
	type IctTaskImportRecord,
	type IctTaskImportWrite
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
	criticalTaskLibrary: Pick<CriticalTaskLibraryPersistence, 'listImportCandidates' | 'importMany'>;
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
	const writes: { index: number; write: IctTaskImportWrite }[] = [];
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
			writes.push({
				index,
				write: {
					id: match.id,
					patch: {
						...values,
						...(title?.trim() ? { title } : {}),
						...(description?.trim() ? { description } : {}),
						...(category?.trim() ? { category } : {}),
						...(mos?.length ? { mos } : {}),
						archivedAt: null
					}
				}
			});
			return;
		}
		if (!fields.title) {
			results[index] = { kind: 'failed', message: 'A new task needs a title.' };
			return;
		}
		writes.push({
			index,
			write: { create: { ...fields, taskCode, title: fields.title, sortOrder: fields.sortOrder ?? nextSortOrder++ } }
		});
	});

	if (writes.length) {
		try {
			const outcomes = await ctx.criticalTaskLibrary.importMany(writes.map((item) => item.write));
			writes.forEach(({ index, write }, position) => {
				const outcome = outcomes[position];
				results[index] =
					outcome instanceof Error
						? rowFailure(outcome)
						: { kind: 'create' in write ? 'added' : 'updated', record: outcome };
			});
		} catch (error) {
			for (const { index } of writes) results[index] = rowFailure(error);
		}
	}
	return { results };
}
