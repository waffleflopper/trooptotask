// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINE_SHEET_MODAL, RatingSchemeLinesContext } from '../contexts/RatingSchemeLinesContext.svelte';
import type { RatingSchemeLine } from '../utils/ratingSchemeLines';
import { evaluation, line, linePersonnel } from '../utils/ratingSchemeLineTestData';
import RatingSchemeLinesViewTestHost from './RatingSchemeLinesViewTestHost.svelte';

const lines: RatingSchemeLine[] = [
	line('scheme-watanabe', {
		ratedPersonId: 'watanabe',
		raterPersonId: 'alvarez',
		seniorRaterPersonId: 'chen',
		open: evaluation('eval-1', 'scheme-watanabe', { workflowStatus: 'with-rater' })
	}),
	line('scheme-park', { ratedPersonId: 'park', raterPersonId: 'reyes', seniorRaterPersonId: 'chen' }),
	line('scheme-archived', { ratedPersonId: 'alvarez', archivedAt: '2026-01-01T00:00:00Z' })
];

function makeOrg(ratingScheme: 'view' | 'operate') {
	return createClientAccess({
		membershipRole: 'member',
		capabilityMap: { ...createCapabilityMap('none'), ratingScheme }
	});
}

function renderView(
	options: { lines?: RatingSchemeLine[]; ratingScheme?: 'view' | 'operate'; pastThru?: number } = {}
) {
	const modals = new ModalRegistry();
	const ctx = new RatingSchemeLinesContext(
		{ orgId: 'org-1', orgName: 'Test Org', personnelLookup: linePersonnel },
		modals,
		makeOrg(options.ratingScheme ?? 'operate'),
		undefined,
		{ items: options.lines ?? lines },
		{ items: [] }
	);
	Object.defineProperty(ctx, 'pastThru', { get: () => options.pastThru ?? 0 });
	render(RatingSchemeLinesViewTestHost, { props: { ctx } });
	return { ctx, modals };
}

const editButton = (name: RegExp) =>
	screen.queryByRole('button', { name: new RegExp(`Edit rating scheme line for .*${name.source}`) });

beforeEach(() => {
	stubToolbarWidths();
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('RatingSchemeLinesView', () => {
	it('lists lines on the scheme and leaves archived ones out until asked', () => {
		renderView();

		expect(editButton(/Watanabe/)).toBeTruthy();
		expect(editButton(/Park/)).toBeTruthy();
		expect(editButton(/Alvarez/)).toBeNull();
	});

	it('narrows to the lines a searched rater rates', async () => {
		renderView();

		await fireEvent.input(screen.getByLabelText('Search by Soldier or rater'), { target: { value: 'Reyes' } });

		expect(editButton(/Park/)).toBeTruthy();
		expect(editButton(/Watanabe/)).toBeNull();
	});

	it('opens the sheet on the line that was clicked', async () => {
		const { modals } = renderView();

		await fireEvent.click(editButton(/Park/)!);

		expect(modals.payload(LINE_SHEET_MODAL)).toEqual({ lineId: 'scheme-park' });
	});

	it('opens a blank sheet from Add to scheme', async () => {
		const { modals } = renderView();

		await fireEvent.click(screen.getByRole('button', { name: 'Add to scheme' }));

		expect(modals.payload(LINE_SHEET_MODAL)).toEqual({ lineId: null });
	});

	it('shows the same lines as a table that opens the sheet from a row', async () => {
		const { ctx, modals } = renderView();
		ctx.view.viewMode = 'table';

		const row = await screen.findByRole('row', { name: /Edit rating scheme line for .*Park/ });
		await fireEvent.click(row);

		expect(modals.payload(LINE_SHEET_MODAL)).toEqual({ lineId: 'scheme-park' });
		expect(screen.getByRole('row', { name: /Edit rating scheme line for .*Watanabe/ })).toBeTruthy();
	});

	it('links an open Evaluation to the Eval Tracker without opening the sheet', async () => {
		const { modals } = renderView();

		const link = screen.getByRole('link', { name: /evaluation for .*Watanabe, open in Eval Tracker/ });
		await fireEvent.click(link);

		expect(link.getAttribute('href')).toBe('/org/org-1/evals?entry=eval-1');
		expect(modals.isOpen(LINE_SHEET_MODAL)).toBe(false);
	});

	it('hands out the two tabs, flagging open Evaluations past thru on the tracker', () => {
		renderView({ pastThru: 3 });
		const tabs = screen.getByRole('navigation', { name: 'Evals views' });

		expect(
			within(tabs)
				.getByRole('link', { name: /Eval Tracker/ })
				.getAttribute('href')
		).toBe('/org/org-1/evals');
		expect(within(tabs).getByRole('link', { name: /Eval Tracker/ }).textContent).toContain('3');
		expect(
			within(tabs)
				.getByRole('link', { name: /Rating Scheme/ })
				.getAttribute('aria-current')
		).toBe('page');
	});

	it('lets a viewer read the scheme but not open a line to edit it', () => {
		renderView({ ratingScheme: 'view' });

		expect(screen.getAllByText(/Park/).length).toBeGreaterThan(0);
		expect(editButton(/Park/)).toBeNull();
		expect(screen.queryByRole('button', { name: 'Add to scheme' })).toBeNull();
	});

	it('brings the lines back when a search that matched nothing is cleared', async () => {
		renderView();

		await fireEvent.input(screen.getByLabelText('Search by Soldier or rater'), { target: { value: 'zzzz' } });
		expect(editButton(/Park/)).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));

		expect(editButton(/Park/)).toBeTruthy();
	});

	it('starts an empty scheme from a prompt to add the first line', async () => {
		const { modals } = renderView({ lines: [] });

		await fireEvent.click(screen.getAllByRole('button', { name: /Add to scheme/ }).at(-1)!);

		expect(modals.payload(LINE_SHEET_MODAL)).toEqual({ lineId: null });
	});
});
