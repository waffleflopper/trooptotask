// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { AvailabilityEntry, StatusType, DailyAssignment, AssignmentType } from '$features/calendar/contracts';
import type { Group } from '$features/personnel/contracts';
import { createDashboardScreenModel } from './dashboardScreenModel.svelte';
import { arrivingAndLeavingReadiness } from '../sections/readiness';
import type { DashboardWorkspaceResult } from '../contracts';
import type { DashboardPageData } from '../contracts';
import type {
	StarterConfigurationPackApplyResult,
	StarterConfigurationPackSupport
} from '$features/dashboard/contracts';

afterEach(() => {
	vi.unstubAllGlobals();
});

function makeData(
	overrides: Partial<DashboardPageData> = {},
	workspaceOverrides: Record<string, unknown> = {}
): DashboardPageData {
	return {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		viewerDay: { date: '2026-04-23', timeZone: 'UTC' },
		disabledFeatures: [],
		dashboard: {
			workspaceKey: 'dashboard',
			data: {
				availabilityEntries: [],
				assignmentTypes: [],
				todayAssignments: [],
				range: { rangeStart: '2026-04-30', rangeEnd: '2026-05-15' },
				pinnedGroups: [],
				activeOnboardings: [],
				ratingSchemeEntries: [],
				personnel: [],
				groups: [],
				statusTypes: [],
				trainingTypes: [],
				lossWarningWindowDays: 180,
				strengthFloorPercent: 80,
				awardTrackingAcknowledgedPersonnelIds: [],
				specialDays: [],
				...workspaceOverrides
			},
			hydration: { orgId: 'org-1' } as DashboardWorkspaceResult['hydration']
		},
		trainingSummary: null,
		ictlSummary: null,
		summaryFailed: false,
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
			sources: makeSources()
		});

		await model.dismissGettingStarted();

		expect(model.gettingStartedDismissed).toBe(true);
		expect(fetch).toHaveBeenCalledWith('/org/org-1/api/getting-started', { method: 'POST' });
	});

	it('rolls back getting started dismissal when the request fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
		const model = createDashboardScreenModel(makeData(), {
			sources: makeSources()
		});

		await model.dismissGettingStarted();

		expect(model.gettingStartedDismissed).toBe(false);
	});

	it('rolls back getting started dismissal when the request rejects', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
		const model = createDashboardScreenModel(makeData(), {
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
				sources: makeSources()
			}
		);

		expect(model.gettingStartedItems.map((item) => [item.id, item.complete])).toEqual([
			['personnel', true],
			['statuses', false],
			['training', false],
			['assignments', false],
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

	it('shows the checklist after deferred support data arrives', () => {
		const model = createDashboardScreenModel(
			makeData(
				{
					userRole: 'admin',
					onboardingTemplateStepCount: undefined,
					ratingSchemeEntryCount: undefined,
					orgMemberCount: undefined,
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
					gettingStartedDismissed: false
				},
				{
					personnel: [{ id: 'p1' }],
					trainingTypes: []
				}
			),
			{
				sources: makeSources()
			}
		);

		expect(model.gettingStartedItems.find((item) => item.id === 'training')?.complete).toBe(false);

		model.applySupportData({
			trainingTypeCount: 2,
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 1,
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
					gettingStartedDismissed: false,
					starterConfigurationPacks: [makeStarterPack({ isFullyApplied: true })]
				})
			});
		vi.stubGlobal('fetch', fetchMock);
		const model = createDashboardScreenModel(makeData({ userRole: 'owner' }), {
			sources: makeSources()
		});
		model.applySupportData({
			trainingTypeCount: 0,
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 1,
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
					gettingStartedDismissed: false,
					starterConfigurationPacks: [makeStarterPack({ isFullyApplied: false })]
				})
			});
		vi.stubGlobal('fetch', fetchMock);
		const model = createDashboardScreenModel(makeData({ userRole: 'owner' }), {
			sources: makeSources()
		});
		model.applySupportData({
			trainingTypeCount: 0,
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 1,
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
			sources: makeSources()
		});
		model.applySupportData({
			trainingTypeCount: 0,
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 1,
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
				gettingStartedDismissed: false
			}),
			{
				sources: makeSources()
			}
		);

		expect(model.hasSupportData).toBe(true);
		expect(model.gettingStartedItems.some((item) => !item.complete)).toBe(true);
		expect(model.shouldShowGettingStarted).toBe(false);
	});
});

describe('Dashboard today availability', () => {
	const roster = {
		personnel: [
			{ id: 'p1', rank: 'SGT', firstName: 'Ann', lastName: 'Smith', groupId: 'g1' },
			{ id: 'p2', rank: 'SPC', firstName: 'Bo', lastName: 'Jones', groupId: 'g1' },
			{ id: 'p3', rank: 'SPC', firstName: 'Cy', lastName: 'Lee', groupId: 'g2' },
			{ id: 'p4', rank: 'PFC', firstName: 'Di', lastName: 'Gone', groupId: 'g1', archivedAt: '2026-04-01T00:00:00Z' }
		],
		groups: [
			{ id: 'g2', name: 'Bravo', sortOrder: 2 },
			{ id: 'g1', name: 'Alpha', sortOrder: 1 }
		],
		statusTypes: [
			{ id: 'leave', name: 'Leave', color: '#aa0000', textColor: '#ffffff', sortOrder: 0 },
			{ id: 'school', name: 'School', color: '#0000aa', textColor: '#ffffff', sortOrder: 1 }
		]
	};

	it('counts each active Person out today once, under the first status type in catalog order', () => {
		const model = createDashboardScreenModel(makeData({ viewerDay: { date: '2026-04-23', timeZone: 'UTC' } }), {
			sources: makeSources({
				...roster,
				availabilityEntries: [
					{ id: 'a1', personnelId: 'p1', statusTypeId: 'leave', startDate: '2026-04-22', endDate: '2026-04-24' },
					{ id: 'a2', personnelId: 'p1', statusTypeId: 'school', startDate: '2026-04-23', endDate: '2026-04-23' },
					{ id: 'a3', personnelId: 'p3', statusTypeId: 'school', startDate: '2026-04-23', endDate: '2026-04-25' },
					{ id: 'a4', personnelId: 'p4', statusTypeId: 'leave', startDate: '2026-04-23', endDate: '2026-04-23' },
					{ id: 'a5', personnelId: 'p2', statusTypeId: 'leave', startDate: '2026-04-24', endDate: '2026-04-26' },
					{ id: 'a6', personnelId: 'unknown', statusTypeId: 'leave', startDate: '2026-04-23', endDate: '2026-04-23' }
				]
			})
		});

		expect(model.totalPersonnel).toBe(3);
		const { bottomLine } = model.strength;
		expect([bottomLine.available, bottomLine.assigned, bottomLine.percent]).toEqual([1, 3, 33]);
		expect(
			bottomLine.outPeople.map(({ personnelId, name, statusTypeId }) => [personnelId, name, statusTypeId])
		).toEqual([
			['p1', 'SGT Smith, Ann', 'leave'],
			['p3', 'SPC Lee, Cy', 'school']
		]);
		expect(bottomLine.strip.map(({ statusTypeId, count }) => [statusTypeId, count])).toEqual([
			[null, 1],
			['leave', 1],
			['school', 1]
		]);
	});

	it('reuses the strength rows until a source changes', () => {
		const availability = $state({
			items: [
				{ id: 'a1', personnelId: 'p1', statusTypeId: 'leave', startDate: '2026-04-23', endDate: '2026-04-23' }
			] as AvailabilityEntry[],
			loading: false
		});
		const model = createDashboardScreenModel(makeData({ viewerDay: { date: '2026-04-23', timeZone: 'UTC' } }), {
			sources: { ...makeSources(roster), availability }
		});

		const strength = model.strength;
		expect(model.strength).toBe(strength);

		availability.items = [
			...availability.items,
			{
				id: 'a2',
				personnelId: 'p2',
				statusTypeId: 'school',
				startDate: '2026-04-23',
				endDate: '2026-04-23'
			} as AvailabilityEntry
		];

		expect(model.strength).not.toBe(strength);
		expect(model.strength.bottomLine.outPeople.map(({ personnelId }) => personnelId)).toEqual(['p1', 'p2']);
	});
});

describe('Dashboard losses', () => {
	it('leaves archived People out of the readiness losses', () => {
		const model = createDashboardScreenModel(makeData({ viewerDay: { date: '2026-04-23', timeZone: 'UTC' } }), {
			sources: makeSources({
				personnel: [
					{ id: 'leaving', rank: 'SGT', firstName: 'Ann', lastName: 'Smith', ets: '2026-06-01' },
					{
						id: 'archived',
						rank: 'SPC',
						firstName: 'Di',
						lastName: 'Gone',
						ets: '2026-05-01',
						archivedAt: '2026-04-01T00:00:00Z'
					}
				]
			})
		});

		expect(arrivingAndLeavingReadiness(model.inputs, { can: () => false })).toMatchObject({
			figure: '1',
			note: 'Smith ETS 1 Jun.'
		});
	});
});
