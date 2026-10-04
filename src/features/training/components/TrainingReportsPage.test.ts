// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
import {
	DEFAULT_TRAINING_BRIEFING_INPUT,
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

function reportFor(input: Partial<TrainingBriefingReportInput> = {}): TrainingBriefingReportData {
	const canonical = { ...DEFAULT_TRAINING_BRIEFING_INPUT, ...input };
	return {
		input: canonical,
		organizationName: 'Test Company',
		briefing: buildTrainingBriefing({
			personnel: [soldier('a1', 'alpha', 'Alpha'), soldier('a2', 'alpha', 'Alpha'), soldier('b1', 'bravo', 'Bravo')],
			types: [CPR],
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

	it('exports the workbook for the filters of the briefing on screen', async () => {
		vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:report', revokeObjectURL: () => {} }));
		const fetchImpl = vi.fn<typeof fetch>(async () => new Response(new Blob(['xlsx'])));
		renderPage(fetchImpl, reportFor({ groupId: 'alpha', horizonDays: 60 }));

		await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));

		await waitFor(() =>
			expect(fetchImpl).toHaveBeenCalledWith('/org/org-1/api/training-reports/export?group=alpha&horizon=60')
		);
	});
});
