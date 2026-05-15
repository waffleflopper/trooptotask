import type { PersonnelArchivedArtifact, PersonnelArtifactKind } from '$features/personnel/personnel-detail.types';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import {
	deletePersonnelCounselingRecord,
	listPersonnelCounselingRecords,
	restorePersonnelCounselingRecord
} from './personnelCounselingRecords';
import { deletePersonnelDocument, listPersonnelDocuments, restorePersonnelDocument } from './personnelDocuments';
import { deletePersonnelFollowUp, listPersonnelFollowUps, restorePersonnelFollowUp } from './personnelFollowUps';
import {
	deletePersonnelLeaderNote,
	listPersonnelLeaderNotes,
	restorePersonnelLeaderNote
} from './personnelLeaderNotes';

export async function listPersonnelArchivedArtifacts(
	ctx: UseCaseContext,
	personnelId: string
): Promise<PersonnelArchivedArtifact[]> {
	const [followUps, counselings, documents, notes] = await Promise.all([
		listPersonnelFollowUps(ctx, personnelId, undefined, { archived: true }),
		listPersonnelCounselingRecords(ctx, personnelId, undefined, { archived: true }),
		listPersonnelDocuments(ctx, personnelId, undefined, { archived: true }),
		listPersonnelLeaderNotes(ctx, personnelId, undefined, { archived: true })
	]);

	return [
		...followUps.map((record) => ({ ...record, kind: 'follow-up' as const })),
		...counselings.map((record) => ({ ...record, kind: 'counseling' as const, archivedAt: record.archivedAt ?? null })),
		...documents.map((record) => ({ ...record, kind: 'document' as const, archivedAt: record.archivedAt ?? null })),
		...notes.map((record) => ({ ...record, kind: 'note' as const, archivedAt: record.archivedAt ?? null }))
	].sort((a, b) => artifactArchivedAt(b).localeCompare(artifactArchivedAt(a)));
}

function artifactArchivedAt(record: PersonnelArchivedArtifact): string {
	if (record.kind === 'follow-up') return record.updatedAt;
	return record.archivedAt ?? record.createdAt;
}

export async function restorePersonnelArchivedArtifact(
	ctx: UseCaseContext,
	input: { personnelId: string; kind: PersonnelArtifactKind; id: string }
): Promise<unknown> {
	switch (input.kind) {
		case 'follow-up':
			return restorePersonnelFollowUp(ctx, { personnelId: input.personnelId, followUpId: input.id });
		case 'counseling':
			return restorePersonnelCounselingRecord(ctx, { personnelId: input.personnelId, recordId: input.id });
		case 'document':
			return restorePersonnelDocument(ctx, { personnelId: input.personnelId, documentId: input.id });
		case 'note':
			return restorePersonnelLeaderNote(ctx, { personnelId: input.personnelId, noteId: input.id });
		default:
			fail(400, 'Unknown archived item type');
	}
}

export async function deletePersonnelArchivedArtifact(
	ctx: UseCaseContext,
	input: { personnelId: string; kind: PersonnelArtifactKind; id: string }
): Promise<void> {
	switch (input.kind) {
		case 'follow-up':
			return deletePersonnelFollowUp(ctx, { personnelId: input.personnelId, followUpId: input.id });
		case 'counseling':
			return deletePersonnelCounselingRecord(ctx, { personnelId: input.personnelId, recordId: input.id });
		case 'document':
			return deletePersonnelDocument(ctx, { personnelId: input.personnelId, documentId: input.id });
		case 'note':
			return deletePersonnelLeaderNote(ctx, { personnelId: input.personnelId, noteId: input.id });
		default:
			fail(400, 'Unknown archived item type');
	}
}
