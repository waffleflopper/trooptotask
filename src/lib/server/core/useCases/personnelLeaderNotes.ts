import { z } from 'zod';
import type { PersonnelLeaderNote } from '$features/personnel/personnel-detail.types';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import {
	archiveArtifact,
	deleteArtifact,
	listArtifacts,
	loadPersonnelContributorLabels,
	mapLeaderNoteRow,
	PERSONNEL_LEADER_NOTE_SPEC,
	requirePersonnelArtifactAccess,
	restoreArtifact,
	type LeaderNoteRow
} from './personnelArtifactLifecycle';

export const personnelLeaderNoteInputSchema = z.object({
	personnelId: z.string().min(1),
	text: z.string().trim().min(1, 'Leader note is required').max(4000)
});

export type PersonnelLeaderNoteInput = z.infer<typeof personnelLeaderNoteInputSchema>;

export async function listPersonnelLeaderNotes(
	ctx: UseCaseContext,
	personnelId: string,
	limit?: number,
	options: { archived?: boolean } = {}
): Promise<PersonnelLeaderNote[]> {
	return listArtifacts(ctx, PERSONNEL_LEADER_NOTE_SPEC, personnelId, { limit, archived: options.archived });
}

export async function createPersonnelLeaderNote(ctx: UseCaseContext, rawInput: unknown): Promise<PersonnelLeaderNote> {
	const parsed = personnelLeaderNoteInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}

	const input = parsed.data;
	await requirePersonnelArtifactAccess(ctx, input.personnelId);

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

export async function archivePersonnelLeaderNote(
	ctx: UseCaseContext,
	input: { personnelId: string; noteId: string }
): Promise<PersonnelLeaderNote> {
	return archiveArtifact(ctx, PERSONNEL_LEADER_NOTE_SPEC, { personnelId: input.personnelId, id: input.noteId });
}

export async function restorePersonnelLeaderNote(
	ctx: UseCaseContext,
	input: { personnelId: string; noteId: string }
): Promise<PersonnelLeaderNote> {
	return restoreArtifact(ctx, PERSONNEL_LEADER_NOTE_SPEC, { personnelId: input.personnelId, id: input.noteId });
}

export async function deletePersonnelLeaderNote(
	ctx: UseCaseContext,
	input: { personnelId: string; noteId: string }
): Promise<void> {
	return deleteArtifact(ctx, PERSONNEL_LEADER_NOTE_SPEC, { personnelId: input.personnelId, id: input.noteId });
}
