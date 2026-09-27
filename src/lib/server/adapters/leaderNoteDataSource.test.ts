import { describe, expect, it, vi } from 'vitest';
import { createInMemoryDataStore } from './inMemory';
import { bindLeaderNoteDataSource } from './leaderNoteDataSource';

describe('composed leader-note data source', () => {
	it('deletes only notes strictly older than the archive cutoff', async () => {
		const store = createInMemoryDataStore();
		const note = {
			id: 'active',
			organization_id: 'org-1',
			personnel_id: 'person-1',
			author: 'original-author',
			text: 'Sensitive note',
			created_at: '2025-01-01T00:00:00Z',
			archived_at: null
		};
		const expired = { ...note, id: 'expired', archived_at: '2025-05-30T11:59:59.999Z' };
		const boundary = { ...note, id: 'cutoff', archived_at: '2025-05-30T12:00:00.000Z' };
		const recent = { ...note, id: 'recent', archived_at: '2026-01-01T00:00:00Z' };
		const foreign = { ...expired, id: 'foreign', organization_id: 'org-2' };
		store.seed('leader_notes', [note, expired, boundary, recent, foreign]);
		const source = bindLeaderNoteDataSource(store);
		expect(await source.deleteExpired('org-1', '2025-05-30T12:00:00.000Z')).toBe(1);
		expect(await store.findMany('leader_notes', 'org-1')).toEqual([note, boundary, recent]);
		expect(await store.findMany('leader_notes', 'org-2')).toEqual([foreign]);
		expect(await source.deleteExpired('org-1', '2025-05-30T12:00:00.000Z')).toBe(0);
	});

	it('propagates failed candidate reads without deleting notes', async () => {
		const store = createInMemoryDataStore();
		store.seed('leader_notes', [{ id: 'note', organization_id: 'org-1', archived_at: '2025-01-01T00:00:00Z' }]);
		const read = vi.spyOn(store, 'findMany').mockRejectedValue(new Error('Notes unavailable'));
		const source = bindLeaderNoteDataSource(store);
		await expect(source.deleteExpired('org-1', '2025-05-30T12:00:00Z')).rejects.toThrow('Notes unavailable');
		read.mockRestore();
		expect(await store.findMany('leader_notes', 'org-1')).toEqual([
			{ id: 'note', organization_id: 'org-1', archived_at: '2025-01-01T00:00:00Z' }
		]);
	});
});
