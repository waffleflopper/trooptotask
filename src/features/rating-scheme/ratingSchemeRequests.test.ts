import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRatingSchemeEntryEditor } from './ratingSchemeRequests';

describe('loadRatingSchemeEntryEditor', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('never answers an entry from the browser cache', async () => {
		const fetch = vi.fn(async () => Response.json({ entry: {}, personnelLookup: [] }));
		vi.stubGlobal('fetch', fetch);

		await loadRatingSchemeEntryEditor('org-1', 'entry-1');

		expect(fetch).toHaveBeenCalledWith('/org/org-1/api/rating-scheme?entry=entry-1', { cache: 'no-store' });
	});
});
