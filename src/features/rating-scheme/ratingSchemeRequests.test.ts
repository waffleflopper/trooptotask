import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRatingSchemeEntryEditor, saveRatingSchemeEntry } from './ratingSchemeRequests';

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

describe('saveRatingSchemeEntry', () => {
	afterEach(() => vi.unstubAllGlobals());

	const chain = {
		raterPersonId: 'rater-1',
		raterName: null,
		seniorRaterPersonId: 'senior-1',
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null
	};
	const ratingScheme = {
		id: 'scheme-1',
		ratedPersonId: 'rated-1',
		evalType: 'NCOER' as const,
		notes: null,
		archivedAt: null,
		...chain
	};
	const evaluation = {
		id: 'evaluation-1',
		ratingSchemeId: 'scheme-1',
		ratedPersonId: 'rated-1',
		evalType: 'NCOER' as const,
		reportType: 'AN' as const,
		ratingPeriodStart: '2026-01-01',
		ratingPeriodEnd: '2026-12-31',
		workflowStatus: 'drafting' as const,
		notes: null,
		signedChain: null
	};
	const data = {
		ratedPersonId: 'rated-1',
		evalType: 'NCOER' as const,
		reportType: 'AN' as const,
		ratingPeriodStart: '2026-01-01',
		ratingPeriodEnd: '2026-12-31',
		notes: 'New notes',
		...chain,
		seniorRaterPersonId: 'senior-2'
	};

	it('stops before saving the Evaluation when the dialog closed while the scheme saved', async () => {
		let open = true;
		const fetch = vi.fn(async () => {
			open = false;
			return Response.json({ ...ratingScheme, seniorRaterPersonId: 'senior-2' });
		});
		vi.stubGlobal('fetch', fetch);

		const saved = await saveRatingSchemeEntry('org-1', { ratingScheme, evaluation }, data, () => open);

		expect(saved).toBeUndefined();
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
