import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelLeaderNote } from '$features/personnel/personnel-detail.types';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { policyResourceForPersonnel, requireFeaturePolicy } from './featurePolicy';

interface LeaderNoteRow {
	id: string;
	personnel_id: string;
	author: string;
	text: string;
	created_at: string;
}

export const personnelLeaderNoteInputSchema = z.object({
	personnelId: z.string().min(1),
	text: z.string().trim().min(1, 'Leader note is required').max(4000)
});

export type PersonnelLeaderNoteInput = z.infer<typeof personnelLeaderNoteInputSchema>;

function mapLeaderNoteRow(row: LeaderNoteRow): PersonnelLeaderNote {
	return {
		id: row.id,
		personnelId: row.personnel_id,
		author: row.author,
		date: row.created_at.slice(0, 10),
		text: row.text,
		createdAt: row.created_at
	};
}

async function requirePersonnelOperate(ctx: UseCaseContext, personnelId: string): Promise<void> {
	const person = await (ctx.rawStore ?? ctx.store).findOne<{ id: string }>(
		'personnel',
		ctx.auth.orgId,
		{ id: personnelId },
		'id'
	);
	if (!person) fail(404, 'Personnel record not found');

	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		await policyResourceForPersonnel(ctx, personnelId),
		'personnel',
		personnelId
	);
	await ctx.auth.requireGroupAccess(personnelId);
}

export async function listPersonnelLeaderNotes(
	ctx: UseCaseContext,
	personnelId: string,
	limit?: number
): Promise<PersonnelLeaderNote[]> {
	await requirePersonnelOperate(ctx, personnelId);

	const rows = await ctx.store.findMany<LeaderNoteRow>(
		'leader_notes',
		ctx.auth.orgId,
		{ personnel_id: personnelId },
		{
			orderBy: [{ column: 'created_at', ascending: false }],
			limit
		}
	);

	return rows.map(mapLeaderNoteRow);
}

export async function createPersonnelLeaderNote(ctx: UseCaseContext, rawInput: unknown): Promise<PersonnelLeaderNote> {
	const parsed = personnelLeaderNoteInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}

	const input = parsed.data;
	await requirePersonnelOperate(ctx, input.personnelId);

	const row = await ctx.store.insert<LeaderNoteRow>('leader_notes', ctx.auth.orgId, {
		personnel_id: input.personnelId,
		author: ctx.auth.userId ?? 'Unknown leader',
		text: input.text,
		created_at: new Date().toISOString()
	});

	ctx.audit.log({
		action: 'personnel.leader_note.created',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	return mapLeaderNoteRow(row);
}
