import type { PersonnelArchivedArtifact } from '$features/personnel/personnel-detail.types';
import type { UseCaseContext } from '$lib/server/core/ports';
import type { PersonnelArtifactArchiveWriter } from '$features/personnel/contracts';
import { listPersonnelCounselingRecords } from './personnelCounselingRecords';
import { listPersonnelDocuments } from './personnelDocuments';
import { listPersonnelFollowUps } from './personnelFollowUps';
import {
	archiveLeaderNotesWithPersonnel,
	listPersonnelLeaderNotes,
	restoreLeaderNotesWithPersonnel
} from '$features/personnel/index.server';
import type { LeaderNoteArchivePersistence, LeaderNoteContext } from '$features/personnel/index.server';
import { personnelOwnedArchiveSpecs } from './personnelArtifactLifecycle';

const ARCHIVE_UPDATE_BATCH_SIZE = 50;

/** Bind note lifecycle updates to the same admitted Person batch. */
function noteArchivePersistence(writer: PersonnelArtifactArchiveWriter): LeaderNoteArchivePersistence {
	return {
		findActive: () => writer.listCandidates('leader_notes', { archivedAt: null }),
		findArchivedWithPersonnel: (archivedAt) => writer.listCandidates('leader_notes', { archivedAt }),
		async setArchivedAt(row, archivedAt) {
			await writer.update('leader_notes', row, { archived_at: archivedAt });
		}
	};
}

type ArchiveContext = Pick<UseCaseContext, 'auth' | 'personnelArtifactWrites'>;

async function boundArchiveWriter(ctx: ArchiveContext, ids: string[], action: 'archive' | 'restore') {
	if (!ctx.personnelArtifactWrites) throw new Error('Personnel artifact write port is required');
	return ctx.personnelArtifactWrites.forPeople(ctx.auth, ids, action);
}

export async function archivePersonnelOwnedArtifacts(
	ctx: ArchiveContext,
	personnelIds: string[],
	archivedAt: string
): Promise<void> {
	const uniquePersonnelIds = [...new Set(personnelIds)];
	if (uniquePersonnelIds.length === 0) return;
	const writer = await boundArchiveWriter(ctx, uniquePersonnelIds, 'archive');

	for (const { table, filters, archivePatch } of personnelOwnedArchiveSpecs()) {
		const rows = await writer.listCandidates(table, {
			archivedAt: null,
			status: filters?.status
		});

		for (let index = 0; index < rows.length; index += ARCHIVE_UPDATE_BATCH_SIZE) {
			const batch = rows.slice(index, index + ARCHIVE_UPDATE_BATCH_SIZE);
			await Promise.all(batch.map((row) => writer.update(table, row, archivePatch(archivedAt))));
		}
	}
	await archiveLeaderNotesWithPersonnel(noteArchivePersistence(writer), archivedAt);
}

export async function restorePersonnelOwnedArtifacts(
	ctx: ArchiveContext,
	personnelIds: string[],
	personnelArchivedAt: string
): Promise<void> {
	const uniquePersonnelIds = [...new Set(personnelIds)];
	if (uniquePersonnelIds.length === 0) return;
	const writer = await boundArchiveWriter(ctx, uniquePersonnelIds, 'restore');

	for (const { table, restorePatch } of personnelOwnedArchiveSpecs()) {
		const rows = await writer.listCandidates(table, { archivedAt: personnelArchivedAt });

		for (let index = 0; index < rows.length; index += ARCHIVE_UPDATE_BATCH_SIZE) {
			const batch = rows.slice(index, index + ARCHIVE_UPDATE_BATCH_SIZE);
			await Promise.all(batch.map((row) => writer.update(table, row, restorePatch())));
		}
	}
	await restoreLeaderNotesWithPersonnel(noteArchivePersistence(writer), personnelArchivedAt);
}

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
