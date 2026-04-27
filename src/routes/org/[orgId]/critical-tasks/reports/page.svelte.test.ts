// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import type { IctReportDashboard } from '$features/critical-tasks/utils/ictReports';

const { mockOrgContext } = vi.hoisted(() => ({
	mockOrgContext: {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		isFullEditor: true,
		permissions: {},
		scopedGroupId: null,
		readOnly: false
	}
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => mockOrgContext
}));

const alpha: Group = { id: 'group-alpha', name: 'Alpha', sortOrder: 0 };
const bravo: Group = { id: 'group-bravo', name: 'Bravo', sortOrder: 1 };

const personnel: Personnel[] = [
	{
		id: 'person-1',
		rank: 'SGT',
		firstName: 'Jane',
		lastName: 'Smith',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: alpha.id,
		groupName: alpha.name,
		archivedAt: null
	},
	{
		id: 'person-2',
		rank: 'CPL',
		firstName: 'Alex',
		lastName: 'Jones',
		mos: '11B',
		clinicRole: 'Rifleman',
		groupId: bravo.id,
		groupName: bravo.name,
		archivedAt: null
	}
];

const task: IctTask = {
	id: 'task-1',
	taskCode: '181-105-1001',
	title: 'Perform tactical combat casualty care',
	description: null,
	mos: [],
	expirationMonths: 12,
	sortOrder: 0,
	archivedAt: null,
	createdAt: '2026-04-01T12:00:00Z'
};

const initialDashboard: IctReportDashboard = {
	kpis: {
		overallReadiness: { percent: 67, deltaPercent: 4, readyCount: 2, applicableCount: 3 },
		soldiersBelow70: { count: 1, totalApplicable: 2, thresholdPercent: 70 },
		tasksExpiringSoon: { count: 1, affectedSoldiers: 1, windowDays: 60 },
		tasksBelowThreshold: { count: 0, thresholdPercent: 70 }
	},
	tasksBelowThreshold: { thresholdPercent: 70, rows: [] },
	atRiskSoldiers: { rows: [] },
	readinessTrend: { comparisonMos: [], months: [] },
	expirationCliff: {
		mosSeries: [],
		months: [],
		projectedReadinessAtMonth6: {
			month: '2026-09',
			label: 'Sep 2026',
			readinessPercent: 67,
			readyCount: 2,
			applicableCount: 3
		}
	},
	readinessMatrix: { hasCategorizedTasks: false, categories: [], rows: [] },
	readinessDistribution: { bins: [], defaultMos: null, series: [] }
};

describe('critical tasks reports route', () => {
	beforeEach(() => {
		personnelStore.load(personnel, 'org-1');
		groupsStore.load([alpha, bravo], 'org-1');
		ictTasksStore.load([task], 'org-1');
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => initialDashboard
			}))
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		personnelStore.load([], 'org-test-reset');
		groupsStore.load([], 'org-test-reset');
		ictTasksStore.load([], 'org-test-reset');
	});

	it('wires report toolbar filters and export action through the route', async () => {
		render(Page, { props: { data: { initialDashboard } } });

		expect(screen.getByRole('toolbar', { name: 'Critical task report controls' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(
			'/org/org-1/api/critical-tasks/reports/export'
		);

		await fireEvent.change(screen.getByLabelText('Filter by group'), { target: { value: 'group-bravo' } });
		await fireEvent.change(screen.getByLabelText('Filter by rank'), { target: { value: 'CPL' } });

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				'/org/org-1/api/critical-tasks/reports/summary?groupId=group-bravo&rank=CPL',
				expect.objectContaining({ signal: expect.any(AbortSignal) })
			);
			expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(
				'/org/org-1/api/critical-tasks/reports/export?groupId=group-bravo&rank=CPL'
			);
		});
	});
});
