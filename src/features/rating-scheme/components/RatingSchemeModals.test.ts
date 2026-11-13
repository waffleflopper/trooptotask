// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import RatingSchemeModals from './RatingSchemeModals.svelte';
import {
	loadRatingSchemeEntries,
	ratingSchemeEntries,
	ratingSchemeEntryFixture,
	ratingSchemeStore
} from '../ratingSchemeStore.test-support.svelte';

const entry = ratingSchemeEntryFixture({
	id: 'entry-1',
	ratingSchemeId: 'scheme-1',
	ratedPersonId: 'rated-1',
	raterPersonId: 'rater-1',
	seniorRaterPersonId: 'senior-1',
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-12-31',
	workflowStatus: null
});

const personnelLookup = [
	{ id: 'rated-1', rank: 'SGT', lastName: 'Rated', firstName: 'Riley' },
	{ id: 'rater-1', rank: 'SSG', lastName: 'Rater', firstName: 'Robin' },
	{ id: 'senior-1', rank: 'SFC', lastName: 'Senior', firstName: 'Sam' }
];

function renderModals() {
	const modals = new ModalRegistry();
	modals.open('rating-modal', { entry });
	render(RatingSchemeModals, {
		props: { orgId: 'org-1', modals, personnelLookup, onRequestDeletion: async () => false }
	});
	return modals;
}

describe('RatingSchemeModals edit feedback', () => {
	beforeEach(() => loadRatingSchemeEntries([entry], 'org-1'));

	afterEach(() => {
		cleanup();
		loadRatingSchemeEntries([], 'org-cleanup');
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each([
		[404, 'Evaluation not found', 'Evaluation not found'],
		[500, 'Internal server error', 'Failed to update rating entry']
	])('keeps a rejected edit open and shows the reason for a %i', async (status, serverMessage, shown) => {
		const fetched: string[] = [];
		vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
			fetched.push(`${init.method} ${input}`);
			return Response.json({ message: serverMessage }, { status });
		});
		const modals = renderModals();

		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Counseled monthly' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(shown));
		expect(fetched).toEqual(['PUT /org/org-1/api/evaluations']);
		expect(modals.isOpen('rating-modal')).toBe(true);
		expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Counseled monthly');
		expect(ratingSchemeEntries.items).toEqual([entry]);
	});

	it('archives the rating scheme and updates the listed row in place', async () => {
		const archivedAt = '2026-06-01T00:00:00.000Z';
		const fetched: string[] = [];
		vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
			fetched.push(`${input} ${init.body}`);
			return Response.json({ changed: true, ratingScheme: { ...ratingSchemeStore.items[0], archivedAt } });
		});
		const modals = renderModals();

		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

		await waitFor(() => expect(screen.getByRole('button', { name: 'Restore to rating scheme' })).toBeTruthy());
		expect(fetched).toEqual(['/org/org-1/api/rating-scheme/scheme-1/archive {"archived":true}']);
		expect(ratingSchemeEntries.items).toEqual([{ ...entry, archivedAt }]);
		expect(modals.isOpen('rating-modal')).toBe(true);
	});

	it('keeps the row listed and shows the reason when the archive is refused', async () => {
		vi.stubGlobal('fetch', async () => Response.json({ message: 'Rating scheme not found' }, { status: 404 }));
		renderModals();

		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Rating scheme not found'));
		expect(ratingSchemeEntries.items).toEqual([entry]);
	});
});
