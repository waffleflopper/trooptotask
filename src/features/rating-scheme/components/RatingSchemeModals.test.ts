// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import RatingSchemeModals from './RatingSchemeModals.svelte';
import type { RatingSchemeEntry } from '../rating-scheme.types';

const entry: RatingSchemeEntry = {
	id: 'entry-1',
	ratedPersonId: 'rated-1',
	evalType: 'NCOER',
	raterPersonId: 'rater-1',
	raterName: null,
	seniorRaterPersonId: 'senior-1',
	seniorRaterName: null,
	intermediateRaterPersonId: null,
	intermediateRaterName: null,
	reviewerPersonId: null,
	reviewerName: null,
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-12-31',
	status: 'active',
	notes: null,
	reportType: 'AN',
	workflowStatus: null
};

const personnelLookup = [
	{ id: 'rated-1', rank: 'SGT', lastName: 'Rated', firstName: 'Riley' },
	{ id: 'rater-1', rank: 'SSG', lastName: 'Rater', firstName: 'Robin' },
	{ id: 'senior-1', rank: 'SFC', lastName: 'Senior', firstName: 'Sam' }
];

describe('RatingSchemeModals edit feedback', () => {
	beforeEach(() => ratingSchemeStore.load([{ ...entry }], 'org-1'));

	afterEach(() => {
		cleanup();
		ratingSchemeStore.load([], 'org-cleanup');
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each([
		[404, 'Rating Scheme entry not found', 'Rating Scheme entry not found'],
		[500, 'Internal server error', 'Failed to update rating entry']
	])('keeps a rejected edit open and shows the reason for a %i', async (status, serverMessage, shown) => {
		vi.stubGlobal('fetch', async () => Response.json({ message: serverMessage }, { status }));
		const modals = new ModalRegistry();
		modals.open('rating-modal', { entry });
		render(RatingSchemeModals, {
			props: { orgId: 'org-1', modals, personnelLookup, onRequestDeletion: async () => false }
		});

		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Counseled monthly' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(shown));
		expect(modals.isOpen('rating-modal')).toBe(true);
		expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Counseled monthly');
		expect(ratingSchemeStore.items).toEqual([entry]);
	});
});
