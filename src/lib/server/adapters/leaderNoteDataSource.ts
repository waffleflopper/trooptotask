import type { DataStore } from '../core/ports';
import { createLeaderNoteDataSource, type LeaderNoteExportRecord } from '$features/personnel/index.server';

/** Bind only after Organization export policy or cron admission, using that delivery's existing store. */
export function bindLeaderNoteDataSource(store: Pick<DataStore, 'findMany' | 'deleteManyByIds'>) {
	return createLeaderNoteDataSource({
		exportRows: (orgId) => store.findMany<LeaderNoteExportRecord>('leader_notes', orgId),
		findArchivedBefore: (orgId, cutoff) =>
			store.findMany<{ id: string }>('leader_notes', orgId, undefined, {
				select: 'id',
				rangeFilters: [{ column: 'archived_at', op: 'lt', value: cutoff }],
				isNull: { archived_at: false }
			}),
		deleteByIds: (orgId, ids) => store.deleteManyByIds('leader_notes', orgId, ids)
	});
}
