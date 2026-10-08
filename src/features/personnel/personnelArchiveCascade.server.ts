import type { PersonnelArtifactArchiveWriter, PersonnelArtifactWritePort } from './contracts';
import {
	archiveLeaderNotesWithPersonnel,
	restoreLeaderNotesWithPersonnel,
	type LeaderNoteArchivePersistence
} from './leaderNoteArchive.server';

function parentArchiveFamilies(writer: PersonnelArtifactArchiveWriter) {
	return [
		{ list: writer.listFollowUpArchiveCandidates, set: writer.setFollowUpArchivedState },
		{ list: writer.listCounselingArchiveCandidates, set: writer.setCounselingArchivedAt },
		{ list: writer.listDocumentArchiveCandidates, set: writer.setDocumentArchivedAt }
	];
}

const ARCHIVE_UPDATE_BATCH_SIZE = 50;

/** Bind note lifecycle updates to the same admitted Person batch. */
function noteArchivePersistence(writer: PersonnelArtifactArchiveWriter): LeaderNoteArchivePersistence {
	return {
		findActive: () => writer.listLeaderNoteArchiveCandidates(null),
		findArchivedWithPersonnel: (archivedAt) => writer.listLeaderNoteArchiveCandidates(archivedAt),
		async setArchivedAt(row, archivedAt) {
			await writer.setLeaderNoteArchivedAt(row, archivedAt);
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

	for (const family of parentArchiveFamilies(writer)) {
		const rows = await family.list(null);

		for (let index = 0; index < rows.length; index += ARCHIVE_UPDATE_BATCH_SIZE) {
			const batch = rows.slice(index, index + ARCHIVE_UPDATE_BATCH_SIZE);
			await Promise.all(batch.map((row) => family.set(row, archivedAt)));
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

	for (const family of parentArchiveFamilies(writer)) {
		const rows = await family.list(personnelArchivedAt);

		for (let index = 0; index < rows.length; index += ARCHIVE_UPDATE_BATCH_SIZE) {
			const batch = rows.slice(index, index + ARCHIVE_UPDATE_BATCH_SIZE);
			await Promise.all(batch.map((row) => family.set(row, null)));
		}
	}
	await restoreLeaderNotesWithPersonnel(noteArchivePersistence(writer), personnelArchivedAt);
}
