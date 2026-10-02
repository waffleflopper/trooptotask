import type { PersonnelArchivedArtifact } from './contracts';
import type { PersonnelArtifactsContext } from './personnelArtifactContext.server';
import { listPersonnelCounselingRecords } from './personnelCounselingRecords.server';
import { listPersonnelDocuments } from './personnelDocuments.server';
import { listPersonnelFollowUps } from './personnelFollowUps.server';
import { listPersonnelLeaderNotes, type LeaderNoteContext } from './leaderNotes.server';

export async function listPersonnelArchivedArtifacts(
	ctx: PersonnelArtifactsContext,
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
