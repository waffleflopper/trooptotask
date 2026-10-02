import type { PersonnelArtifactArchiveWriter, PersonnelArtifactTable, PersonnelArtifactWritePort } from './contracts';
import {
	archiveLeaderNotesWithPersonnel,
	restoreLeaderNotesWithPersonnel,
	type LeaderNoteArchivePersistence
} from './leaderNoteArchive.server';

interface ParentArtifactArchiveSpec {
	table: PersonnelArtifactTable;
	filters?: { status: 'open' };
	archivePatch(archivedAt: string): Record<string, unknown>;
	restorePatch(): Record<string, unknown>;
}

const parentArtifactArchiveSpecs: ParentArtifactArchiveSpec[] = [
	{
		table: 'personnel_follow_ups',
		filters: { status: 'open' },
		archivePatch: (archivedAt) => ({ status: 'archived', archived_at: archivedAt }),
		restorePatch: () => ({ status: 'open', archived_at: null })
	},
	{
		table: 'counseling_records',
		archivePatch: (archivedAt) => ({ archived_at: archivedAt }),
		restorePatch: () => ({ archived_at: null })
	},
	{
		table: 'personnel_documents',
		archivePatch: (archivedAt) => ({ archived_at: archivedAt }),
		restorePatch: () => ({ archived_at: null })
	}
];

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

interface ArchiveContext {
	auth: Parameters<PersonnelArtifactWritePort['forPeople']>[0];
	personnelArtifactWrites?: Pick<PersonnelArtifactWritePort, 'forPeople'>;
}

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

	for (const { table, filters, archivePatch } of parentArtifactArchiveSpecs) {
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

	for (const { table, restorePatch } of parentArtifactArchiveSpecs) {
		const rows = await writer.listCandidates(table, { archivedAt: personnelArchivedAt });

		for (let index = 0; index < rows.length; index += ARCHIVE_UPDATE_BATCH_SIZE) {
			const batch = rows.slice(index, index + ARCHIVE_UPDATE_BATCH_SIZE);
			await Promise.all(batch.map((row) => writer.update(table, row, restorePatch())));
		}
	}
	await restoreLeaderNotesWithPersonnel(noteArchivePersistence(writer), personnelArchivedAt);
}
