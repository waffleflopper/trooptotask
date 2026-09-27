export interface LeaderNoteDataSource {
	deleteExpired(orgId: string, cutoff: string): Promise<number>;
}

/** Typed persistence bound by the archive cleanup delivery. */
export interface LeaderNoteSourcePersistence {
	findArchivedBefore(orgId: string, cutoff: string): Promise<Array<{ id: string }>>;
	deleteByIds(orgId: string, ids: string[]): Promise<number>;
}

export function createLeaderNoteDataSource(persistence: LeaderNoteSourcePersistence): LeaderNoteDataSource {
	return {
		async deleteExpired(orgId, cutoff) {
			const rows = await persistence.findArchivedBefore(orgId, cutoff);
			if (rows.length === 0) return 0;
			return persistence.deleteByIds(
				orgId,
				rows.map((row) => row.id)
			);
		}
	};
}
