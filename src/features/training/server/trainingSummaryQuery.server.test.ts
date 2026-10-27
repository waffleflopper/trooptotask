import { describe, it, expect, vi } from 'vitest';
import { trainingProvider } from './test-support/trainingProvider.server';
import { createSupabaseTrainingCompletionPersistence } from './trainingCompletionPersistence.server';
import {
	createInMemoryDataStore,
	createQueryPortsContext
} from '$features/training/server/trainingPersistence.test-support.server';
import { fetchDashboardTrainingSummary } from './trainingSummaryQuery.server';
import type { Personnel } from '$features/personnel/contracts';
import { formatToday } from '$lib/utils/dates';

const ORG = 'test-org';

function buildCtx() {
	return createQueryPortsContext();
}

function makeTrainingType(id: string, name = 'CPR') {
	return {
		id,
		name,
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [] as string[],
		appliesToMos: [] as string[],
		appliesToRanks: [] as string[],
		excludedRoles: [] as string[],
		excludedMos: [] as string[],
		excludedRanks: [] as string[],
		color: '#0f0',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [] as string[],
		isOptional: false
	};
}

describe('Dashboard Training summary', () => {
	it('denies summary reads without Training view capability', async () => {
		const ctx = createQueryPortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});

		await expect(
			fetchDashboardTrainingSummary(ctx, {
				onboardingPersonnelIds: [],
				asOf: formatToday(),
				personnel: [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' }] as never[],
				trainingTypes: [makeTrainingType('tt1')] as never[]
			})
		).rejects.toMatchObject({ status: 403 });
	});

	it('returns issues for expired trainings', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel_trainings', [
			{
				id: 'pt1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: 'tt1',
				completion_date: '2024-01-01',
				expiration_date: '2025-01-01',
				notes: null,
				certificate_url: null
			}
		]);

		const personnel = [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' }];
		const trainingTypes = [makeTrainingType('tt1')];

		const { trainingSummary: result } = await fetchDashboardTrainingSummary(ctx, {
			onboardingPersonnelIds: [],
			asOf: formatToday(),
			personnel: personnel as never[],
			trainingTypes: trainingTypes as never[]
		});

		expect(result.stats.expired).toBe(1);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0].personName).toBe('SGT Smith, John');
		expect(result.issues[0].status).toBe('expired');
	});
});

describe('fetchDashboardTrainingSummary', () => {
	it('limits readiness facts to the visible population while preserving every onboarding completion key', async () => {
		const ctx = buildCtx();
		const provider = trainingProvider({
			personnel_trainings: [
				{
					id: 'active',
					organization_id: ORG,
					personnel_id: 'p1',
					training_type_id: 'required',
					completion_date: '2024-01-01',
					expiration_date: '2025-01-01',
					notes: 'private',
					certificate_url: 'private.pdf'
				},
				{
					id: 'archived-packet',
					organization_id: ORG,
					personnel_id: 'archived',
					training_type_id: 'old-optional',
					completion_date: null,
					expiration_date: null,
					notes: 'private'
				},
				{
					id: 'unrequested',
					organization_id: ORG,
					personnel_id: 'other',
					training_type_id: 'required',
					completion_date: null,
					expiration_date: null
				}
			]
		});
		ctx.trainingCompletions = createSupabaseTrainingCompletionPersistence(provider.client, ORG);
		const result = await fetchDashboardTrainingSummary(ctx, {
			personnel: [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' }] as Personnel[],
			trainingTypes: [makeTrainingType('required')],
			onboardingPersonnelIds: ['archived'],
			asOf: '2026-09-29'
		});
		expect(result.trainingSummary.stats).toEqual({
			current: 0,
			warningYellow: 0,
			warningOrange: 0,
			expired: 1,
			notCompleted: 0,
			notRequired: 0,
			total: 1
		});
		expect(result.onboardingTrainingCompletions).toEqual(new Set(['archived-old-optional']));
		expect(provider.state.readResponses.flatMap((response) => response.rows)).toEqual([
			{
				id: 'active',
				personnel_id: 'p1',
				training_type_id: 'required',
				completion_date: '2024-01-01',
				expiration_date: '2025-01-01'
			},
			{
				id: 'archived-packet',
				personnel_id: 'archived',
				training_type_id: 'old-optional',
				completion_date: null,
				expiration_date: null
			}
		]);
	});

	it('derives training summary and onboarding completion keys from a single training scan', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		const findManySpy = vi.spyOn(store, 'findMany');

		store.seed('personnel_trainings', [
			{
				id: 'pt1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: 'tt1',
				completion_date: '2024-01-01',
				expiration_date: '2025-01-01',
				notes: null,
				certificate_url: null
			},
			{
				id: 'pt2',
				organization_id: ORG,
				personnel_id: 'p2',
				training_type_id: 'tt1',
				completion_date: '2025-06-01',
				expiration_date: '2027-06-01',
				notes: null,
				certificate_url: null
			}
		]);

		const personnel = [
			{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' },
			{ id: 'p2', rank: 'CPL', lastName: 'Jones', firstName: 'Jane', groupId: 'g1' }
		];
		const trainingTypes = [makeTrainingType('tt1')];

		const result = await fetchDashboardTrainingSummary(ctx, {
			personnel: personnel as never[],
			trainingTypes: trainingTypes as never[],
			onboardingPersonnelIds: ['p1', 'p2', 'missing'],
			asOf: formatToday()
		});

		expect(result.trainingSummary.stats.expired).toBe(1);
		expect(result.trainingSummary.issues).toHaveLength(1);
		expect(result.onboardingTrainingCompletions).toEqual(new Set(['p1-tt1', 'p2-tt1']));
		expect(findManySpy).toHaveBeenCalledTimes(1);
	});
});

describe('Dashboard Training viewer day', () => {
	it('judges currency on the given day, so a record expiring that day is not yet expired', async () => {
		const ctx = buildCtx();
		(ctx.store as ReturnType<typeof createInMemoryDataStore>).seed('personnel_trainings', [
			{
				id: 'completion-1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: 'tt1',
				completion_date: '2025-10-14',
				expiration_date: '2026-10-14',
				notes: null,
				certificate_url: null
			}
		]);
		const summaryOn = async (asOf: string) =>
			(
				await fetchDashboardTrainingSummary(ctx, {
					personnel: [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' }] as never[],
					trainingTypes: [makeTrainingType('tt1')],
					onboardingPersonnelIds: [],
					asOf
				})
			).trainingSummary.stats;

		expect(await summaryOn('2026-10-14')).toMatchObject({ expired: 0, warningOrange: 1 });
		expect(await summaryOn('2026-10-15')).toMatchObject({ expired: 1, warningOrange: 0 });
	});
});

describe('literal Dashboard Training person attribution', () => {
	it('counts distinct expired and delinquent people by group before issue display limits', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
		try {
			const ctx = buildCtx();
			const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
			const personnel: Personnel[] = [
				['able', 'alpha'],
				['baker', 'bravo'],
				['unassigned', null],
				['current', 'other']
			].map(([id, groupId]) => ({
				id: id!,
				groupId,
				groupName: 'Same group name',
				rank: 'SGT',
				lastName: 'Same',
				firstName: 'Name',
				mos: '68W',
				clinicRole: 'Medic'
			}));
			const trainingTypes = [makeTrainingType('required'), makeTrainingType('second')];
			store.seed(
				'personnel_trainings',
				[
					['able', 'required', '2026-10-14'],
					['able', 'second', '2026-10-15'],
					['baker', 'required', '2025-01-01'],
					['baker', 'second', '2025-01-01'],
					['unassigned', 'required', '2025-01-01'],
					['current', 'required', '2027-09-29'],
					['current', 'second', '2027-09-29']
				].map(([personnelId, typeId, expiry], index) => ({
					id: `completion-${index}`,
					organization_id: ORG,
					personnel_id: personnelId,
					training_type_id: typeId,
					completion_date: '2024-01-01',
					expiration_date: expiry,
					notes: null,
					certificate_url: null
				}))
			);

			const input = { personnel, trainingTypes, onboardingPersonnelIds: [], asOf: '2026-09-29' };
			const { trainingSummary: summary } = await fetchDashboardTrainingSummary(ctx, {
				...input,
				options: { issueLimit: 1, issueStatuses: ['warning-orange'] }
			});
			expect(summary.stats.expired).toBe(3);
			expect(summary.stats.warningOrange).toBe(2);
			expect(summary.expiredPersonnelCount).toBe(2);
			expect(new Map(summary.groupDelinquencies.map((group) => [group.groupId, group]))).toEqual(
				new Map([
					['alpha', { groupId: 'alpha', expiredPersonnelCount: 0, delinquentPersonnelCount: 1 }],
					['bravo', { groupId: 'bravo', expiredPersonnelCount: 1, delinquentPersonnelCount: 1 }],
					[null, { groupId: null, expiredPersonnelCount: 1, delinquentPersonnelCount: 1 }]
				])
			);
			expect(summary.issues).toHaveLength(1);
			expect(summary.issues[0].personnelId).toBe('able');

			const { trainingSummary: unlimited } = await fetchDashboardTrainingSummary(ctx, input);
			expect(new Set(unlimited.issues.map((issue) => issue.personnelId))).toEqual(
				new Set(['able', 'baker', 'unassigned'])
			);
			const { trainingSummary: scoped } = await fetchDashboardTrainingSummary(ctx, {
				...input,
				options: { groupId: 'bravo', issueLimit: 0 }
			});
			expect(scoped.expiredPersonnelCount).toBe(1);
			expect(scoped.groupDelinquencies).toEqual([
				{ groupId: 'bravo', expiredPersonnelCount: 1, delinquentPersonnelCount: 1 }
			]);
			expect(scoped.issues).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('Dashboard expired Training by type', () => {
	it('lists every expired Person per type with the oldest lateness, ignoring the issue cap', async () => {
		const ctx = buildCtx();
		(ctx.store as ReturnType<typeof createInMemoryDataStore>).seed(
			'personnel_trainings',
			[
				['able', 'required', '2026-09-19'],
				['baker', 'required', '2026-09-24'],
				['baker', 'second', '2026-09-28'],
				['unassigned', 'required', '2026-10-10']
			].map(([personnelId, typeId, expiry], index) => ({
				id: `completion-${index}`,
				organization_id: ORG,
				personnel_id: personnelId,
				training_type_id: typeId,
				completion_date: '2025-09-01',
				expiration_date: expiry,
				notes: null,
				certificate_url: null
			}))
		);
		const personnel = ['able', 'baker', 'unassigned'].map((id) => ({
			id,
			groupId: null,
			rank: 'SGT',
			lastName: id,
			firstName: 'Name'
		})) as never[];

		const { trainingSummary } = await fetchDashboardTrainingSummary(ctx, {
			personnel,
			trainingTypes: [makeTrainingType('required'), makeTrainingType('second')],
			onboardingPersonnelIds: [],
			asOf: '2026-09-29',
			options: { issueLimit: 0 }
		});

		expect(trainingSummary.issues).toEqual([]);
		expect(trainingSummary.expiredByType).toEqual([
			{ trainingTypeId: 'required', personnelIds: ['able', 'baker'], maxDaysLate: 10 },
			{ trainingTypeId: 'second', personnelIds: ['baker'], maxDaysLate: 1 }
		]);
	});
});

describe('Dashboard missing required Training', () => {
	it('counts a Person missing applicable required records as not current, once, after expired', async () => {
		const ctx = buildCtx();
		(ctx.store as ReturnType<typeof createInMemoryDataStore>).seed(
			'personnel_trainings',
			[
				['both', 'annual', '2026-01-01'],
				['done', 'annual', '2027-09-29'],
				['done', 'lifetime', null]
			].map(([personnelId, typeId, expiry], index) => ({
				id: `completion-${index}`,
				organization_id: ORG,
				personnel_id: personnelId,
				training_type_id: typeId,
				completion_date: '2025-09-29',
				expiration_date: expiry,
				notes: null,
				certificate_url: null
			}))
		);
		const personnel = [
			['empty', 'alpha'],
			['both', 'alpha'],
			['done', 'bravo']
		].map(([id, groupId]) => ({ id, groupId, rank: 'SGT', lastName: id, firstName: 'Pat' })) as never[];
		const trainingTypes = [
			makeTrainingType('annual'),
			{ ...makeTrainingType('lifetime'), expirationMonths: null },
			{ ...makeTrainingType('optional'), isOptional: true },
			{ ...makeTrainingType('colonels'), appliesToRanks: ['COL'] },
			{ ...makeTrainingType('exempted'), canBeExempted: true, exemptPersonnelIds: ['empty', 'both', 'done'] }
		];

		const { trainingSummary } = await fetchDashboardTrainingSummary(ctx, {
			personnel,
			trainingTypes,
			onboardingPersonnelIds: [],
			asOf: '2026-09-29',
			options: { issueLimit: 0, issueStatuses: ['expired'] }
		});

		expect(trainingSummary.expiredPersonnelCount).toBe(1);
		expect(trainingSummary.missingPersonnelCount).toBe(1);
		expect(trainingSummary.groupDelinquencies).toEqual([
			{ groupId: 'alpha', expiredPersonnelCount: 1, delinquentPersonnelCount: 2 }
		]);
		expect(trainingSummary.issues).toEqual([]);
	});
});
