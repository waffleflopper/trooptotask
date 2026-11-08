import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import { evaluateFeaturePolicy, policyResourceForGroup } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { dateOnlySchema, issueMessage, uuidSchema } from '$lib/utils/inputSchemas';
import { z } from 'zod';
import {
	PERSONNEL_FIELD_BATCH_LIMIT,
	type PersonnelFieldBulkResult,
	type PersonnelFieldChange,
	type PersonnelRecordPersistence
} from './contracts';
import { normalizeActivePersonnelRank } from './rankValidation.server';

interface PersonnelFieldBulkContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	personnel: Pick<PersonnelRecordPersistence, 'listArchiveCandidates' | 'setEditableField'>;
	loadRankCatalog: Parameters<typeof normalizeActivePersonnelRank>[0]['loadRankCatalog'];
}

const TEXT_FIELD_LIMIT = 100;

const personnelIds = z
	.array(uuidSchema, 'Choose People to update')
	.min(1, 'Choose People to update')
	.max(PERSONNEL_FIELD_BATCH_LIMIT, `Update at most ${PERSONNEL_FIELD_BATCH_LIMIT} People at a time`);
const text = (label: string) =>
	z
		.string({ error: `${label} is required` })
		.trim()
		.min(1, `${label} is required`)
		.max(TEXT_FIELD_LIMIT, `${label} must be ${TEXT_FIELD_LIMIT} characters or fewer`);

const fieldBatchInput = z.discriminatedUnion('field', [
	z.object({ personnelIds, field: z.literal('rank'), value: text('Rank') }),
	z.object({ personnelIds, field: z.literal('mos'), value: text('MOS') }),
	z.object({ personnelIds, field: z.literal('clinicRole'), value: text('Duty role') }),
	z.object({ personnelIds, field: z.literal('ets'), value: dateOnlySchema })
]);

/**
 * Sets one field for many People. Each Person is judged on their own Group: People the actor cannot manage
 * come back refused, and People who are missing, archived or unreadable come back unavailable. Neither stops the rest.
 */
export async function setPersonnelField(
	ctx: PersonnelFieldBulkContext,
	input: Record<string, unknown>
): Promise<PersonnelFieldBulkResult> {
	const parsed = fieldBatchInput.safeParse(input);
	if (!parsed.success) fail(400, issueMessage(parsed.error));
	const { personnelIds: requested, ...request } = parsed.data;
	const change: PersonnelFieldChange =
		request.field === 'rank'
			? { field: 'rank', value: await normalizeActivePersonnelRank(ctx, request.value) }
			: request;
	const ids = [...new Set(requested)];

	const active = (await ctx.personnel.listArchiveCandidates(ids)).filter((person) => !person.archivedAt);
	const mayManage = new Map<string | null, boolean>();
	for (const groupId of new Set(active.map((person) => person.groupId))) {
		const decision = await evaluateFeaturePolicy(
			ctx,
			POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResourceForGroup(groupId)
		);
		mayManage.set(groupId, decision.allowed);
	}
	const writable = active.filter((person) => mayManage.get(person.groupId)).map((person) => person.id);
	const refused = new Set(active.filter((person) => !mayManage.get(person.groupId)).map((person) => person.id));
	const updated = new Set(writable.length ? await ctx.personnel.setEditableField(writable, change) : []);

	return {
		field: change.field,
		value: change.value,
		updatedIds: ids.filter((id) => updated.has(id)),
		refusedIds: ids.filter((id) => refused.has(id)),
		unavailableIds: ids.filter((id) => !updated.has(id) && !refused.has(id))
	};
}
