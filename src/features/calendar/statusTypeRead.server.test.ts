import { describe, expect, it } from 'vitest';
import { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { listStatusTypeExportRows, listStatusTypeLabels, listStatusTypes } from './statusTypeRead.server';

describe('Calendar status-type reads', () => {
	it('returns only this Organization’s statuses in configured order', async () => {
		const store = createInMemoryDataStore();
		store.seed('status_types', [
			{ id: 'second', organization_id: 'alpha', name: 'TDY', color: '#111', text_color: '#fff', sort_order: 2 },
			{ id: 'foreign', organization_id: 'bravo', name: 'Hidden', color: '#222', text_color: '#fff', sort_order: 0 },
			{ id: 'first', organization_id: 'alpha', name: 'Leave', color: '#333', text_color: '#000', sort_order: 1 }
		]);

		expect((await listStatusTypes(store, 'alpha')).map(({ id, name, textColor }) => ({ id, name, textColor }))).toEqual(
			[
				{ id: 'first', name: 'Leave', textColor: '#000' },
				{ id: 'second', name: 'TDY', textColor: '#fff' }
			]
		);
		expect((await listStatusTypeLabels(store, 'alpha')).map(({ id, name }) => ({ id, name }))).toEqual([
			{ id: 'second', name: 'TDY' },
			{ id: 'first', name: 'Leave' }
		]);
		expect((await listStatusTypeExportRows(store, 'alpha')).map((row) => row.id)).toEqual(['second', 'first']);
	});
});
