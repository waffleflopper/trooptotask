import type { PersonnelArtifactRef } from './contracts';

/** Persistence bound to an already admitted set of People. */
export interface LeaderNoteArchivePersistence {
	findActive(): Promise<PersonnelArtifactRef[]>;
	findArchivedWithPersonnel(archivedAt: string): Promise<PersonnelArtifactRef[]>;
	setArchivedAt(row: PersonnelArtifactRef, archivedAt: string | null): Promise<void>;
}

const ARCHIVE_UPDATE_BATCH_SIZE = 50;

async function updateNotes(
	persistence: LeaderNoteArchivePersistence,
	rows: PersonnelArtifactRef[],
	archivedAt: string | null
): Promise<void> {
	for (let index = 0; index < rows.length; index += ARCHIVE_UPDATE_BATCH_SIZE) {
		await Promise.all(
			rows.slice(index, index + ARCHIVE_UPDATE_BATCH_SIZE).map((row) => persistence.setArchivedAt(row, archivedAt))
		);
	}
}

/** Parent archive/review policy is checked by the caller before applying these effects. */
export async function archiveLeaderNotesWithPersonnel(
	persistence: LeaderNoteArchivePersistence,
	archivedAt: string
): Promise<void> {
	await updateNotes(persistence, await persistence.findActive(), archivedAt);
}

/** Independently archived notes keep their original archive state. */
export async function restoreLeaderNotesWithPersonnel(
	persistence: LeaderNoteArchivePersistence,
	personnelArchivedAt: string
): Promise<void> {
	await updateNotes(persistence, await persistence.findArchivedWithPersonnel(personnelArchivedAt), null);
}
