/** The retained raw Organization export shape, distinct from the labeled page DTO. */
export type LeaderNoteExportRecord = {
	id: string;
	organization_id: string;
	personnel_id: string;
	author: string;
	text: string;
	created_at: string;
	archived_at: string | null;
};

export interface LeaderNoteDataSource {
	exportRows(orgId: string): Promise<LeaderNoteExportRecord[]>;
	deleteExpired(orgId: string, cutoff: string): Promise<number>;
}

/** Typed persistence bound by export/cron delivery to its existing authorized store. */
export interface LeaderNoteSourcePersistence {
	exportRows(orgId: string): Promise<LeaderNoteExportRecord[]>;
	findArchivedBefore(orgId: string, cutoff: string): Promise<Array<{ id: string }>>;
	deleteByIds(orgId: string, ids: string[]): Promise<number>;
}

export function createLeaderNoteDataSource(persistence: LeaderNoteSourcePersistence): LeaderNoteDataSource {
	return {
		exportRows: (orgId) => persistence.exportRows(orgId),
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
