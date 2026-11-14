import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRatingSchemeEntryEditor } from './ratingSchemeRequests';

describe('loadRatingSchemeEntryEditor', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('never answers an Evaluation from the browser cache', async () => {
		const fetch = vi.fn(async () => Response.json({ ratingScheme: {}, evaluation: {}, personnelLookup: [] }));
		vi.stubGlobal('fetch', fetch);

		await loadRatingSchemeEntryEditor('org-1', 'evaluation-1');

		expect(fetch).toHaveBeenCalledWith(
			'/org/org-1/api/rating-scheme?evaluation=evaluation-1',
			expect.objectContaining({ cache: 'no-store' })
		);
	});
});
