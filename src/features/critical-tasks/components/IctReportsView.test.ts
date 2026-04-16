// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctReportsView from './IctReportsView.svelte';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { IctReportSummary } from '$features/critical-tasks/utils/ictReports';

const alpha: Group = { id: 'group-alpha', name: 'Alpha', sortOrder: 0 };
const bravo: Group = { id: 'group-bravo', name: 'Bravo', sortOrder: 1 };

const medic: Personnel = {
	id: 'person-medic',
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'Jane',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: alpha.id,
	groupName: alpha.name,
	archivedAt: null
};

const infantry: Personnel = {
	...medic,
	id: 'person-infantry',
	lastName: 'Jones',
	firstName: 'Alex',
	mos: '11B',
	clinicRole: 'Rifleman',
	groupId: bravo.id,
	groupName: bravo.name
};

const medicTask: IctTask = {
	id: 'task-medic',
	taskCode: '181-105-1001',
	title: 'TCCC lane',
	description: null,
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 0,
	archivedAt: null,
	createdAt: '2026-04-01T00:00:00Z'
};

const commonTask: IctTask = {
	...medicTask,
	id: 'task-common',
	taskCode: '081-833-0010',
	title: 'Open airway',
	mos: []
};

const initialSummary: IctReportSummary = {
	overallReadinessPercent: 67,
	readinessByMos: [
		{ mos: '11B', readinessPercent: 0, applicableCount: 1, readyCount: 0 },
		{ mos: '68W', readinessPercent: 100, applicableCount: 2, readyCount: 2 }
	],
	bestPerformingMos: { mos: '68W', readinessPercent: 100, applicableCount: 2, readyCount: 2 },
	worstPerformingMos: { mos: '11B', readinessPercent: 0, applicableCount: 1, readyCount: 0 },
	completionTrend: [
		{ month: '2025-11', completions: 1 },
		{ month: '2026-01', completions: 2 }
	]
};

const filteredSummary: IctReportSummary = {
	overallReadinessPercent: 100,
	readinessByMos: [{ mos: '68W', readinessPercent: 100, applicableCount: 2, readyCount: 2 }],
	bestPerformingMos: { mos: '68W', readinessPercent: 100, applicableCount: 2, readyCount: 2 },
	worstPerformingMos: { mos: '68W', readinessPercent: 100, applicableCount: 2, readyCount: 2 },
	completionTrend: [{ month: '2026-01', completions: 1 }]
};

describe('IctReportsView', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => filteredSummary
			}))
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('renders report summaries and updates the export context when filters change', async () => {
		render(IctReportsView, {
			props: {
				orgId: 'org-1',
				personnel: [medic, infantry],
				groups: [alpha, bravo],
				tasks: [medicTask, commonTask],
				initialSummary
			}
		});

		expect(screen.getByText('Critical Task Reports')).toBeTruthy();
		expect(screen.getByText('Beta')).toBeTruthy();
		expect(screen.getByText('67%')).toBeTruthy();
		const bestCard = screen.getByText('Best Performing MOS').closest('section');
		const worstCard = screen.getByText('Worst Performing MOS').closest('section');
		const trendPanel = screen.getByText('Completion Trend').closest('section');
		expect(bestCard).toBeTruthy();
		expect(worstCard).toBeTruthy();
		expect(trendPanel).toBeTruthy();
		expect(within(bestCard!).getByText('68W')).toBeTruthy();
		expect(within(worstCard!).getByText('11B')).toBeTruthy();
		expect(within(trendPanel!).getByText('2026-01')).toBeTruthy();

		const exportLink = screen.getByRole('link', { name: 'Export CSV' });
		expect(exportLink.getAttribute('href')).toBe('/org/org-1/api/critical-tasks/reports/export');

		const groupFilter = screen.getByLabelText('Filter by group') as HTMLSelectElement;
		groupFilter.value = alpha.id;
		await fireEvent.change(groupFilter);

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				`/org/org-1/api/critical-tasks/reports/summary?groupId=${alpha.id}`,
				expect.objectContaining({ signal: expect.any(AbortSignal) })
			);
			expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(
				`/org/org-1/api/critical-tasks/reports/export?groupId=${alpha.id}`
			);
			expect(screen.getByText('100%')).toBeTruthy();
		});
	});
});
