import { z } from 'zod';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { evaluateFeaturePolicy, policyResourceForGroup } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { issueMessage, uuidSchema } from '$lib/utils/inputSchemas';
import type { PersonnelArtifactWritePort, PersonnelRecordPersistence } from './contracts';

export const PERSONNEL_LOG_BATCH_LIMIT = 500;

export interface PersonnelLogBatchContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	/** Scoped to the actor's Groups, so People outside them read as missing. */
	personnel: Pick<PersonnelRecordPersistence, 'listArchiveCandidates'>;
	personnelArtifactWrites: Pick<PersonnelArtifactWritePort, 'createFollowUps' | 'createLeaderNotes'>;
}

/** `writtenIds` got the entry; `unavailableIds` are missing, archived or outside the actor's Manage records. */
export interface PersonnelLogBatchResult {
	writtenIds: string[];
	unavailableIds: string[];
}

const personnelIds = z
	.array(uuidSchema, 'Choose People')
	.min(1, 'Choose People')
	.max(PERSONNEL_LOG_BATCH_LIMIT, `Choose at most ${PERSONNEL_LOG_BATCH_LIMIT} People at a time`);

const followUpBatchInput = z.object({
	personnelIds,
	title: z.string().trim().min(1, 'Follow-up title is required').max(200),
	notes: z.string().trim().max(2000).optional().default(''),
	dueDate: z.string().date().nullable().optional().default(null)
});

const leaderNoteBatchInput = z.object({
	personnelIds,
	text: z.string().trim().min(1, 'Leader note is required').max(4000)
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
	const result = schema.safeParse(input);
	if (!result.success) fail(400, issueMessage(result.error));
	return result.data;
}

/** The requested People the actor may write, deciding Manage records once per Group. */
async function writablePeople(ctx: PersonnelLogBatchContext, ids: string[]): Promise<string[]> {
	const active = (await ctx.personnel.listArchiveCandidates(ids)).filter((person) => !person.archivedAt);
	const allowed = new Map<string | null, boolean>();
	for (const groupId of new Set(active.map((person) => person.groupId))) {
		const decision = await evaluateFeaturePolicy(
			{ auth: ctx.auth },
			POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResourceForGroup(groupId)
		);
		allowed.set(groupId, decision.allowed);
	}
	return active.filter((person) => allowed.get(person.groupId)).map((person) => person.id);
}

async function writeBatch(
	ctx: PersonnelLogBatchContext,
	requested: string[],
	action: string,
	write: (ids: string[]) => Promise<string[]>
): Promise<PersonnelLogBatchResult> {
	const ids = [...new Set(requested)];
	const writable = await writablePeople(ctx, ids);
	const written = new Set(writable.length ? await write(writable) : []);
	if (written.size) {
		await ctx.audit.log({
			action,
			resourceType: 'personnel',
			details: { personnelIds: ids.filter((id) => written.has(id)) }
		});
	}
	return {
		writtenIds: ids.filter((id) => written.has(id)),
		unavailableIds: ids.filter((id) => !written.has(id))
	};
}

/** The same follow-up on each Person's record, so each is tracked and closed on its own. */
export async function createPersonnelFollowUpBatch(
	ctx: PersonnelLogBatchContext,
	input: unknown
): Promise<PersonnelLogBatchResult> {
	const { personnelIds: ids, title, notes, dueDate } = parse(followUpBatchInput, input);
	const createdAt = new Date().toISOString();
	return writeBatch(ctx, ids, 'personnel.follow_up.created', (writable) =>
		ctx.personnelArtifactWrites.createFollowUps(ctx.auth, writable, {
			title,
			notes,
			dueDate,
			createdBy: ctx.auth.userId,
			createdAt
		})
	);
}

export async function createPersonnelLeaderNoteBatch(
	ctx: PersonnelLogBatchContext,
	input: unknown
): Promise<PersonnelLogBatchResult> {
	const { personnelIds: ids, text } = parse(leaderNoteBatchInput, input);
	const createdAt = new Date().toISOString();
	return writeBatch(ctx, ids, 'personnel.leader_note.created', (writable) =>
		ctx.personnelArtifactWrites.createLeaderNotes(ctx.auth, writable, {
			author: ctx.auth.userId,
			text,
			createdAt
		})
	);
}
