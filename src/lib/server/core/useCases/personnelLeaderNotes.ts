import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelLeaderNote } from '$features/personnel/personnel-detail.types';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { policyResourceForPersonnel, requireFeaturePolicy } from './featurePolicy';
import { loadPersonnelContributorLabels, resolveContributorLabel } from './personnelContributorLabels';

interface LeaderNoteRow {
	id: string;
	personnel_id: string;
	author: string;
	text: string;
	created_at: string;
	archived_at?: string | null;
}

export const personnelLeaderNoteInputSchema = z.object({
	personnelId: z.string().min(1),
	text: z.string().trim().min(1, 'Leader note is required').max(4000)
});

export type PersonnelLeaderNoteInput = z.infer<typeof personnelLeaderNoteInputSchema>;

function mapLeaderNoteRow(row: LeaderNoteRow, contributorLabels = new Map<string, string>()): PersonnelLeaderNote {
	return {
		id: row.id,
		personnelId: row.personnel_id,
		author: resolveContributorLabel(contributorLabels, row.author),
		date: row.created_at.slice(0, 10),
		text: row.text,
		createdAt: row.created_at,
		archivedAt: row.archived_at ?? null
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
	limit?: number,
	options: { archived?: boolean } = {}
): Promise<PersonnelLeaderNote[]> {
	await requirePersonnelOperate(ctx, personnelId);

	const rows = await ctx.store.findMany<LeaderNoteRow>(
		'leader_notes',
		ctx.auth.orgId,
		{ personnel_id: personnelId },
		{
			orderBy: [{ column: 'created_at', ascending: false }],
			isNull: { archived_at: !options.archived },
			limit
		}
	);

	const labels = await loadPersonnelContributorLabels(
		ctx,
		rows.map((row) => row.author)
	);
	return rows.map((row) => mapLeaderNoteRow(row, labels));
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

	const labels = await loadPersonnelContributorLabels(ctx, [row.author]);
	return mapLeaderNoteRow(row, labels);
}

async function loadLeaderNote(ctx: UseCaseContext, personnelId: string, noteId: string): Promise<LeaderNoteRow> {
	await requirePersonnelOperate(ctx, personnelId);
	const row = await ctx.store.findOne<LeaderNoteRow>('leader_notes', ctx.auth.orgId, {
		id: noteId,
		personnel_id: personnelId
	});
	if (!row) fail(404, 'Leader note not found');
	return row;
}

export async function archivePersonnelLeaderNote(
	ctx: UseCaseContext,
	input: { personnelId: string; noteId: string }
): Promise<PersonnelLeaderNote> {
	const existing = await loadLeaderNote(ctx, input.personnelId, input.noteId);
	if (existing.archived_at) fail(409, 'Leader note is already archived');
	const row = await ctx.store.update<LeaderNoteRow>('leader_notes', ctx.auth.orgId, input.noteId, {
		archived_at: new Date().toISOString()
	});
	ctx.audit.log({ action: 'personnel.leader_note.archived', resourceType: 'personnel', resourceId: input.personnelId });
	const labels = await loadPersonnelContributorLabels(ctx, [row.author]);
	return mapLeaderNoteRow(row, labels);
}

export async function restorePersonnelLeaderNote(
	ctx: UseCaseContext,
	input: { personnelId: string; noteId: string }
): Promise<PersonnelLeaderNote> {
	await loadLeaderNote(ctx, input.personnelId, input.noteId);
	const row = await ctx.store.update<LeaderNoteRow>('leader_notes', ctx.auth.orgId, input.noteId, {
		archived_at: null
	});
	ctx.audit.log({ action: 'personnel.leader_note.restored', resourceType: 'personnel', resourceId: input.personnelId });
	const labels = await loadPersonnelContributorLabels(ctx, [row.author]);
	return mapLeaderNoteRow(row, labels);
}

export async function deletePersonnelLeaderNote(
	ctx: UseCaseContext,
	input: { personnelId: string; noteId: string }
): Promise<void> {
	const row = await loadLeaderNote(ctx, input.personnelId, input.noteId);
	if (!row.archived_at) fail(409, 'Archive leader notes before deleting them');
	await ctx.store.delete('leader_notes', ctx.auth.orgId, input.noteId);
	ctx.audit.log({ action: 'personnel.leader_note.deleted', resourceType: 'personnel', resourceId: input.personnelId });
}
