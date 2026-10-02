import type { PersonnelArchivedArtifact } from '$features/personnel/personnel-detail.types';
import type { UseCaseContext } from '$lib/server/core/ports';
import { listPersonnelCounselingRecords } from './personnelCounselingRecords';
import { listPersonnelDocuments } from './personnelDocuments';
import { listPersonnelFollowUps } from './personnelFollowUps';
import { listPersonnelLeaderNotes, type LeaderNoteContext } from '$features/personnel/index.server';

export async function listPersonnelArchivedArtifacts(
	ctx: UseCaseContext,
	noteContext: LeaderNoteContext,
	personnelId: string
): Promise<PersonnelArchivedArtifact[]> {
	const [followUps, counselings, documents, notes] = await Promise.all([
		listPersonnelFollowUps(ctx, personnelId, undefined, { archived: true }),
		listPersonnelCounselingRecords(ctx, personnelId, undefined, { archived: true }),
		listPersonnelDocuments(ctx, personnelId, undefined, { archived: true }),
		listPersonnelLeaderNotes(noteContext, personnelId, undefined, { archived: true })
	]);

	return [
		...followUps.map((record) => ({ ...record, kind: 'follow-up' as const })),
		...counselings.map((record) => ({ ...record, kind: 'counseling' as const, archivedAt: record.archivedAt ?? null })),
		...documents.map((record) => ({ ...record, kind: 'document' as const, archivedAt: record.archivedAt ?? null })),
		...notes.map((record) => ({ ...record, kind: 'note' as const, archivedAt: record.archivedAt ?? null }))
	].sort((a, b) => artifactArchivedAt(b).localeCompare(artifactArchivedAt(a)));
}

function artifactArchivedAt(record: PersonnelArchivedArtifact): string {
	if (record.kind === 'follow-up') return record.archivedAt ?? record.updatedAt;
	return record.archivedAt ?? record.createdAt;
}
