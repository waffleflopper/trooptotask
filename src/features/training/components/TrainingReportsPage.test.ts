// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
import {
	DEFAULT_TRAINING_BRIEFING_INPUT,
	type BriefingScope,
	type TrainingBriefingDetail,
	type TrainingBriefingDetailRow,
	type TrainingBriefingReportData,
	type TrainingBriefingReportInput
} from '../contracts';
import { buildTrainingBriefing } from '../utils/trainingBriefing';
import TrainingReportsPage from './TrainingReportsPage.svelte';

const { replaceState } = vi.hoisted(() => ({ replaceState: vi.fn() }));
vi.mock('$app/navigation', () => ({ replaceState }));

const CPR: TrainingType = {
	id: 'cpr',
	name: 'CPR',
	description: null,
	expirationMonths: 12,
	warningDaysYellow: 60,
	warningDaysOrange: 30,
	appliesToRoles: [],
	appliesToMos: [],
	appliesToRanks: [],
	excludedRoles: [],
	excludedMos: [],
	excludedRanks: [],
	color: '#22c55e',
	sortOrder: 0,
	expirationDateOnly: false,
	canBeExempted: false,
	exemptPersonnelIds: [],
	isOptional: false
};

function soldier(id: string, groupId: string, groupName: string): Personnel {
	return { id, rank: 'SGT', lastName: id, firstName: 'Pat', mos: '68W', clinicRole: 'Medic', groupId, groupName };
}

function completion(personnelId: string, expirationDate: string): PersonnelTraining {
	return {
		id: `pt-${personnelId}`,
		personnelId,
		trainingTypeId: 'cpr',
		completionDate: '2025-10-20',
		expirationDate,
		notes: null,
		certificateUrl: null
	};
}

function reportFor(input: Partial<TrainingBriefingReportInput> = {}, types = [CPR]): TrainingBriefingReportData {
	const canonical = { ...DEFAULT_TRAINING_BRIEFING_INPUT, ...input };
	return {
		input: canonical,
		organizationName: 'Test Company',
		briefing: buildTrainingBriefing({
			personnel: [soldier('a1', 'alpha', 'Alpha'), soldier('a2', 'alpha', 'Alpha'), soldier('b1', 'bravo', 'Bravo')],
			types,
			records: [completion('a1', '2026-10-20'), completion('a2', '2030-01-01')],
			filters: {},
			horizonDays: canonical.horizonDays,
			asOf: '2026-09-29',
			goalPercent: 90,
			rowsBy: canonical.rowsBy,
			scopeName: 'Test Company'
		}),
		filterOptions: {
			views: [],
			groups: [
				{ id: 'alpha', name: 'Alpha' },
				{ id: 'bravo', name: 'Bravo' }
			],
			ranks: ['SGT'],
			mos: ['68W'],
			roles: ['Medic'],
			types: [{ id: 'cpr', name: 'CPR' }]
		}
	};
}

function renderPage(fetchImpl = vi.fn<typeof fetch>(), initialReport = reportFor()) {
	render(TrainingReportsPage, { props: { orgId: 'org-1', initialReport, fetch: fetchImpl } });
	return fetchImpl;
}

function detailRow(name: string, overrides: Partial<TrainingBriefingDetailRow> = {}): TrainingBriefingDetailRow {
	return {
		personId: name,
		rank: 'SGT',
		name: `${name}, Pat`,
		groupName: 'Alpha',
		typeId: 'cpr',
		typeName: 'CPR',
		status: 'warning-yellow',
		label: '21d left',
		expirationDate: '2026-10-20',
		lapseDate: '2026-10-21',
		lapsesInHorizon: true,
		...overrides
	};
}

function detailPage(scope: BriefingScope, page: number, names: string[], totalRows = names.length, pageSize = 25) {
	const detail: TrainingBriefingDetail = {
		scope,
		rows: names.map((name) => detailRow(name)),
		totalRows,
		page,
		pageSize,
		totalPages: Math.ceil(totalRows / pageSize)
	};
	return detail;
}

afterEach(() => {
	cleanup();
	replaceState.mockClear();
	vi.unstubAllGlobals();
});

describe('Training Reports briefing page', () => {
	it('paints the server briefing without requesting it again', () => {
		const fetchImpl = renderPage();

		expect(screen.getByRole('heading', { level: 1, name: 'Training Reports' })).toBeTruthy();
		expect(screen.getByText('Test Company · 3 soldiers · as of 29 Sep 2026')).toBeTruthy();
		expect(within(screen.getByRole('region', { name: 'Bottom line' })).getByText('67%')).toBeTruthy();
		expect(screen.getByText('If no one renews, Test Company loses 33 points in 90 days.')).toBeTruthy();
		const grid = screen.getByRole('table', { name: 'Group by training type readiness' });
		expect(
			within(grid).getByRole('button', { name: 'Alpha, CPR: 100% ready today, drops 50 points by 28 Dec' })
		).toBeTruthy();
		expect(within(grid).getByRole('button', { name: 'Bravo, CPR: 0% ready today' })).toBeTruthy();
		expect(screen.getByLabelText('Readiness bands for a 90% goal').textContent).toContain('▼ 10+');
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('refetches the briefing when the horizon changes and keeps focus on the control', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(reportFor({ horizonDays: 30 })));
		renderPage(fetchImpl);

		const thirtyDays = screen.getByRole('radio', { name: '30 days' });
		thirtyDays.focus();
		await fireEvent.click(thirtyDays);

		expect(fetchImpl).toHaveBeenCalledWith('/org/org-1/api/training-reports?horizon=30', expect.anything());
		expect(await screen.findByText('Forecast · next 30 days')).toBeTruthy();
		expect(replaceState).toHaveBeenLastCalledWith('/org/org-1/training/reports?horizon=30', expect.anything());
		expect(document.activeElement).toBe(thirtyDays);
	});

	it('asks for the affected requirements of a clicked cell and marks it selected', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json({
				scope: { kind: 'cell', rowKey: 'alpha', typeId: 'cpr' },
				rows: [],
				totalRows: 1,
				page: 1,
				pageSize: 25,
				totalPages: 1
			})
		);
		renderPage(fetchImpl);

		const cell = screen.getByRole('button', { name: 'Alpha, CPR: 100% ready today, drops 50 points by 28 Dec' });
		await fireEvent.click(cell);

		expect(fetchImpl).toHaveBeenCalledWith(
			'/org/org-1/api/training-reports/detail?scope=cell&row=alpha&type=cpr',
			expect.anything()
		);
		expect(await screen.findByText('Alpha, CPR: 1 requirement not ready or lapsing by 28 Dec.')).toBeTruthy();
		expect(cell.closest('td')?.hasAttribute('data-selected')).toBe(true);
	});

	it('requests the Total row without a row key', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }));
		renderPage(fetchImpl);

		await fireEvent.click(
			screen.getByRole('button', { name: 'Total, CPR: 67% ready today, drops 33 points by 28 Dec' })
		);

		expect(fetchImpl).toHaveBeenCalledWith(
			'/org/org-1/api/training-reports/detail?scope=cell&type=cpr',
			expect.anything()
		);
		expect(await screen.findByText('Unable to load affected soldiers')).toBeTruthy();
	});

	it('keeps the controls with the briefing on screen after a failed refresh and recovers on retry', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(null, { status: 503 }))
			.mockResolvedValueOnce(Response.json(reportFor({ rowsBy: 'mos' })));
		renderPage(fetchImpl);

		await fireEvent.click(screen.getByRole('radio', { name: 'MOS' }));
		const alert = await screen.findByRole('alert');

		expect(within(alert).getByText('Unable to update the briefing')).toBeTruthy();
		expect(screen.getByRole('radio', { name: 'Group' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('table', { name: 'Group by training type readiness' })).toBeTruthy();

		await fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

		expect(fetchImpl).toHaveBeenLastCalledWith('/org/org-1/api/training-reports?rowsBy=mos', expect.anything());
		expect(await screen.findByRole('table', { name: 'MOS by training type readiness' })).toBeTruthy();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	async function failRowsByRefresh(): Promise<{ retry: HTMLElement; respond: (response: Response) => void }> {
		const pending: Array<(response: Response) => void> = [];
		const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((respond) => pending.push(respond)));
		renderPage(fetchImpl);

		await fireEvent.click(screen.getByRole('radio', { name: 'MOS' }));
		pending[0](new Response(null, { status: 503 }));
		const retry = within(await screen.findByRole('alert')).getByRole('button', { name: 'Retry' });
		retry.focus();
		await fireEvent.click(retry);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		return { retry, respond: pending[1] };
	}

	it('moves focus to the briefing when a failed refresh is retried and keeps it there once the refresh arrives', async () => {
		const { retry, respond } = await failRowsByRefresh();
		const briefing = screen.getByRole('region', { name: 'Training readiness briefing' });

		expect(retry.isConnected).toBe(false);
		await waitFor(() => expect(document.activeElement).toBe(briefing));
		expect(briefing.getAttribute('aria-busy')).toBe('true');

		respond(Response.json(reportFor({ rowsBy: 'mos' })));
		expect(await screen.findByRole('table', { name: 'MOS by training type readiness' })).toBeTruthy();
		expect(briefing.getAttribute('aria-busy')).toBe('false');
		expect(document.activeElement).toBe(briefing);
	});

	it('keeps focus on the briefing when a retried refresh comes back with no training types', async () => {
		const { respond } = await failRowsByRefresh();
		const briefing = screen.getByRole('region', { name: 'Training readiness briefing' });

		respond(
			Response.json({ ...reportFor({ rowsBy: 'mos' }), filterOptions: { ...reportFor().filterOptions, types: [] } })
		);
		expect(await screen.findByText('No training types configured.')).toBeTruthy();
		expect(document.activeElement).toBe(briefing);
	});

	it('leaves focus where the user moved it while a retried refresh is loading', async () => {
		const { respond } = await failRowsByRefresh();
		const thirtyDays = screen.getByRole('radio', { name: '30 days' });
		thirtyDays.focus();

		respond(Response.json(reportFor({ rowsBy: 'mos' })));
		expect(await screen.findByRole('table', { name: 'MOS by training type readiness' })).toBeTruthy();
		expect(document.activeElement).toBe(thirtyDays);
	});

	it.each([
		{
			control: 'toolbar',
			container: { role: 'group', name: 'Training report actions' },
			initialReport: reportFor({ groupId: 'alpha' })
		},
		{
			control: 'no-requirements panel',
			container: { role: 'region', name: 'Training readiness briefing' },
			initialReport: reportFor({ groupId: 'alpha' }, [{ ...CPR, isOptional: true }])
		}
	])(
		'moves focus to the briefing when the $control Clear filters removes itself',
		async ({ container, initialReport }) => {
			const pending: Array<(response: Response) => void> = [];
			renderPage(
				vi.fn<typeof fetch>(() => new Promise<Response>((respond) => pending.push(respond))),
				initialReport
			);
			const briefing = screen.getByRole('region', { name: 'Training readiness briefing' });
			const clear = within(screen.getByRole(container.role, { name: container.name })).getByRole('button', {
				name: 'Clear filters'
			});

			clear.focus();
			await fireEvent.click(clear);

			expect(clear.isConnected).toBe(false);
			await waitFor(() => expect(document.activeElement).toBe(briefing));
			pending[0](Response.json(reportFor()));
			expect(await screen.findByRole('table', { name: 'Group by training type readiness' })).toBeTruthy();
			expect(document.activeElement).toBe(briefing);
		}
	);

	it('moves focus to the briefing when a failed export is retried and keeps it there once the workbook downloads', async () => {
		vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:report', revokeObjectURL: () => {} }));
		const pending: Array<(response: Response) => void> = [];
		const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((respond) => pending.push(respond)));
		renderPage(fetchImpl);
		const briefing = screen.getByRole('region', { name: 'Training readiness briefing' });

		await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));
		pending[0](new Response(null, { status: 500 }));
		const retry = within(await screen.findByRole('alert')).getByRole('button', { name: 'Retry' });
		retry.focus();
		await fireEvent.click(retry);

		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(retry.isConnected).toBe(false);
		await waitFor(() => expect(document.activeElement).toBe(briefing));
		pending[1](new Response(new Blob(['xlsx'])));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Export Excel' })).toBeTruthy());
		expect(screen.queryByRole('alert')).toBeNull();
		expect(document.activeElement).toBe(briefing);
	});

	it('clears the selected cell when the horizon change closes its affected soldiers', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async (url) =>
			String(url).includes('/detail?')
				? Response.json(detailPage({ kind: 'cell', rowKey: 'alpha', typeId: 'cpr' }, 1, ['a1']))
				: Response.json(reportFor({ horizonDays: 30 }))
		);
		renderPage(fetchImpl);

		await fireEvent.click(screen.getByRole('button', { name: /^Alpha, CPR: 100% ready today/ }));
		await screen.findByRole('region', { name: 'Affected soldiers' });
		const selected = screen.getByRole('button', {
			name: 'Alpha, CPR: 100% ready today, drops 50 points by 28 Dec, selected'
		});
		expect(selected.closest('td')?.getAttribute('data-selected')).toBe('true');

		await fireEvent.click(screen.getByRole('radio', { name: '30 days' }));
		expect(await screen.findByText('Forecast · next 30 days')).toBeTruthy();

		expect(screen.queryByRole('region', { name: 'Affected soldiers' })).toBeNull();
		const cell = screen.getByRole('button', { name: /^Alpha, CPR: 100% ready today/ });
		expect(cell.getAttribute('aria-label')).not.toContain('selected');
		expect(cell.closest('td')?.hasAttribute('data-selected')).toBe(false);
		expect(document.querySelectorAll('[data-selected]')).toHaveLength(0);
	});

	it('moves the selection from a cell to a focus area when the focus area is opened', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async (url) =>
			Response.json(
				String(url).includes('scope=focus')
					? detailPage({ kind: 'focus', key: 'gap:cpr' }, 1, ['b1', 'a1'])
					: detailPage({ kind: 'cell', rowKey: 'alpha', typeId: 'cpr' }, 1, ['a1'])
			)
		);
		renderPage(fetchImpl);

		await fireEvent.click(screen.getByRole('button', { name: /^Alpha, CPR: 100% ready today/ }));
		expect(await screen.findByText('Alpha, CPR: 1 requirement not ready or lapsing by 28 Dec.')).toBeTruthy();

		const area = screen.getByRole('heading', { level: 3, name: 'CPR — the standing gap' }).closest('li')!;
		const link = within(area).getByRole('link', { name: 'View 2 soldiers' });
		await fireEvent.click(link);
		expect(
			await screen.findByText('CPR — the standing gap: 2 requirements not ready or lapsing by 28 Dec.')
		).toBeTruthy();

		expect(link.getAttribute('aria-current')).toBe('true');
		expect(document.querySelectorAll('[data-selected]')).toHaveLength(0);
		expect(screen.queryByRole('button', { name: /, selected$/ })).toBeNull();
	});

	it('exports the workbook for the filters of the briefing on screen', async () => {
		vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:report', revokeObjectURL: () => {} }));
		const fetchImpl = vi.fn<typeof fetch>(async () => new Response(new Blob(['xlsx'])));
		renderPage(fetchImpl, reportFor({ groupId: 'alpha', horizonDays: 60 }));

		await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));

		await waitFor(() =>
			expect(fetchImpl).toHaveBeenCalledWith('/org/org-1/api/training-reports/export?group=alpha&horizon=60')
		);
	});

	it('opens the affected soldiers of a focus area from its link and moves focus to them', async () => {
		const scope: BriefingScope = { kind: 'focus', key: 'gap:cpr' };
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Response.json({
				...detailPage(scope, 1, []),
				rows: [
					detailRow('b1', {
						groupName: 'Bravo',
						status: 'not-completed',
						label: 'Not Done',
						expirationDate: null,
						lapseDate: null,
						lapsesInHorizon: false
					}),
					detailRow('a1')
				],
				totalRows: 2
			})
		);
		renderPage(fetchImpl);

		const area = screen.getByRole('heading', { level: 3, name: 'CPR — the standing gap' }).closest('li')!;
		const link = within(area).getByRole('link', { name: 'View 2 soldiers' });
		await fireEvent.click(link);

		expect(fetchImpl).toHaveBeenCalledWith(
			'/org/org-1/api/training-reports/detail?scope=focus&focus=gap%3Acpr',
			expect.anything()
		);
		const section = await screen.findByRole('region', { name: 'Affected soldiers' });
		await waitFor(() => expect(document.activeElement).toBe(section));
		expect(link.getAttribute('aria-current')).toBe('true');
		const table = await within(section).findByRole('table', { name: 'Affected soldiers' });
		const missing = within(table).getByRole('row', { name: /b1, Pat/ });
		expect(within(missing).getByText('Not Done')).toBeTruthy();
		expect(
			within(missing)
				.getAllByRole('cell')
				.map((cell) => cell.textContent?.trim())
		).toEqual(['SGT', 'b1, Pat', 'Bravo', 'CPR', 'Not Done', '-', 'No']);
	});

	it('pages the affected soldiers on the server, keeping the loaded page until the next one arrives', async () => {
		const scope: BriefingScope = { kind: 'cell', rowKey: null, typeId: 'cpr' };
		const pending: Array<{ url: string; respond: (response: Response) => void }> = [];
		const fetchImpl = vi.fn<typeof fetch>(
			(url) => new Promise<Response>((respond) => pending.push({ url: String(url), respond }))
		);
		renderPage(fetchImpl);

		await fireEvent.click(screen.getByRole('button', { name: /^Total, CPR: 67% ready today/ }));
		pending[0].respond(
			Response.json(
				detailPage(
					scope,
					1,
					Array.from({ length: 25 }, (_, index) => `p${index + 1}`),
					30
				)
			)
		);
		const section = await screen.findByRole('region', { name: 'Affected soldiers' });
		expect(await within(section).findByText('Rows 1–25 of 30')).toBeTruthy();

		await fireEvent.click(within(section).getByRole('button', { name: 'Next' }));
		expect(pending[1].url).toBe('/org/org-1/api/training-reports/detail?scope=cell&type=cpr&page=2');
		expect(within(section).getByText('Rows 1–25 of 30')).toBeTruthy();
		expect(within(section).getByRole('row', { name: /p1, Pat/ })).toBeTruthy();

		pending[1].respond(Response.json(detailPage(scope, 2, ['p26', 'p27', 'p28', 'p29', 'p30'], 30)));
		expect(await within(section).findByText('Rows 26–30 of 30')).toBeTruthy();

		await fireEvent.click(within(section).getByRole('radio', { name: '100 rows per page' }));
		expect(pending[2].url).toBe('/org/org-1/api/training-reports/detail?scope=cell&type=cpr&pageSize=100');
		expect(screen.getByRole('button', { name: /^Total, CPR: 67% ready today.*, selected$/ })).toBeTruthy();
	});

	it('keeps the rows per page choice selected when it is chosen again', async () => {
		const scope: BriefingScope = { kind: 'cell', rowKey: null, typeId: 'cpr' };
		const thirty = Array.from({ length: 30 }, (_, index) => `p${index + 1}`);
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json(detailPage(scope, 1, thirty.slice(0, 25), 30)))
			.mockResolvedValueOnce(Response.json(detailPage(scope, 1, thirty, 30, 100)));
		renderPage(fetchImpl);

		await fireEvent.click(screen.getByRole('button', { name: /^Total, CPR: 67% ready today/ }));
		const section = await screen.findByRole('region', { name: 'Affected soldiers' });
		expect(await within(section).findByText('Rows 1–25 of 30')).toBeTruthy();
		const twentyFive = within(section).getByRole('radio', { name: '25 rows per page' });
		const hundred = within(section).getByRole('radio', { name: '100 rows per page' });

		for (let activation = 0; activation < 2; activation++) {
			await fireEvent.click(twentyFive);
			expect(twentyFive.getAttribute('aria-checked')).toBe('true');
			expect(hundred.getAttribute('aria-checked')).toBe('false');
		}
		expect(within(section).getByText('Rows 1–25 of 30')).toBeTruthy();
		expect(fetchImpl).toHaveBeenCalledTimes(1);

		await fireEvent.click(hundred);

		expect(fetchImpl).toHaveBeenLastCalledWith(
			'/org/org-1/api/training-reports/detail?scope=cell&type=cpr&pageSize=100',
			expect.anything()
		);
		expect(await within(section).findByText('Rows 1–30 of 30')).toBeTruthy();
		expect(hundred.getAttribute('aria-checked')).toBe('true');
		expect(twentyFive.getAttribute('aria-checked')).toBe('false');
	});

	it('keeps the horizon and rows by choices selected when they are chosen again', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json(reportFor({ horizonDays: 30 })))
			.mockResolvedValueOnce(Response.json(reportFor({ horizonDays: 30, rowsBy: 'mos' })));
		renderPage(fetchImpl);
		const ninetyDays = screen.getByRole('radio', { name: '90 days' });
		const group = screen.getByRole('radio', { name: 'Group' });

		for (let activation = 0; activation < 2; activation++) {
			await fireEvent.click(ninetyDays);
			await fireEvent.click(group);
			expect(ninetyDays.getAttribute('aria-checked')).toBe('true');
			expect(group.getAttribute('aria-checked')).toBe('true');
		}
		expect(screen.getByText('Forecast · next 90 days')).toBeTruthy();
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(replaceState).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('radio', { name: '30 days' }));
		expect(await screen.findByText('Forecast · next 30 days')).toBeTruthy();
		await fireEvent.click(screen.getByRole('radio', { name: 'MOS' }));
		expect(await screen.findByRole('table', { name: 'MOS by training type readiness' })).toBeTruthy();

		expect(replaceState).toHaveBeenLastCalledWith(
			'/org/org-1/training/reports?horizon=30&rowsBy=mos',
			expect.anything()
		);
		expect(screen.getByRole('radio', { name: '30 days' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: 'MOS' }).getAttribute('aria-checked')).toBe('true');
		expect(ninetyDays.getAttribute('aria-checked')).toBe('false');
		expect(group.getAttribute('aria-checked')).toBe('false');
	});

	it('keeps the loaded affected soldiers after a failed page and returns focus to them on retry', async () => {
		const scope: BriefingScope = { kind: 'cell', rowKey: null, typeId: 'cpr' };
		const firstPage = Array.from({ length: 25 }, (_, index) => `p${index + 1}`);
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json(detailPage(scope, 1, firstPage, 30)))
			.mockResolvedValueOnce(new Response(null, { status: 503 }))
			.mockResolvedValueOnce(Response.json(detailPage(scope, 2, ['p26', 'p27', 'p28', 'p29', 'p30'], 30)));
		renderPage(fetchImpl);

		await fireEvent.click(screen.getByRole('button', { name: /^Total, CPR: 67% ready today/ }));
		const section = await screen.findByRole('region', { name: 'Affected soldiers' });
		expect(await within(section).findByText('Rows 1–25 of 30')).toBeTruthy();

		await fireEvent.click(within(section).getByRole('button', { name: 'Next' }));
		const alert = await within(section).findByRole('alert');
		expect(within(section).getByText('Rows 1–25 of 30')).toBeTruthy();

		const retry = within(alert).getByRole('button', { name: 'Retry' });
		retry.focus();
		await fireEvent.click(retry);

		expect(fetchImpl).toHaveBeenLastCalledWith(
			'/org/org-1/api/training-reports/detail?scope=cell&type=cpr&page=2',
			expect.anything()
		);
		await waitFor(() => expect(document.activeElement).toBe(section));
		expect(await within(section).findByText('Rows 26–30 of 30')).toBeTruthy();
		expect(within(section).queryByRole('alert')).toBeNull();
	});

	it('hands keyboard focus to the other pager button when paging reaches the first or last page', async () => {
		const scope: BriefingScope = { kind: 'cell', rowKey: null, typeId: 'cpr' };
		const names = (from: number) => Array.from({ length: 25 }, (_, index) => `p${from + index}`);
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json(detailPage(scope, 1, names(1), 60)))
			.mockResolvedValueOnce(Response.json(detailPage(scope, 2, names(26), 60)))
			.mockResolvedValueOnce(Response.json(detailPage(scope, 3, names(51).slice(0, 10), 60)))
			.mockResolvedValueOnce(Response.json(detailPage(scope, 2, names(26), 60)))
			.mockResolvedValueOnce(Response.json(detailPage(scope, 1, names(1), 60)));
		renderPage(fetchImpl);

		await fireEvent.click(screen.getByRole('button', { name: /^Total, CPR: 67% ready today/ }));
		const section = await screen.findByRole('region', { name: 'Affected soldiers' });
		expect(await within(section).findByText('Rows 1–25 of 60')).toBeTruthy();

		async function page(name: 'Next' | 'Previous', range: string): Promise<HTMLElement> {
			const button = within(section).getByRole('button', { name });
			button.focus();
			await fireEvent.click(button);
			expect(await within(section).findByText(range)).toBeTruthy();
			return button;
		}

		const next = await page('Next', 'Rows 26–50 of 60');
		expect(document.activeElement).toBe(next);
		await page('Next', 'Rows 51–60 of 60');
		const previous = within(section).getByRole('button', { name: 'Previous' });
		await waitFor(() => expect(document.activeElement).toBe(previous));

		await page('Previous', 'Rows 26–50 of 60');
		expect(document.activeElement).toBe(previous);
		await page('Previous', 'Rows 1–25 of 60');
		await waitFor(() => expect(document.activeElement).toBe(within(section).getByRole('button', { name: 'Next' })));
	});

	async function pageIntoShrunkDetail(beforeResponse: (section: HTMLElement) => void): Promise<HTMLElement> {
		const scope: BriefingScope = { kind: 'cell', rowKey: null, typeId: 'cpr' };
		const pending: Array<(response: Response) => void> = [];
		const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((respond) => pending.push(respond)));
		renderPage(fetchImpl);

		await fireEvent.click(screen.getByRole('button', { name: /^Total, CPR: 67% ready today/ }));
		pending[0](
			Response.json(
				detailPage(
					scope,
					1,
					Array.from({ length: 25 }, (_, index) => `p${index + 1}`),
					30
				)
			)
		);
		const section = await screen.findByRole('region', { name: 'Affected soldiers' });
		expect(await within(section).findByText('Rows 1–25 of 30')).toBeTruthy();

		const next = within(section).getByRole('button', { name: 'Next' });
		next.focus();
		await fireEvent.click(next);
		beforeResponse(section);
		pending[1](
			Response.json(
				detailPage(
					scope,
					1,
					Array.from({ length: 20 }, (_, index) => `p${index + 1}`),
					20
				)
			)
		);
		expect(await within(section).findByText('Rows 1–20 of 20')).toBeTruthy();
		expect(within(section).queryByRole('button', { name: 'Next' })).toBeNull();
		return section;
	}

	it('keeps keyboard focus in the affected soldiers table when a requested page comes back as the only page', async () => {
		const section = await pageIntoShrunkDetail(() => {});
		await waitFor(() => expect(document.activeElement).toBe(section.querySelector('[data-slot="data-table"]')));
	});

	it('leaves focus where the user moved it while a requested page comes back as the only page', async () => {
		let pageSize: HTMLElement | null = null;
		await pageIntoShrunkDetail((section) => {
			pageSize = within(section).getByRole('radio', { name: '100 rows per page' });
			pageSize.focus();
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(document.activeElement).toBe(pageSize);
	});

	it('invokes native print without refetching the loaded briefing', async () => {
		const print = vi.fn(() => {
			window.dispatchEvent(new Event('beforeprint'));
			window.dispatchEvent(new Event('afterprint'));
		});
		vi.stubGlobal('print', print);
		const fetchImpl = renderPage(vi.fn<typeof fetch>(), reportFor({ groupId: 'alpha', horizonDays: 60 }));

		await fireEvent.click(screen.getByRole('button', { name: 'Print brief' }));

		expect(print).toHaveBeenCalledOnce();
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('exports the whole filtered briefing even while one cell is drilled into', async () => {
		vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:report', revokeObjectURL: () => {} }));
		const fetchImpl = vi.fn<typeof fetch>(async (url) =>
			String(url).includes('/detail?')
				? Response.json(detailPage({ kind: 'cell', rowKey: null, typeId: 'cpr' }, 1, ['a1', 'b1']))
				: new Response(new Blob(['xlsx']))
		);
		renderPage(fetchImpl);

		await fireEvent.click(screen.getByRole('button', { name: /^Total, CPR: 67% ready today/ }));
		await screen.findByRole('table', { name: 'Affected soldiers' });
		await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));

		await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/org/org-1/api/training-reports/export'));
	});
});
