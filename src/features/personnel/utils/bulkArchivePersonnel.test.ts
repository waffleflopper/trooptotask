import { afterEach, describe, expect, it, vi } from 'vitest';
import { bulkArchivePersonnel } from './bulkArchivePersonnel';

describe('bulkArchivePersonnel', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('sends one request for all selected personnel ids', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				archivedIds: ['p-1', 'p-2'],
				approvalRequestedIds: [],
				errors: []
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await bulkArchivePersonnel('org-1', ['p-1', 'p-2']);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/archive-batch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids: ['p-1', 'p-2'] })
		});
		expect(result.archivedIds).toEqual(['p-1', 'p-2']);
	});
	it.each([
		['a null result', null],
		['an unconfirmed target', { archivedIds: ['p-1'], approvalRequestedIds: [], errors: [] }],
		['an unselected target', { archivedIds: ['foreign', 'p-2'], approvalRequestedIds: [], errors: [] }],
		['contradictory acknowledgements', { archivedIds: ['p-1'], approvalRequestedIds: ['p-1'], errors: [] }]
	])('rejects %s before callers can apply local acknowledgements', async (_reason, result) => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
		vi.stubGlobal('fetch', fetchMock);
		await expect(bulkArchivePersonnel('org-1', ['p-1', 'p-2'])).rejects.toThrow();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
