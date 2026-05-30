import type {
	PersonnelArchivedArtifact,
	PersonnelArtifactKind,
	PersonnelCounselingRecord,
	PersonnelDocument,
	PersonnelFollowUp,
	PersonnelLeaderNote
} from '$features/personnel/personnel-detail.types';
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

const PERSONNEL_OWNED_ARCHIVE_TABLES = [
	{
		table: 'personnel_follow_ups',
		archiveData: (archivedAt: string) => ({ status: 'archived', archived_at: archivedAt })
	},
	{
		table: 'counseling_records',
		archiveData: (archivedAt: string) => ({ archived_at: archivedAt })
	},
	{
		table: 'personnel_documents',
		archiveData: (archivedAt: string) => ({ archived_at: archivedAt })
	},
	{
		table: 'leader_notes',
		archiveData: (archivedAt: string) => ({ archived_at: archivedAt })
	}
] as const;

export type RestoredPersonnelArchivedArtifact =
	| ({ kind: 'follow-up' } & PersonnelFollowUp)
	| ({ kind: 'counseling' } & PersonnelCounselingRecord)
	| ({ kind: 'document' } & PersonnelDocument)
	| ({ kind: 'note' } & PersonnelLeaderNote);

export async function archivePersonnelOwnedArtifacts(
	ctx: Pick<UseCaseContext, 'store' | 'auth'>,
	personnelIds: string[],
	archivedAt: string
): Promise<void> {
	const uniquePersonnelIds = [...new Set(personnelIds)];
	if (uniquePersonnelIds.length === 0) return;

	for (const { table, archiveData } of PERSONNEL_OWNED_ARCHIVE_TABLES) {
		const rows = await ctx.store.findMany<{ id: string }>(table, ctx.auth.orgId, undefined, {
			inFilters: { personnel_id: uniquePersonnelIds },
			isNull: { archived_at: true },
			select: 'id'
		});

		await Promise.all(rows.map((row) => ctx.store.update(table, ctx.auth.orgId, row.id, archiveData(archivedAt))));
	}
}

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
	if (record.kind === 'follow-up') return record.archivedAt ?? record.updatedAt;
	return record.archivedAt ?? record.createdAt;
}

export async function restorePersonnelArchivedArtifact(
	ctx: UseCaseContext,
	input: { personnelId: string; kind: PersonnelArtifactKind; id: string }
): Promise<RestoredPersonnelArchivedArtifact> {
	switch (input.kind) {
		case 'follow-up':
			return {
				kind: 'follow-up',
				...(await restorePersonnelFollowUp(ctx, { personnelId: input.personnelId, followUpId: input.id }))
			};
		case 'counseling':
			return {
				kind: 'counseling',
				...(await restorePersonnelCounselingRecord(ctx, { personnelId: input.personnelId, recordId: input.id }))
			};
		case 'document':
			return {
				kind: 'document',
				...(await restorePersonnelDocument(ctx, { personnelId: input.personnelId, documentId: input.id }))
			};
		case 'note':
			return {
				kind: 'note',
				...(await restorePersonnelLeaderNote(ctx, { personnelId: input.personnelId, noteId: input.id }))
			};
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
