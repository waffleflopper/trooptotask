// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RatingSchemePageView from './RatingSchemePageView.svelte';
import { RatingSchemePageContext, type RatingSchemePageData } from '../contexts/RatingSchemePageContext.svelte';
import { ratingSchemeStore } from '../stores/ratingScheme.svelte';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

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
	return createClientAccess({
		membershipRole: 'member',
		capabilityMap: { ...createCapabilityMap('none'), ratingScheme: 'operate' }
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

	it('gives an allowed Add Entry no tooltip', () => {
		render(RatingSchemePageView, { props: { ctx: makeContext(), personnelLookup: [] } });

		const addEntry = screen.getByRole('button', { name: 'Add Entry' });
		expect((addEntry as HTMLButtonElement).disabled).toBe(false);
		expect(addEntry.getAttribute('title')).toBeNull();
	});

	describe('entry dialog focus return', () => {
		const personnelLookup = [
			{ id: 'p1', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' },
			{ id: 'p2', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' }
		];

		function renderWithLiveStore() {
			const modals = new ModalRegistry();
			const ctx = new RatingSchemePageContext(
				{ orgId: 'org-1', orgName: 'Test Org', ratingSchemeEntries: entries },
				modals,
				makeOrg()
			);
			render(RatingSchemePageView, { props: { ctx, personnelLookup } });
			return modals;
		}

		async function openEntry(name: RegExp) {
			const row = screen.getByRole('button', { name });
			row.focus();
			await fireEvent.click(row);
			return row;
		}

		it('returns to the edited row after it moves to another group', async () => {
			const modals = renderWithLiveStore();
			const originalRow = await openEntry(/CPT Jones/);
			expect(modals.isOpen('rating-modal')).toBe(true);
			(document.activeElement as HTMLElement | null)?.blur();

			ratingSchemeStore.load(
				entries.map((entry) => (entry.id === 'due-30' ? { ...entry, seniorRaterName: 'New Senior Rater' } : entry)),
				'org-1'
			);
			await tick();
			modals.close('rating-modal');
			await tick();
			await tick();

			const movedRow = screen.getByRole('button', { name: /CPT Jones/ });
			expect(originalRow.isConnected).toBe(false);
			expect(document.activeElement).toBe(movedRow);
		});

		it('returns to Add Entry when the edited row left the list', async () => {
			const modals = renderWithLiveStore();
			await openEntry(/CPT Jones/);
			(document.activeElement as HTMLElement | null)?.blur();

			ratingSchemeStore.load(
				entries.filter((entry) => entry.id !== 'due-30'),
				'org-1'
			);
			await tick();
			modals.close('rating-modal');
			await tick();
			await tick();

			expect(screen.queryByRole('button', { name: /CPT Jones/ })).toBeNull();
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Entry' }));
		});
	});

	it('switches evaluation entries into the table view from the shared toolbar', async () => {
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

		expect(screen.queryByRole('main')).toBeNull();
		const groupedToggle = screen.getByRole('button', { name: 'Grouped' });
		const tableToggle = screen.getByRole('button', { name: 'Table' });

		expect(groupedToggle.getAttribute('aria-pressed')).toBe('true');
		expect(tableToggle.getAttribute('aria-pressed')).toBe('false');
		expect(screen.queryByRole('columnheader', { name: /Rated Individual/ })).toBeNull();

		await fireEvent.click(tableToggle);

		expect(groupedToggle.getAttribute('aria-pressed')).toBe('false');
		expect(tableToggle.getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('columnheader', { name: /Rated Individual/ })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: /Thru Date/ })).toBeTruthy();
		const scrollRegion = screen.getByRole('region', { name: 'Rating scheme entries, scrollable' });
		expect(scrollRegion.tabIndex).toBe(0);
		expect(within(scrollRegion).getByRole('table')).toBeTruthy();
		expect(screen.getByText('SGT Smith, Jane')).toBeTruthy();
		expect(screen.getByText('CPT Jones, Alex')).toBeTruthy();
	});
});
