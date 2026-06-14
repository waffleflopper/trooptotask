import { describe, expect, it, vi } from 'vitest';
import type { AvailabilityEntry, Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { AssignmentType, DailyAssignment } from '$lib/types';
import { createDashboardScreenModel, type DashboardStoragePort } from './dashboardScreenModel.svelte';
import type { DashboardWorkspaceResult } from '../server/dashboardWorkspaceBootstrap';
import type { DashboardPageData } from '../dashboard.types';

function createMemoryStorage(initial: Record<string, string> = {}): DashboardStoragePort & {
	values: Record<string, string>;
} {
	return {
		values: { ...initial },
		getItem(key: string) {
			return this.values[key] ?? null;
		},
		setItem(key: string, value: string) {
			this.values[key] = value;
		}
	};
}

function makeData(
	overrides: Partial<DashboardPageData> = {},
	workspaceOverrides: Record<string, unknown> = {}
): DashboardPageData {
	return {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		dashboard: {
			workspaceKey: 'dashboard',
			data: {
				availabilityEntries: [],
				assignmentTypes: [],
				todayAssignments: [],
				pinnedGroups: [],
				activeOnboardings: [],
				ratingSchemeEntries: [],
				todayDutyEvents: [],
				personnel: [],
				groups: [],
				statusTypes: [],
				trainingTypes: [],
				lossWarningWindowDays: 180,
				awardTrackingAcknowledgedPersonnelIds: [],
				...workspaceOverrides
			},
			hydration: { orgId: 'org-1' } as DashboardWorkspaceResult['hydration']
		},
		trainingSummary: null,
		ictlSummary: null,
		onboardingTrainingCompletions: [],
		...overrides
	};
}

function makeSources(
	input: {
		personnel?: Partial<Personnel>[];
		statusTypes?: Partial<StatusType>[];
		availabilityEntries?: Partial<AvailabilityEntry>[];
		groups?: Partial<Group>[];
		assignmentTypes?: Partial<AssignmentType>[];
		dailyAssignments?: Partial<DailyAssignment>[];
		pinnedGroups?: string[];
		loading?: Partial<Record<'personnel' | 'statusTypes' | 'availability' | 'dailyAssignments' | 'groups', boolean>>;
	} = {}
) {
	return {
		personnel: {
			items: (input.personnel ?? []) as Personnel[],
			loading: input.loading?.personnel ?? false
		},
		statusTypes: {
			items: (input.statusTypes ?? []) as StatusType[],
			loading: input.loading?.statusTypes ?? false
		},
		availability: {
			items: (input.availabilityEntries ?? []) as AvailabilityEntry[],
			loading: input.loading?.availability ?? false
		},
		dailyAssignments: {
			assignments: (input.dailyAssignments ?? []) as DailyAssignment[],
			types: (input.assignmentTypes ?? []) as AssignmentType[],
			loading: input.loading?.dailyAssignments ?? false
		},
		groups: {
			items: (input.groups ?? []) as Group[],
			loading: input.loading?.groups ?? false
		},
		pinnedGroups: {
			list: input.pinnedGroups ?? []
		}
	};
}

describe('createDashboardScreenModel', () => {
	it('keeps getting started dismissed after a successful dismissal request', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
		const model = createDashboardScreenModel(makeData(), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});

		await model.dismissGettingStarted();

		expect(model.gettingStartedDismissed).toBe(true);
		expect(fetch).toHaveBeenCalledWith('/org/org-1/api/getting-started', { method: 'POST' });
		vi.unstubAllGlobals();
	});

	it('rolls back getting started dismissal when the request fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
		const model = createDashboardScreenModel(makeData(), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});

		await model.dismissGettingStarted();

		expect(model.gettingStartedDismissed).toBe(false);
		vi.unstubAllGlobals();
	});

	it('rolls back getting started dismissal when the request rejects', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
		const model = createDashboardScreenModel(makeData(), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});

		await expect(model.dismissGettingStarted()).resolves.toBeUndefined();

		expect(model.gettingStartedDismissed).toBe(false);
		vi.unstubAllGlobals();
	});

	it('pre-shapes upcoming changes with the persisted grouping mode', () => {
		const storage = createMemoryStorage({ 'dashboard-upcoming-group-by': 'group' });
		const model = createDashboardScreenModel(makeData(), {
			today: '2026-04-23',
			storage,
			sources: makeSources({
				personnel: [
					{ id: 'p1', rank: 'SGT', firstName: 'Ann', lastName: 'Smith', groupId: 'g1' },
					{ id: 'p2', rank: 'SPC', firstName: 'Bo', lastName: 'Jones', groupId: null }
				],
				groups: [{ id: 'g1', name: 'Alpha', sortOrder: 1 }],
				statusTypes: [{ id: 'st1', name: 'Leave', color: '#aa0000', textColor: '#ffffff' }],
				availabilityEntries: [
					{ id: 'a1', personnelId: 'p1', statusTypeId: 'st1', startDate: '2026-04-25', endDate: '2026-04-27' },
					{ id: 'a2', personnelId: 'p2', statusTypeId: 'st1', startDate: '2026-04-26', endDate: '2026-04-28' }
				]
			})
		});

		expect(model.unitReadiness.upcomingChanges.mode).toBe('group');
		expect(model.unitReadiness.upcomingChanges.byGroup.map(([label]) => label)).toEqual(['Alpha', 'Unassigned']);

		model.unitReadiness.upcomingChanges.setMode('date');

		expect(model.unitReadiness.upcomingChanges.mode).toBe('date');
		expect(storage.values['dashboard-upcoming-group-by']).toBe('date');
		expect(model.upcomingChanges.map((change) => change.date)).toEqual([
			'2026-04-25',
			'2026-04-26',
			'2026-04-27',
			'2026-04-28'
		]);
	});

	it('defaults today through the shared date formatter when no explicit date is supplied', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-23T12:00:00'));

		const model = createDashboardScreenModel(makeData(), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});

		expect(model.today).toBe('2026-04-23');

		vi.useRealTimers();
	});
});
