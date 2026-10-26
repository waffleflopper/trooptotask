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
import { openToolbarSubmenu, stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import { toastStore } from '$lib/stores/toast.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';

const { exportRatingSchemeMock } = vi.hoisted(() => ({
	exportRatingSchemeMock: vi.fn(async (_entries: unknown[], _personnel: unknown[]) => undefined)
}));

const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/org/org-1/evals'), state: {} }));

vi.mock('$app/state', () => ({ page: pageState }));
vi.mock('$app/navigation', () => ({
	replaceState: (url: URL) => {
		pageState.url = new URL(url);
	}
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
		ratingSchemeEntries: entries,
		personnelLookup
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
		pageState.url = new URL('http://localhost/org/org-1/evals');
	});

	it('opens the entry a person page links to, once', async () => {
		pageState.url = new URL('http://localhost/org/org-1/evals?entry=due-30');
		const modals = new ModalRegistry();
		const ctx = makeContext(modals);
		render(RatingSchemePageView, { props: { ctx, personnelLookup } });
		await tick();

		expect(modals.isOpen('rating-modal')).toBe(true);
		expect(modals.payload<{ entry: { id: string } | null }>('rating-modal')?.entry?.id).toBe('due-30');
		expect(pageState.url.search).toBe('');

		modals.close('rating-modal');
		await tick();

		expect(modals.isOpen('rating-modal')).toBe(false);
	});

	it('leaves a linked entry closed for a viewer who cannot edit it', async () => {
		pageState.url = new URL('http://localhost/org/org-1/evals?entry=due-30');
		const modals = new ModalRegistry();
		render(RatingSchemePageView, { props: { ctx: makeContext(modals, makeOrg('view')), personnelLookup } });
		await tick();

		expect(modals.isOpen('rating-modal')).toBe(false);
	});

	describe('entry dialog focus return', () => {
		const personnelLookup = [
			{ id: 'p1', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' },
			{ id: 'p2', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' }
		];

		function renderWithLiveStore() {
			const modals = new ModalRegistry();
			const ctx = new RatingSchemePageContext(
				{ orgId: 'org-1', orgName: 'Test Org', ratingSchemeEntries: entries, personnelLookup },
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
		expect(screen.queryByRole('columnheader', { name: /Rated Soldier/ })).toBeNull();

		await fireEvent.click(tableToggle);

		expect(groupedToggle.getAttribute('aria-pressed')).toBe('false');
		expect(tableToggle.getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('columnheader', { name: /Rated Soldier/ })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: /Thru/ })).toBeTruthy();
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
			{ orgId: 'org-1', orgName: 'Test Org', ratingSchemeEntries: withoutWorkflow, personnelLookup },
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

	describe('ordering and search', () => {
		const base = entries[0]!;
		const ordered: RatingSchemeEntry[] = [
			{ ...base, id: 'smith', ratedPersonId: 'p1', seniorRaterName: 'Zed Senior', ratingPeriodEnd: '2026-10-20' },
			{ ...base, id: 'jones', ratedPersonId: 'p2', seniorRaterName: 'Alpha Senior', ratingPeriodEnd: '2027-06-30' },
			{ ...base, id: 'adams', ratedPersonId: 'p3', seniorRaterName: 'Zed Senior', ratingPeriodEnd: '2026-11-10' }
		];
		const people = [
			{ id: 'p1', rank: 'SGT', firstName: 'Jane', lastName: 'Smith' },
			{ id: 'p2', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' },
			{ id: 'p3', rank: 'SPC', firstName: 'Ann', lastName: 'Adams' }
		];

		function renderOrdered() {
			const ctx = new RatingSchemePageContext(
				{ orgId: 'org-1', orgName: 'Test Org', ratingSchemeEntries: ordered, personnelLookup: people },
				new ModalRegistry(),
				makeOrg(),
				ordered
			);
			render(RatingSchemePageView, { props: { ctx, personnelLookup: people } });
			return ctx;
		}

		const groupLabels = () => screen.getAllByRole('region').map((region) => region.getAttribute('aria-label') ?? '');

		beforeEach(() => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
		});

		afterEach(() => vi.useRealTimers());

		it('orders senior rater groups by urgency and then by name on request', async () => {
			renderOrdered();
			expect(groupLabels()).toEqual(['Senior rater Zed Senior', 'Senior rater Alpha Senior']);

			const order = screen.getByRole('button', { name: 'Group order' });
			order.focus();
			await fireEvent.keyDown(order, { key: 'ArrowDown' });
			await fireEvent.pointerUp(await screen.findByRole('option', { name: /Senior rater A to Z/ }));

			expect(groupLabels()).toEqual(['Senior rater Alpha Senior', 'Senior rater Zed Senior']);
		});

		it('sorts the table by rated Soldier last name until a header is chosen', async () => {
			renderOrdered();
			await fireEvent.click(screen.getByRole('button', { name: 'Table' }));

			const rows = screen.getAllByRole('row', { name: /^Edit rating entry for / });
			expect(rows.map((row) => row.getAttribute('data-rating-entry-id'))).toEqual(['adams', 'jones', 'smith']);
		});

		it('narrows by search, says nothing matches and clears from the empty state', async () => {
			renderOrdered();
			const search = screen.getByRole('searchbox', { name: 'Search by Soldier or rater' });

			await fireEvent.input(search, { target: { value: 'Smith' } });
			expect(screen.getByText('1 of 3 shown')).toBeTruthy();

			await fireEvent.input(search, { target: { value: 'nobody matches this' } });
			expect(screen.getByText('No entries match')).toBeTruthy();
			expect(screen.queryByRole('button', { name: /SGT Smith/ })).toBeNull();

			await fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
			expect(screen.queryByText('No entries match')).toBeNull();
			expect(screen.getByText('3 of 3 shown')).toBeTruthy();
		});
		it('offers no clear action when only completed entries exist under the default filters', () => {
			const completed = ordered.map((entry) => ({ ...entry, status: 'completed' as const }));
			const ctx = new RatingSchemePageContext(
				{ orgId: 'org-1', orgName: 'Test Org', ratingSchemeEntries: completed, personnelLookup: people },
				new ModalRegistry(),
				makeOrg(),
				completed
			);
			render(RatingSchemePageView, { props: { ctx, personnelLookup: people } });

			expect(screen.getByText('No active entries')).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Clear search and filters' })).toBeNull();
		});
	});

	describe('when the toolbar is narrow', () => {
		const toolbarName = 'Evaluation controls';

		afterEach(() => vi.unstubAllGlobals());

		async function openFilters(): Promise<HTMLElement> {
			const trigger = screen.getByRole('button', { name: 'Filters' });
			trigger.focus();
			await fireEvent.keyDown(trigger, { key: 'Enter' });
			return screen.findByRole('menu');
		}

		it('keeps the view and Add Entry on the row with every filter and Export in Filters', async () => {
			const widths = stubToolbarWidths();
			render(RatingSchemePageView, { props: { ctx: makeContext(), personnelLookup } });
			await widths.foldAll();

			const row = within(screen.getByRole('toolbar', { name: toolbarName }));
			expect(row.queryByRole('button', { name: 'Export' })).toBeNull();
			expect(row.getByRole('button', { name: 'Add Entry' })).toBeTruthy();
			expect(row.getByRole('searchbox', { name: /Search/ })).toBeTruthy();

			const menu = await openFilters();
			for (const name of [
				'Evaluation type, Eval Type: All',
				'Evaluation status, Status: Active',
				'Evaluation workflow, Workflow: All'
			]) {
				expect(within(menu).getByRole('menuitem', { name })).toBeTruthy();
			}
			expect(within(menu).getByRole('menuitem', { name: 'Export' })).toBeTruthy();
			await fireEvent.keyDown(menu, { key: 'Escape' });
			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

			await fireEvent.click(row.getByRole('button', { name: 'Table' }));
			expect(await screen.findByRole('columnheader', { name: /Rated Soldier/ })).toBeTruthy();

			await openFilters();
			await openToolbarSubmenu('Evaluation type, Eval Type: All');
			await fireEvent.click(await screen.findByRole('menuitemradio', { name: 'NCOER' }));
			expect(screen.getByText('1 of 2 shown')).toBeTruthy();

			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			await openFilters();
			expect(screen.getByRole('menuitem', { name: 'Evaluation type, NCOER' })).toBeTruthy();
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
			await waitFor(() => expect(exportRatingSchemeMock).toHaveBeenCalledTimes(1));
			expect(exportRatingSchemeMock.mock.calls[0]?.[0]).toHaveLength(1);
		});

		it('shows the filter dot on Filters while a folded filter is not at its default', async () => {
			const widths = stubToolbarWidths();
			const ctx = makeContext();
			render(RatingSchemePageView, { props: { ctx, personnelLookup } });
			await widths.foldAll();
			const more = () => screen.getByRole('button', { name: 'Filters' });
			expect(more().getAttribute('aria-describedby')).toBeNull();

			ctx.ratingFilter = 'completed';
			await tick();

			const description = document.getElementById(more().getAttribute('aria-describedby') ?? '');
			expect(description?.textContent).toBe('Hidden filters active: Evaluation status');
		});

		it('offers a viewer neither Add Entry on the row nor in Filters', async () => {
			const widths = stubToolbarWidths();
			render(RatingSchemePageView, {
				props: { ctx: makeContext(new ModalRegistry(), makeOrg('view')), personnelLookup }
			});
			await widths.foldAll();

			expect(screen.queryByRole('button', { name: 'Add Entry' })).toBeNull();
			await openFilters();
			expect(screen.queryByRole('menuitem', { name: 'Add Entry' })).toBeNull();
			expect(screen.getByRole('menuitem', { name: 'Export' })).toBeTruthy();
		});
	});
});
