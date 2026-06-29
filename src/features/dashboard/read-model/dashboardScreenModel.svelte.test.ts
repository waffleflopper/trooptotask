import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AvailabilityEntry, Personnel, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { AssignmentType, DailyAssignment } from '$lib/types';
import { createDashboardScreenModel, type DashboardStoragePort } from './dashboardScreenModel.svelte';
import type { DashboardWorkspaceResult } from '../server/dashboardWorkspaceBootstrap';
import type { DashboardPageData } from '../dashboard.types';
import type {
	StarterConfigurationPackApplyResult,
	StarterConfigurationPackSupport
} from '$lib/types/starterConfigurationPacks';

afterEach(() => {
	vi.unstubAllGlobals();
});

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

function makeStarterPack(overrides: Partial<StarterConfigurationPackSupport> = {}): StarterConfigurationPackSupport {
	return {
		id: 'first-week-operations',
		name: 'First Week Operations',
		description: 'Optional starter configuration for common first-week setup.',
		editableCopy: 'Creates editable workflow configuration artifacts.',
		artifacts: [
			{
				family: 'training-types',
				label: 'Training Types',
				names: ['Unit Orientation', 'Required Annual Training'],
				description: 'Adds starter training requirements.'
			}
		],
		readiness: [],
		canApply: true,
		deniedActions: [],
		isFullyApplied: false,
		...overrides
	};
}

function makeApplyResult(
	overrides: Partial<StarterConfigurationPackApplyResult> = {}
): StarterConfigurationPackApplyResult {
	return {
		packId: 'first-week-operations',
		packName: 'First Week Operations',
		created: [{ family: 'training-types', name: 'Unit Orientation' }],
		skipped: [],
		failed: [],
		...overrides
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
	});

	it('rolls back getting started dismissal when the request fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
		const model = createDashboardScreenModel(makeData(), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});

		await model.dismissGettingStarted();

		expect(model.gettingStartedDismissed).toBe(false);
	});

	it('rolls back getting started dismissal when the request rejects', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
		const model = createDashboardScreenModel(makeData(), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});

		await expect(model.dismissGettingStarted()).resolves.toBeUndefined();

		expect(model.gettingStartedDismissed).toBe(false);
	});

	it('builds incomplete getting started items from workspace and support counts', () => {
		const model = createDashboardScreenModel(
			makeData(
				{
					userRole: 'owner',
					onboardingTemplateStepCount: 0,
					ratingSchemeEntryCount: 1,
					orgMemberCount: 1,
					dutyRosterTemplateCount: 0,
					dutyRosterRunCount: 0,
					dutyRosterHistoryCount: 0,
					gettingStartedDismissed: false
				},
				{
					personnel: [{ id: 'p1' }],
					statusTypes: [{ id: 'status-1' }],
					trainingTypes: [],
					assignmentTypes: [{ id: 'assignment-1' }]
				}
			),
			{
				storage: createMemoryStorage(),
				sources: makeSources()
			}
		);

		expect(model.gettingStartedItems.map((item) => [item.id, item.complete])).toEqual([
			['personnel', true],
			['statuses', false],
			['training', false],
			['assignments', false],
			['duty-roster', false],
			['members', false],
			['onboarding', false],
			['ratings', true]
		]);
		expect(model.gettingStartedItems.find((item) => item.id === 'personnel')).toMatchObject({
			label: 'Import or add the roster',
			href: '/org/org-1/personnel'
		});
		expect(model.gettingStartedItems.find((item) => item.id === 'statuses')).toMatchObject({
			label: 'Review availability statuses'
		});
		expect(model.gettingStartedItems.find((item) => item.id === 'assignments')).toMatchObject({
			label: 'Review duty assignments'
		});
		expect(model.shouldShowGettingStarted).toBe(true);
	});

	it('treats legacy duty roster history as Duty Roster setup progress', () => {
		const model = createDashboardScreenModel(
			makeData(
				{
					userRole: 'owner',
					onboardingTemplateStepCount: 0,
					ratingSchemeEntryCount: 0,
					orgMemberCount: 1,
					dutyRosterTemplateCount: 0,
					dutyRosterRunCount: 0,
					dutyRosterHistoryCount: 1,
					gettingStartedDismissed: false
				},
				{
					personnel: [{ id: 'p1' }],
					statusTypes: [{ id: 'status-1' }],
					trainingTypes: [],
					assignmentTypes: []
				}
			),
			{
				storage: createMemoryStorage(),
				sources: makeSources()
			}
		);

		expect(model.gettingStartedItems.find((item) => item.id === 'duty-roster')?.complete).toBe(true);
	});

	it('shows the checklist after deferred support data arrives', () => {
		const model = createDashboardScreenModel(
			makeData(
				{
					userRole: 'admin',
					onboardingTemplateStepCount: undefined,
					ratingSchemeEntryCount: undefined,
					orgMemberCount: undefined,
					dutyRosterTemplateCount: undefined,
					dutyRosterRunCount: undefined,
					dutyRosterHistoryCount: undefined,
					gettingStartedDismissed: undefined
				},
				{
					personnel: [{ id: 'p1' }],
					statusTypes: [{ id: 'status-1' }],
					trainingTypes: [{ id: 'training-1' }],
					assignmentTypes: [{ id: 'assignment-1' }]
				}
			),
			{
				storage: createMemoryStorage(),
				sources: makeSources()
			}
		);

		expect(model.hasSupportData).toBe(false);
		expect(model.shouldShowGettingStarted).toBe(false);

		model.applySupportData({
			trainingTypeCount: 1,
			onboardingTemplateStepCount: 1,
			ratingSchemeEntryCount: 1,
			orgMemberCount: 1,
			dutyRosterTemplateCount: 1,
			dutyRosterRunCount: 0,
			dutyRosterHistoryCount: 0,
			gettingStartedDismissed: false,
			starterConfigurationPacks: [makeStarterPack()]
		});

		expect(model.hasSupportData).toBe(true);
		expect(model.shouldShowGettingStarted).toBe(true);
		expect(model.gettingStartedItems.find((item) => item.id === 'members')?.complete).toBe(false);
		expect(model.firstStarterConfigurationPack?.name).toBe('First Week Operations');
	});

	it('keeps seeded-default review tasks open until dismissed', () => {
		const model = createDashboardScreenModel(
			makeData(
				{
					userRole: 'owner',
					onboardingTemplateStepCount: 2,
					ratingSchemeEntryCount: 1,
					orgMemberCount: 2,
					dutyRosterTemplateCount: 1,
					dutyRosterRunCount: 0,
					dutyRosterHistoryCount: 0,
					gettingStartedDismissed: false
				},
				{
					personnel: [{ id: 'p1' }],
					statusTypes: [{ id: 'status-1' }],
					trainingTypes: [{ id: 'training-1' }],
					assignmentTypes: [{ id: 'assignment-1' }]
				}
			),
			{
				storage: createMemoryStorage(),
				sources: makeSources()
			}
		);

		expect(model.gettingStartedItems.filter((item) => !item.complete).map((item) => item.id)).toEqual([
			'statuses',
			'assignments'
		]);
		expect(model.shouldShowGettingStarted).toBe(true);

		model.applySupportData({
			trainingTypeCount: 0,
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 1,
			dutyRosterTemplateCount: 0,
			dutyRosterRunCount: 0,
			dutyRosterHistoryCount: 0,
			gettingStartedDismissed: true,
			starterConfigurationPacks: []
		});

		expect(model.gettingStartedDismissed).toBe(true);
		expect(model.shouldShowGettingStarted).toBe(false);
	});

	it('uses refreshed support training counts for checklist completion', () => {
		const model = createDashboardScreenModel(
			makeData(
				{
					userRole: 'owner',
					onboardingTemplateStepCount: 0,
					ratingSchemeEntryCount: 0,
					orgMemberCount: 1,
					dutyRosterTemplateCount: 0,
					dutyRosterRunCount: 0,
					dutyRosterHistoryCount: 0,
					gettingStartedDismissed: false
				},
				{
					personnel: [{ id: 'p1' }],
					trainingTypes: []
				}
			),
			{
				storage: createMemoryStorage(),
				sources: makeSources()
			}
		);

		expect(model.gettingStartedItems.find((item) => item.id === 'training')?.complete).toBe(false);

		model.applySupportData({
			trainingTypeCount: 2,
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 1,
			dutyRosterTemplateCount: 0,
			dutyRosterRunCount: 0,
			dutyRosterHistoryCount: 0,
			gettingStartedDismissed: false,
			starterConfigurationPacks: [makeStarterPack()]
		});

		expect(model.trainingTypeCount).toBe(2);
		expect(model.gettingStartedItems.find((item) => item.id === 'training')?.complete).toBe(true);
	});

	it('applies a starter pack and refreshes support data after success', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeApplyResult()
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					trainingTypeCount: 2,
					onboardingTemplateStepCount: 4,
					ratingSchemeEntryCount: 0,
					orgMemberCount: 1,
					dutyRosterTemplateCount: 1,
					dutyRosterRunCount: 0,
					dutyRosterHistoryCount: 0,
					gettingStartedDismissed: false,
					starterConfigurationPacks: [makeStarterPack({ isFullyApplied: true })]
				})
			});
		vi.stubGlobal('fetch', fetchMock);
		const model = createDashboardScreenModel(makeData({ userRole: 'owner' }), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});
		model.applySupportData({
			trainingTypeCount: 0,
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 1,
			dutyRosterTemplateCount: 0,
			dutyRosterRunCount: 0,
			dutyRosterHistoryCount: 0,
			gettingStartedDismissed: false,
			starterConfigurationPacks: [makeStarterPack()]
		});

		const result = await model.applyStarterConfigurationPack('first-week-operations');

		expect(result).toMatchObject({ packName: 'First Week Operations' });
		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			'/org/org-1/api/starter-configuration-packs/first-week-operations/apply',
			{
				method: 'POST'
			}
		);
		expect(fetchMock).toHaveBeenNthCalledWith(2, '/org/org-1/api/getting-started');
		expect(model.starterPackApplyState.status).toBe('success');
		expect(model.firstStarterConfigurationPack?.isFullyApplied).toBe(true);
		expect(model.gettingStartedItems.find((item) => item.id === 'training')?.complete).toBe(true);
		expect(model.gettingStartedItems.find((item) => item.id === 'onboarding')?.complete).toBe(true);
		expect(model.gettingStartedItems.find((item) => item.id === 'duty-roster')?.complete).toBe(true);
	});

	it('refreshes support data while keeping error state when starter pack application reports failed artifacts', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () =>
					makeApplyResult({
						created: [],
						failed: [
							{
								family: 'training-types',
								name: 'Unit Orientation',
								message: 'This starter artifact could not be created. Existing configuration was left unchanged.'
							}
						]
					})
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					trainingTypeCount: 1,
					onboardingTemplateStepCount: 4,
					ratingSchemeEntryCount: 0,
					orgMemberCount: 1,
					dutyRosterTemplateCount: 1,
					dutyRosterRunCount: 0,
					dutyRosterHistoryCount: 0,
					gettingStartedDismissed: false,
					starterConfigurationPacks: [makeStarterPack({ isFullyApplied: false })]
				})
			});
		vi.stubGlobal('fetch', fetchMock);
		const model = createDashboardScreenModel(makeData({ userRole: 'owner' }), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});
		model.applySupportData({
			trainingTypeCount: 0,
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 1,
			dutyRosterTemplateCount: 0,
			dutyRosterRunCount: 0,
			dutyRosterHistoryCount: 0,
			gettingStartedDismissed: false,
			starterConfigurationPacks: [makeStarterPack()]
		});

		const result = await model.applyStarterConfigurationPack('first-week-operations');

		expect(result).toBeNull();
		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			'/org/org-1/api/starter-configuration-packs/first-week-operations/apply',
			{
				method: 'POST'
			}
		);
		expect(fetchMock).toHaveBeenNthCalledWith(2, '/org/org-1/api/getting-started');
		expect(model.starterPackApplyState).toMatchObject({
			status: 'error',
			message: 'Some starter artifacts could not be created.'
		});
		expect(model.trainingTypeCount).toBe(1);
		expect(model.gettingStartedItems.find((item) => item.id === 'onboarding')?.complete).toBe(true);
		expect(model.firstStarterConfigurationPack?.isFullyApplied).toBe(false);
	});

	it('preserves starter pack apply error details from failed responses', async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce({
			ok: false,
			json: async () => ({ message: 'Organization is in read-only mode' })
		});
		vi.stubGlobal('fetch', fetchMock);
		const model = createDashboardScreenModel(makeData({ userRole: 'owner' }), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});

		const result = await model.applyStarterConfigurationPack('first-week-operations');

		expect(result).toBeNull();
		expect(model.starterPackApplyState).toMatchObject({
			status: 'error',
			message: 'Organization is in read-only mode',
			result: null
		});
	});

	it('reports starter pack success when only checklist refresh fails', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => makeApplyResult()
			})
			.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: 'Support data temporarily unavailable' })
			});
		vi.stubGlobal('fetch', fetchMock);
		const model = createDashboardScreenModel(makeData({ userRole: 'owner' }), {
			storage: createMemoryStorage(),
			sources: makeSources()
		});
		model.applySupportData({
			trainingTypeCount: 0,
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 1,
			dutyRosterTemplateCount: 0,
			dutyRosterRunCount: 0,
			dutyRosterHistoryCount: 0,
			gettingStartedDismissed: false,
			starterConfigurationPacks: [makeStarterPack()]
		});

		const result = await model.applyStarterConfigurationPack('first-week-operations');

		expect(result).toMatchObject({ packName: 'First Week Operations' });
		expect(model.starterPackApplyState).toMatchObject({
			status: 'success',
			result
		});
		expect(model.starterPackApplyState.message).toContain('First Week Operations applied');
		expect(model.starterPackApplyState.message).toContain('setup checklist could not refresh');
		expect(model.starterPackApplyState.message).toContain('Reload the page');
		expect(model.starterPackApplyState.message).toContain('Support data temporarily unavailable');
		expect(model.trainingTypeCount).toBe(0);
	});

	it('does not show owner setup prompts to non-privileged members', () => {
		const model = createDashboardScreenModel(
			makeData({
				userRole: 'member',
				onboardingTemplateStepCount: 0,
				ratingSchemeEntryCount: 0,
				orgMemberCount: 1,
				dutyRosterTemplateCount: 0,
				dutyRosterRunCount: 0,
				dutyRosterHistoryCount: 0,
				gettingStartedDismissed: false
			}),
			{
				storage: createMemoryStorage(),
				sources: makeSources()
			}
		);

		expect(model.hasSupportData).toBe(true);
		expect(model.gettingStartedItems.some((item) => !item.complete)).toBe(true);
		expect(model.shouldShowGettingStarted).toBe(false);
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
