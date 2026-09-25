// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctReportsView from './IctReportsView.svelte';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type {
	IctExpirationCliff,
	IctReadinessDistribution,
	IctReadinessMatrix,
	IctReadinessTrend,
	IctReportDashboard,
	IctReportScope
} from '$features/critical-tasks/utils/ictReports';

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

function makeReportScope(
	options: {
		personnel?: Personnel[];
		groups?: Group[];
		tasks?: IctTask[];
	} = {}
): IctReportScope {
	const personnel = options.personnel ?? [medic, infantry];
	const groups = options.groups ?? [alpha, bravo];
	const tasks = options.tasks ?? [medicTask, commonTask];
	const uniqueSorted = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

	return {
		personnel: personnel.map((person) => ({
			id: person.id,
			groupId: person.groupId,
			mos: person.mos,
			rank: person.rank,
			dutyRole: person.clinicRole
		})),
		groups: groups.map((group) => ({ id: group.id, name: group.name })),
		hasActiveTasks: tasks.some((task) => !task.archivedAt),
		activeTaskCount: tasks.filter((task) => !task.archivedAt).length,
		totalPersonnelCount: personnel.length,
		filterOptions: {
			mos: uniqueSorted(personnel.map((person) => person.mos)),
			ranks: uniqueSorted(personnel.map((person) => person.rank)),
			roles: uniqueSorted(personnel.map((person) => person.clinicRole))
		}
	};
}

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

function expirationCliff(percent: number, mos = '11B'): IctExpirationCliff {
	return {
		mosSeries: [mos],
		months: [
			{
				month: '2026-04',
				label: 'Apr 2026',
				totalExpiringCount: 0,
				mosSegments: [{ mos, expiringCount: 0 }]
			},
			{
				month: '2026-05',
				label: 'May 2026',
				totalExpiringCount: 1,
				mosSegments: [{ mos, expiringCount: 1 }]
			},
			{
				month: '2026-06',
				label: 'Jun 2026',
				totalExpiringCount: 0,
				mosSegments: [{ mos, expiringCount: 0 }]
			},
			{
				month: '2026-07',
				label: 'Jul 2026',
				totalExpiringCount: 0,
				mosSegments: [{ mos, expiringCount: 0 }]
			},
			{
				month: '2026-08',
				label: 'Aug 2026',
				totalExpiringCount: 0,
				mosSegments: [{ mos, expiringCount: 0 }]
			},
			{
				month: '2026-09',
				label: 'Sep 2026',
				totalExpiringCount: 0,
				mosSegments: [{ mos, expiringCount: 0 }]
			}
		],
		projectedReadinessAtMonth6: {
			month: '2026-09',
			label: 'Sep 2026',
			readinessPercent: percent,
			readyCount: percent,
			applicableCount: 100
		}
	};
}

function readinessMatrix(percent: number, mos = '11B'): IctReadinessMatrix {
	return {
		hasCategorizedTasks: true,
		categories: [{ key: 'category:medical', label: 'Medical', isUncategorized: false }],
		rows: [
			{
				mos,
				personnelCount: 1,
				averageReadinessPercent: percent,
				averageReadyCount: percent,
				averageApplicableCount: 100,
				averageTier: percent >= 90 ? 'good' : percent >= 70 ? 'caution' : percent >= 60 ? 'warn' : 'danger',
				cells: [
					{
						categoryKey: 'category:medical',
						categoryLabel: 'Medical',
						readinessPercent: percent,
						readyCount: percent,
						applicableCount: 100,
						tier: percent >= 90 ? 'good' : percent >= 70 ? 'caution' : percent >= 60 ? 'warn' : 'danger'
					}
				]
			}
		]
	};
}

const distributionBins = [
	{ key: '0-20', label: '0-20%', minPercent: 0, maxPercent: 20 },
	{ key: '20-40', label: '20-40%', minPercent: 20, maxPercent: 40 },
	{ key: '40-60', label: '40-60%', minPercent: 40, maxPercent: 60 },
	{ key: '60-80', label: '60-80%', minPercent: 60, maxPercent: 80 },
	{ key: '80-100', label: '80-100%', minPercent: 80, maxPercent: 100 }
];

function readinessDistribution(defaultMos = '11B', mosValues = [defaultMos]): IctReadinessDistribution {
	const countsByMos: Record<string, number[]> = {
		'11B': [1, 0, 0, 1, 1],
		'68W': [0, 1, 0, 0, 1]
	};

	return {
		bins: distributionBins,
		defaultMos,
		series: mosValues.map((mos) => {
			const counts = countsByMos[mos] ?? [0, 0, 0, 0, 0];
			return {
				mos,
				personnelCount: counts.reduce((total, count) => total + count, 0),
				bins: distributionBins.map((bin, index) => ({ ...bin, soldierCount: counts[index] ?? 0 }))
			};
		})
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
			totalApplicable: 2,
			thresholdPercent: 70
		},
		tasksExpiringSoon: {
			count: 1,
			affectedSoldiers: 1,
			windowDays: 45
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
	readinessTrend: readinessTrend(67),
	expirationCliff: expirationCliff(58),
	readinessMatrix: readinessMatrix(67),
	readinessDistribution: readinessDistribution('11B', ['11B', '68W'])
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
			totalApplicable: 1,
			thresholdPercent: 70
		},
		tasksExpiringSoon: {
			count: 0,
			affectedSoldiers: 0,
			windowDays: 60
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
	readinessTrend: readinessTrend(100, '68W'),
	expirationCliff: expirationCliff(100, '68W'),
	readinessMatrix: readinessMatrix(100, '68W'),
	readinessDistribution: readinessDistribution('68W', ['68W', '11B'])
};

let measuredToolbarWidth = 960;

describe('IctReportsView', () => {
	beforeEach(() => {
		measuredToolbarWidth = 960;

		function measuredWidth(element: HTMLElement): number {
			if (element.matches('[data-toolbar]')) return measuredToolbarWidth;
			if (element.classList.contains('toolbar__leading')) return 580;
			if (element.classList.contains('toolbar__actions')) return 180;
			if (element.hasAttribute('data-toolbar-actions')) return 160;
			if (element.hasAttribute('data-measure-full')) return 112;
			if (element.hasAttribute('data-measure-compact')) return 40;
			if (element.classList.contains('toolbar-action--full')) return 112;
			if (element.classList.contains('toolbar-action--compact')) return 40;
			if (element.classList.contains('toolbar-overflow-menu__button')) return 40;
			if (element.classList.contains('toolbar-group')) return 560;
			return 720;
		}

		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
			const width = measuredWidth(this);
			return {
				x: 0,
				y: 0,
				width,
				height: 320,
				top: 0,
				right: width,
				bottom: 320,
				left: 0,
				toJSON: () => ({})
			} as DOMRect;
		});
		vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
			return measuredWidth(this);
		});
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

	it('updates the report and population when a Group filter is selected', async () => {
		render(IctReportsView, {
			props: {
				orgId: 'org-1',
				reportScope: makeReportScope(),
				initialDashboard
			}
		});

		const report = screen.getByRole('region', { name: 'Critical task analysis console' });
		expect(within(report).getAllByText('67%').length).toBeGreaterThan(0);
		expect(within(report).getByLabelText('Critical task report scope').textContent).toMatch(/Population\s*2/);

		await fireEvent.pointerDown(screen.getByRole('button', { name: 'Filter by group' }));
		const alphaOption = screen.getByRole('option', { name: 'Alpha' });
		await fireEvent.pointerDown(alphaOption);
		await fireEvent.pointerUp(alphaOption);

		await waitFor(() => {
			expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toContain(
				'/org/org-1/api/critical-tasks/reports/summary?groupId=group-alpha'
			);
			expect(within(report).getAllByText('100%').length).toBeGreaterThan(0);
			expect(within(report).getByLabelText('Critical task report scope').textContent).toMatch(/Population\s*1/);
		});
	});

	it('keeps toolbar actions and filters visible for the empty task-library state', () => {
		render(IctReportsView, {
			props: {
				orgId: 'org-1',
				reportScope: makeReportScope({ personnel: [medic], groups: [alpha], tasks: [] }),
				initialDashboard
			}
		});

		expect(screen.getByRole('button', { name: 'Export Excel' })).toBeTruthy();
		expect(screen.getByLabelText('Filter by group')).toBeTruthy();
		expect(screen.getByLabelText('Filter by MOS')).toBeTruthy();
		expect(screen.getByText('No active critical tasks configured.')).toBeTruthy();
	});

	it('shows the empty report state when only archived critical tasks remain', () => {
		render(IctReportsView, {
			props: {
				orgId: 'org-1',
				reportScope: makeReportScope({
					personnel: [medic],
					groups: [alpha],
					tasks: [{ ...medicTask, archivedAt: '2026-04-01T00:00:00Z' }]
				}),
				initialDashboard
			}
		});

		expect(screen.getByRole('button', { name: 'Export Excel' })).toBeTruthy();
		expect(screen.getByText('No active critical tasks configured.')).toBeTruthy();
		expect(screen.queryByRole('region', { name: 'Critical task report metrics' })).toBeNull();
		expect(screen.queryByRole('region', { name: 'Critical task analysis console' })).toBeNull();
	});
});
