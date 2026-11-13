// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import RatingSchemeModals from './RatingSchemeModals.svelte';
import { loadRatingSchemeEntries, ratingSchemeEntryFixture } from '../ratingSchemeStore.test-support.svelte';

vi.mock('./RatingSchemeEntryModal.svelte', async () => ({
	default: (await import('./RatingSchemeAddTestDouble.svelte')).default
}));

const open = ratingSchemeEntryFixture({
	id: 'open-1',
	ratingSchemeId: 'scheme-1',
	ratedPersonId: 'rated-1',
	raterPersonId: 'rater-1',
	seniorRaterPersonId: 'senior-1',
	workflowStatus: 'drafting'
});

describe('RatingSchemeModals add', () => {
	beforeEach(() => loadRatingSchemeEntries([open], 'org-1'));
	afterEach(() => {
		cleanup();
		loadRatingSchemeEntries([], 'org-cleanup');
		vi.unstubAllGlobals();
	});

	it('refuses to add beside an open Evaluation before it writes the scheme', async () => {
		const fetched: string[] = [];
		vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
			fetched.push(`${init.method} ${input}`);
			return Response.json({});
		});
		const modals = new ModalRegistry();
		modals.open('rating-modal', { entry: null });
		render(RatingSchemeModals, {
			props: { orgId: 'org-1', modals, personnelLookup: [], onRequestDeletion: async () => false }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

		expect((await screen.findByRole('alert')).textContent).toBe(
			'This Person already has an open Evaluation. Finish it before adding another.'
		);
		expect(fetched).toEqual([]);
	});
});
