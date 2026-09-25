/** Persistence bound to the authorized caller's Organization and scoped store. */
export interface LeaderNoteArchivePersistence {
	findActive(personnelIds: string[]): Promise<Array<{ id: string }>>;
	findArchivedWithPersonnel(personnelIds: string[], archivedAt: string): Promise<Array<{ id: string }>>;
	setArchivedAt(noteId: string, archivedAt: string | null): Promise<void>;
}

const ARCHIVE_UPDATE_BATCH_SIZE = 50;

async function updateNotes(
	persistence: LeaderNoteArchivePersistence,
	rows: Array<{ id: string }>,
	archivedAt: string | null
): Promise<void> {
	for (let index = 0; index < rows.length; index += ARCHIVE_UPDATE_BATCH_SIZE) {
		await Promise.all(
			rows.slice(index, index + ARCHIVE_UPDATE_BATCH_SIZE).map((row) => persistence.setArchivedAt(row.id, archivedAt))
		);
	}
}

/** Parent archive/review policy is checked by the caller before applying these effects. */
export async function archiveLeaderNotesWithPersonnel(
	persistence: LeaderNoteArchivePersistence,
	personnelIds: string[],
	archivedAt: string
): Promise<void> {
	const ids = [...new Set(personnelIds)];
	if (ids.length === 0) return;
	await updateNotes(persistence, await persistence.findActive(ids), archivedAt);
}

/** Independently archived notes keep their original archive state. */
export async function restoreLeaderNotesWithPersonnel(
	persistence: LeaderNoteArchivePersistence,
	personnelIds: string[],
	personnelArchivedAt: string
): Promise<void> {
	const ids = [...new Set(personnelIds)];
	if (ids.length === 0) return;
	await updateNotes(persistence, await persistence.findArchivedWithPersonnel(ids, personnelArchivedAt), null);
}
