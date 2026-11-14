import { beforeEach, describe, expect, it } from 'vitest';
import {
	evaluationStore,
	ratingSchemeEntries,
	ratingSchemeEntryFixture,
	ratingSchemeStore,
	splitRatingSchemeEntries
} from '../ratingSchemeStore.test-support.svelte';

const signed = ratingSchemeEntryFixture({
	id: 'signed',
	ratingSchemeId: 'scheme-a',
	raterName: 'SSG Signed',
	workflowStatus: 'completed',
	chainSigned: true
});
const open = ratingSchemeEntryFixture({ id: 'open', ratingSchemeId: 'scheme-a', raterName: 'SSG Signed' });

describe('ratingSchemeEntries', () => {
	beforeEach(() => {
		const { ratingSchemes, evaluations } = splitRatingSchemeEntries([signed, open]);
		ratingSchemeStore.load(ratingSchemes, 'org-1');
		evaluationStore.load(evaluations, 'org-1');
	});

	it('lists each Evaluation with its scheme’s chain', () => {
		expect(ratingSchemeEntries.items).toEqual([signed, open]);
	});

	it('keeps the chain that signed a completed Evaluation when the scheme’s chain changes', () => {
		const [scheme] = ratingSchemeStore.items;
		ratingSchemeStore.load([{ ...scheme, raterName: 'SSG Next' }], 'org-1');

		expect(ratingSchemeEntries.items.map(({ id, raterName }) => [id, raterName])).toEqual([
			['signed', 'SSG Signed'],
			['open', 'SSG Next']
		]);
	});

	it('leaves out an Evaluation whose scheme is not loaded', () => {
		ratingSchemeStore.load([], 'org-1');

		expect(ratingSchemeEntries.items).toEqual([]);
	});
});
