// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RatingSchemePageView from './RatingSchemePageView.svelte';
import { RatingSchemePageContext, type RatingSchemePageData } from '../contexts/RatingSchemePageContext.svelte';
import { ratingSchemeStore } from '../stores/ratingScheme.svelte';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { openToolbarMore, openToolbarSubmenu, stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import { toastStore } from '$lib/stores/toast.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';

const { exportRatingSchemeMock } = vi.hoisted(() => ({
	exportRatingSchemeMock: vi.fn(async (_entries: unknown[], _personnel: unknown[]) => undefined)
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

const personnelLookup = [
	{ id: 'p1', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' },
	{ id: 'p2', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' }
];

function makeOrg(ratingScheme: 'view' | 'operate' = 'operate') {
	return createClientAccess({
		membershipRole: 'member',
		capabilityMap: { ...createCapabilityMap('none'), ratingScheme }
	});
}

function makeContext(modals = new ModalRegistry(), org = makeOrg()): RatingSchemePageContext {
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

	it('filters the entries by evaluation type from the row', async () => {
		render(RatingSchemePageView, { props: { ctx: makeContext(), personnelLookup } });

		const type = screen.getByRole('button', { name: 'Evaluation type filter' });
		type.focus();
		await fireEvent.keyDown(type, { key: 'ArrowDown' });
		await fireEvent.pointerUp(await screen.findByRole('option', { name: 'OER' }));

		expect(screen.getByText('1 of 2 shown')).toBeTruthy();
		expect(screen.getByRole('button', { name: /CPT Jones/ })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /SGT Smith/ })).toBeNull();
	});

	it('shows the workflow filter only when an entry has a workflow status', () => {
		render(RatingSchemePageView, { props: { ctx: makeContext(), personnelLookup } });
		expect(screen.getByRole('button', { name: 'Evaluation workflow filter' })).toBeTruthy();
		cleanup();

		const withoutWorkflow = entries.map((entry) => ({ ...entry, workflowStatus: null }));
		const ctx = new RatingSchemePageContext(
			{ orgId: 'org-1', orgName: 'Test Org', ratingSchemeEntries: withoutWorkflow },
			new ModalRegistry(),
			makeOrg(),
			withoutWorkflow
		);
		render(RatingSchemePageView, { props: { ctx, personnelLookup } });
		expect(screen.queryByRole('button', { name: 'Evaluation workflow filter' })).toBeNull();
	});

	it('reports no export failure that arrives after the Organization shell ends', async () => {
		let failExport!: (error: Error) => void;
		exportRatingSchemeMock.mockImplementationOnce(() => new Promise((_resolve, reject) => (failExport = reject)));
		const toastError = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(RatingSchemePageView, { props: { ctx: makeContext(), personnelLookup } });

		await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
		await waitFor(() => expect(exportRatingSchemeMock).toHaveBeenCalledTimes(1));
		endOrganizationLifetime();
		failExport(new Error('Workbook failed'));
		await Promise.resolve();
		await tick();

		expect(toastError).not.toHaveBeenCalled();
	});

	describe('when the toolbar folds', () => {
		const toolbarName = 'Evaluation controls';

		afterEach(() => vi.unstubAllGlobals());

		it('keeps the view, every filter and Export working from More with Add Entry pinned on the row', async () => {
			const widths = stubToolbarWidths();
			render(RatingSchemePageView, { props: { ctx: makeContext(), personnelLookup } });
			await widths.foldAll();

			const row = within(screen.getByRole('toolbar', { name: toolbarName }));
			expect(row.queryByRole('button', { name: 'Export' })).toBeNull();
			expect(row.queryByRole('button', { name: 'Table' })).toBeNull();
			expect(row.getByRole('button', { name: 'Add Entry' })).toBeTruthy();

			const menu = await openToolbarMore(toolbarName);
			for (const name of [
				'Evaluation type, Eval Type: All',
				'Evaluation status, Status: Active',
				'Evaluation workflow, Workflow: All'
			]) {
				expect(within(menu).getByRole('menuitem', { name })).toBeTruthy();
			}
			await fireEvent.click(
				within(within(menu).getByRole('group', { name: 'Evaluation view mode' })).getByRole('menuitemradio', {
					name: 'Table'
				})
			);
			expect(await screen.findByRole('columnheader', { name: /Rated Individual/ })).toBeTruthy();

			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			await openToolbarMore(toolbarName);
			await openToolbarSubmenu('Evaluation type, Eval Type: All');
			await fireEvent.click(await screen.findByRole('menuitemradio', { name: 'NCOER' }));
			expect(screen.getByText('1 of 2 shown')).toBeTruthy();

			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			await openToolbarMore(toolbarName);
			expect(screen.getByRole('menuitem', { name: 'Evaluation type, NCOER' })).toBeTruthy();
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
			await waitFor(() => expect(exportRatingSchemeMock).toHaveBeenCalledTimes(1));
			expect(exportRatingSchemeMock.mock.calls[0]?.[0]).toHaveLength(1);
		});

		it('shows the filter dot on More while a folded filter is not at its default', async () => {
			const widths = stubToolbarWidths();
			const ctx = makeContext();
			render(RatingSchemePageView, { props: { ctx, personnelLookup } });
			await widths.foldAll();
			const more = () => screen.getByRole('button', { name: `More ${toolbarName}` });
			expect(more().getAttribute('aria-describedby')).toBeNull();

			ctx.ratingFilter = 'completed';
			await tick();

			const description = document.getElementById(more().getAttribute('aria-describedby') ?? '');
			expect(description?.textContent).toBe('Hidden filters active: Evaluation status');
		});

		it('offers a viewer neither Add Entry on the row nor in More', async () => {
			const widths = stubToolbarWidths();
			render(RatingSchemePageView, {
				props: { ctx: makeContext(new ModalRegistry(), makeOrg('view')), personnelLookup }
			});
			await widths.foldAll();

			expect(screen.queryByRole('button', { name: 'Add Entry' })).toBeNull();
			await openToolbarMore(toolbarName);
			expect(screen.queryByRole('menuitem', { name: 'Add Entry' })).toBeNull();
			expect(screen.getByRole('menuitem', { name: 'Export' })).toBeTruthy();
		});
	});
});
