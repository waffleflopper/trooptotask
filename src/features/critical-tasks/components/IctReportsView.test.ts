// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctReportsView from './IctReportsView.svelte';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { IctReadinessTrend, IctReportDashboard } from '$features/critical-tasks/utils/ictReports';

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

function readinessTrend(percent: number, mos = '11B'): IctReadinessTrend {
	return {
		comparisonMos: [mos],
		months: [
			{
				month: '2026-03',
				label: 'Mar 2026',
				overallReadinessPercent: percent - 10,
				overallReadyCount: 1,
				overallApplicableCount: 2,
				mosReadiness: [{ mos, personnelCount: 1, readinessPercent: percent - 10, readyCount: 1, applicableCount: 2 }]
			},
			{
				month: '2026-04',
				label: 'Apr 2026',
				overallReadinessPercent: percent,
				overallReadyCount: 2,
				overallApplicableCount: 2,
				mosReadiness: [{ mos, personnelCount: 1, readinessPercent: percent, readyCount: 2, applicableCount: 2 }]
			}
		]
	};
}

const initialDashboard: IctReportDashboard = {
	kpis: {
		overallReadiness: {
			percent: 67,
			deltaPercent: -4,
			readyCount: 2,
			applicableCount: 3
		},
		soldiersBelow70: {
			count: 1,
			totalAssigned: 2,
			thresholdPercent: 70
		},
		tasksExpiringSoon: {
			count: 1,
			affectedSoldiers: 1,
			windowDays: 30
		},
		tasksBelowThreshold: {
			count: 1,
			thresholdPercent: 70
		}
	},
	tasksBelowThreshold: {
		thresholdPercent: 70,
		rows: [
			{
				taskId: 'task-common',
				taskCode: '081-833-0010',
				taskName: 'Open airway',
				percentComplete: 50,
				soldierGapCount: 1,
				applicableCount: 2,
				completeCount: 1
			}
		]
	},
	atRiskSoldiers: {
		rows: [
			{
				personnelId: infantry.id,
				soldierName: 'Jones, Alex',
				mos: '11B',
				rank: 'SGT',
				groupName: 'Bravo',
				readinessPercent: 50,
				applicableCount: 2,
				readyCount: 1,
				tasksExpiringSoonCount: 1,
				daysSinceLastIctUpdate: 42,
				lastIctUpdateAt: '2026-02-01T00:00:00Z'
			}
		]
	},
	readinessTrend: readinessTrend(67)
};

const filteredDashboard: IctReportDashboard = {
	kpis: {
		overallReadiness: {
			percent: 100,
			deltaPercent: 12,
			readyCount: 2,
			applicableCount: 2
		},
		soldiersBelow70: {
			count: 0,
			totalAssigned: 1,
			thresholdPercent: 70
		},
		tasksExpiringSoon: {
			count: 0,
			affectedSoldiers: 0,
			windowDays: 30
		},
		tasksBelowThreshold: {
			count: 0,
			thresholdPercent: 70
		}
	},
	tasksBelowThreshold: {
		thresholdPercent: 70,
		rows: []
	},
	atRiskSoldiers: {
		rows: [
			{
				personnelId: medic.id,
				soldierName: 'Smith, Jane',
				mos: '68W',
				rank: 'SGT',
				groupName: 'Alpha',
				readinessPercent: 100,
				applicableCount: 2,
				readyCount: 2,
				tasksExpiringSoonCount: 0,
				daysSinceLastIctUpdate: 5,
				lastIctUpdateAt: '2026-03-10T00:00:00Z'
			}
		]
	},
	readinessTrend: readinessTrend(100, '68W')
};

describe('IctReportsView', () => {
	beforeEach(() => {
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
			x: 0,
			y: 0,
			width: 720,
			height: 320,
			top: 0,
			right: 720,
			bottom: 320,
			left: 0,
			toJSON: () => ({})
		} as DOMRect);
		vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(720);
		vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => filteredDashboard
			}))
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('renders action KPI cards and updates the shared report context when filters change', async () => {
		render(IctReportsView, {
			props: {
				orgId: 'org-1',
				personnel: [medic, infantry],
				groups: [alpha, bravo],
				tasks: [medicTask, commonTask],
				initialDashboard
			}
		});

		expect(screen.getByText('Critical Task Reports')).toBeTruthy();
		expect(screen.getByText('Beta')).toBeTruthy();
		const kpiStrip = screen.getByRole('region', { name: 'Action KPIs' });
		expect(within(kpiStrip).getByText('67%')).toBeTruthy();
		expect(within(kpiStrip).getByRole('article', { name: 'Overall Readiness' })).toBeTruthy();
		expect(within(kpiStrip).getByRole('article', { name: 'Soldiers Below 70%' })).toBeTruthy();
		expect(within(kpiStrip).getByRole('article', { name: 'Tasks Expiring ≤30d' })).toBeTruthy();
		expect(within(kpiStrip).getByRole('article', { name: 'Tasks Below Threshold' })).toBeTruthy();
		const belowThresholdSection = screen.getByRole('region', { name: 'Tasks Below Unit Threshold' });
		expect(within(belowThresholdSection).getByText('081-833-0010')).toBeTruthy();
		expect(within(belowThresholdSection).getByText('Open airway')).toBeTruthy();
		const atRiskSection = screen.getByRole('region', { name: 'At-Risk Soldiers' });
		expect(within(atRiskSection).getByText('Jones, Alex')).toBeTruthy();
		const readinessTrendSection = screen.getByRole('region', { name: 'Readiness Trend - 12 Months' });
		expect(within(readinessTrendSection).getByRole('img', { name: '12-month readiness trend chart' })).toBeTruthy();
		expect(within(readinessTrendSection).getByRole('table', { name: '12-month readiness trend data' })).toBeTruthy();
		expect(screen.queryByText('Completion Trend')).toBeNull();
		expect(screen.queryByText('Readiness by MOS')).toBeNull();

		const exportLink = screen.getByRole('link', { name: 'Export CSV' });
		expect(exportLink.getAttribute('href')).toBe('/org/org-1/api/critical-tasks/reports/export');

		const mosFilter = screen.getByRole('combobox', { name: 'Filter by MOS' });
		await fireEvent.focus(mosFilter);
		const mosList = screen.getByRole('listbox', { name: 'Filter by MOS' });
		await fireEvent.mouseDown(within(mosList).getByRole('option', { name: '68W' }));
		await fireEvent.mouseDown(within(mosList).getByRole('option', { name: '11B' }));

		expect(screen.getByRole('button', { name: 'Remove 68W' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Remove 11B' })).toBeTruthy();

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				'/org/org-1/api/critical-tasks/reports/summary?mos=11B&mos=68W',
				expect.objectContaining({ signal: expect.any(AbortSignal) })
			);
			expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(
				'/org/org-1/api/critical-tasks/reports/export?mos=11B&mos=68W'
			);
			expect(within(kpiStrip).getByText('100%')).toBeTruthy();
			expect(within(readinessTrendSection).getByRole('columnheader', { name: '68W readiness' })).toBeTruthy();
			expect(screen.getByText('No tasks are below 70% for the active filters.')).toBeTruthy();
			expect(screen.getByText('Smith, Jane')).toBeTruthy();
		});
	});

	it('keeps toolbar actions and filters visible for the empty task-library state', () => {
		render(IctReportsView, {
			props: {
				orgId: 'org-1',
				personnel: [medic],
				groups: [alpha],
				tasks: [],
				initialDashboard
			}
		});

		expect(screen.getByRole('link', { name: 'Export CSV' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Back' })).toBeTruthy();
		expect(screen.getByLabelText('Filter by group')).toBeTruthy();
		expect(screen.getByLabelText('Filter by MOS')).toBeTruthy();
		expect(screen.getByText('No critical tasks configured yet.')).toBeTruthy();
	});

	it('uses searchable single-select controls for group, rank, and role filters', async () => {
		render(IctReportsView, {
			props: {
				orgId: 'org-1',
				personnel: [medic, infantry],
				groups: [alpha, bravo],
				tasks: [medicTask, commonTask],
				initialDashboard
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Filter by group' }));
		const groupFilter = screen.getByRole('combobox', { name: 'Filter by group' });
		await fireEvent.input(groupFilter, { target: { value: 'Bra' } });
		await fireEvent.mouseDown(screen.getByRole('option', { name: 'Bravo' }));

		await fireEvent.click(screen.getByRole('button', { name: 'Filter by rank' }));
		const rankFilter = screen.getByRole('combobox', { name: 'Filter by rank' });
		await fireEvent.input(rankFilter, { target: { value: 'SG' } });
		await fireEvent.mouseDown(screen.getByRole('option', { name: 'SGT' }));

		await fireEvent.click(screen.getByRole('button', { name: 'Filter by role' }));
		const roleFilter = screen.getByRole('combobox', { name: 'Filter by role' });
		await fireEvent.input(roleFilter, { target: { value: 'Rifle' } });
		await fireEvent.mouseDown(screen.getByRole('option', { name: 'Rifleman' }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				'/org/org-1/api/critical-tasks/reports/summary?groupId=group-bravo&role=Rifleman&rank=SGT',
				expect.objectContaining({ signal: expect.any(AbortSignal) })
			);
			expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(
				'/org/org-1/api/critical-tasks/reports/export?groupId=group-bravo&role=Rifleman&rank=SGT'
			);
		});
	});
});
