// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RatingSchemePageView from './RatingSchemePageView.svelte';
import { RatingSchemePageContext, type RatingSchemePageData } from '../contexts/RatingSchemePageContext.svelte';
import { ratingSchemeStore } from '../stores/ratingScheme.svelte';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { createTestOrgContext, NONE_TEST_CAPABILITY_MAP } from '$lib/test-support/orgContextBuilder';

const { exportRatingSchemeMock } = vi.hoisted(() => ({
	exportRatingSchemeMock: vi.fn(async () => undefined)
}));

vi.mock('$features/rating-scheme/utils/ratingSchemeExport', () => ({
	exportRatingScheme: exportRatingSchemeMock
}));

const entries: RatingSchemeEntry[] = [
	{
		id: 'overdue',
		ratedPersonId: 'p1',
		evalType: 'NCOER',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2025-01-01',
		ratingPeriodEnd: '2025-12-31',
		status: 'active',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'drafting'
	},
	{
		id: 'due-30',
		ratedPersonId: 'p2',
		evalType: 'OER',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2026-04-01',
		ratingPeriodEnd: '2026-05-15',
		status: 'active',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'with-rater'
	}
];

function makeOrg() {
	return createTestOrgContext({
		userRole: 'member',
		capabilityMap: { ...NONE_TEST_CAPABILITY_MAP, ratingScheme: 'operate' }
	});
}

function makeContext(modals = new ModalRegistry()): RatingSchemePageContext {
	const org = makeOrg();
	const data: RatingSchemePageData = {
		orgId: 'org-1',
		orgName: 'Test Org',
		ratingSchemeEntries: entries
	};
	return new RatingSchemePageContext(data, modals, org, entries);
}

describe('RatingSchemePageView', () => {
	beforeEach(() => {
		exportRatingSchemeMock.mockClear();
		ratingSchemeStore.load(entries, 'org-1');
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		ratingSchemeStore.load([], 'org-test-reset');
	});

	it('renders the Evals summary with only overdue, 60d, and 30d stats', () => {
		render(RatingSchemePageView, {
			props: {
				ctx: makeContext(),
				personnelLookup: [
					{ id: 'p1', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' },
					{ id: 'p2', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' }
				]
			}
		});

		const summary = screen.getByLabelText('Evaluation status summary');
		expect(within(summary).getByText('Overdue')).toBeTruthy();
		expect(within(summary).getByText('60d')).toBeTruthy();
		expect(within(summary).getByText('30d')).toBeTruthy();
		expect(screen.getByText('2 of 2 shown')).toBeTruthy();
		expect(within(summary).queryByText('Entries')).toBeNull();
		expect(within(summary).queryByText('Current')).toBeNull();
		expect(within(summary).queryByText('Due Soon')).toBeNull();
		expect(within(summary).queryByText('Access')).toBeNull();
	});

	it('routes Add Entry through the rating scheme page context', async () => {
		const modals = new ModalRegistry();
		const ctx = makeContext(modals);

		render(RatingSchemePageView, {
			props: {
				ctx,
				personnelLookup: [{ id: 'p1', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' }]
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }));

		expect(modals.payload<{ entry: RatingSchemeEntry | null }>('rating-modal')?.entry).toBeNull();
	});

	it('preserves evaluation view and export actions in the shared toolbar', async () => {
		const ctx = makeContext();
		const personnelLookup = [
			{ id: 'p1', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' },
			{ id: 'p2', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' }
		];

		render(RatingSchemePageView, {
			props: {
				ctx,
				personnelLookup
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Table' }));
		expect(ctx.ratingViewMode).toBe('table');

		await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
		await waitFor(() => {
			expect(exportRatingSchemeMock).toHaveBeenCalledWith(ctx.filteredRatingEntries, personnelLookup);
		});
	});
});
