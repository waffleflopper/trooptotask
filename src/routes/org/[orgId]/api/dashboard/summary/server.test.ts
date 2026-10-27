import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDashboardSummary } from '$features/dashboard/index.server';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createRequestDashboardSummaryContext, buildRouteRequest } from '$lib/server/adapters/requestContexts.server';
import { GET } from './+server';

const { fetchCriticalTasksDashboardSummary } = vi.hoisted(() => ({ fetchCriticalTasksDashboardSummary: vi.fn() }));
vi.mock('$features/critical-tasks/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/critical-tasks/index.server')>()),
	fetchCriticalTasksDashboardSummary
}));
vi.mock('$lib/server/adapters/requestContexts.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/adapters/requestContexts.server')>()),
	buildRouteRequest: vi.fn()
}));
vi.mock('$lib/server/supabase', () => ({
	getAdminClient: () => {
		throw new Error('The summary refresh must not acquire the privileged client');
	}
}));

const ORG_ID = 'test-org';
const FULL_ACCESS: CapabilityMap = {
	calendar: 'view',
	personnel: 'view',
	training: 'view',
	criticalTasks: 'view',
	onboarding: 'view',
	ratingScheme: 'view'
};

const people = [
	personRow('p-ann', 'Ann', 'Alpha', 'SGT'),
	personRow('p-bob', 'Bob', 'Bravo', 'SPC'),
	personRow('p-cy', 'Cy', 'Charlie', 'PFC')
];
const cprType = {
	id: 'type-cpr',
	name: 'CPR',
	description: null,
	expiration_months: 12,
	warning_days_yellow: 60,
	warning_days_orange: 30,
	applies_to_roles: [],
	applies_to_mos: [],
	applies_to_ranks: [],
	excluded_roles: [],
	excluded_mos: [],
	excluded_ranks: [],
	color: '#2563eb',
	sort_order: 0,
	expiration_date_only: false,
	can_be_exempted: false,
	exempt_personnel_ids: [],
	is_optional: false,
	organization_id: ORG_ID,
	created_at: '2026-01-01T00:00:00Z'
};
const completions = [
	completionRow('c-ann', 'p-ann', '2025-01-10', '2026-01-10'),
	completionRow('c-bob', 'p-bob', '2026-06-01', '2027-06-01'),
	completionRow('c-cy', 'p-cy', '2026-09-01', '2027-09-01')
];
const packets = [
	{
		id: 'packet-cy',
		personnel_id: 'p-cy',
		started_at: '2026-10-01T00:00:00Z',
		completed_at: null,
		cancelled_at: null,
		status: 'in_progress',
		template_id: null,
		onboarding_step_progress: [
			{
				id: 'step-cpr',
				onboarding_id: 'packet-cy',
				step_name: 'CPR',
				step_type: 'training',
				training_type_id: 'type-cpr',
				stages: null,
				sort_order: 0,
				completed: false,
				current_stage: null,
				notes: [],
				template_step_id: null,
				active: true,
				progress_changed_at: '2026-10-01T00:00:00Z'
			}
		]
	}
];

function personRow(id: string, first: string, last: string, rank: string) {
	return {
		id,
		slug: id,
		rank,
		last_name: last,
		first_name: first,
		mos: '68W',
		clinic_role: 'Medic',
		ets: null,
		deros: null,
		group_id: 'g-alpha',
		archived_at: null,
		groups: { name: 'Alpha' },
		organization_id: ORG_ID
	};
}

function completionRow(id: string, personId: string, completed: string, expires: string) {
	return {
		id,
		personnel_id: personId,
		training_type_id: 'type-cpr',
		completion_date: completed,
		expiration_date: expires,
		notes: null,
		certificate_url: null,
		organization_id: ORG_ID,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z'
	};
}

const SUMMARY_TABLES: Record<string, unknown[]> = {
	personnel: people,
	training_types: [cprType],
	personnel_trainings: completions,
	personnel_onboardings: packets
};

let requestedTables: string[];
let blockedTables: Set<string>;

function summarySupabase() {
	return createClient('http://127.0.0.1:9', 'synthetic-request', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input) => {
				const url = new URL(input instanceof Request ? input.url : input.toString());
				const table = url.pathname.replace('/rest/v1/', '');
				requestedTables.push(table);
				if (blockedTables.has(table)) throw new Error(`Summary refresh read ${table}`);
				const rows = SUMMARY_TABLES[table];
				if (!rows) throw new Error(`Summary refresh read unrelated table ${table}`);
				return Response.json(rows, {
					headers: { 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' }
				});
			}
		}
	});
}

function admit(
	options: { capabilityMap?: Partial<CapabilityMap>; userId?: string; disabledFeatures?: FeatureKey[] } = {}
) {
	const ctx = createTestContext({
		auth: {
			orgId: ORG_ID,
			userId: options.userId ?? 'user-1',
			role: 'member',
			isPrivileged: false,
			capabilityMap: { ...FULL_ACCESS, ...options.capabilityMap }
		},
		disabledFeatures: options.disabledFeatures
	});
	const request = { ...ctx, supabase: summarySupabase(), session: null };
	vi.mocked(buildRouteRequest).mockResolvedValue(request as never);
	return request;
}

function summaryEvent() {
	return {
		cookies: { get: (name: string) => (name === 't2t_tz' ? 'America/New_York' : undefined) },
		params: { orgId: ORG_ID },
		locals: {},
		request: new Request(`http://localhost/org/${ORG_ID}/api/dashboard/summary`)
	} as Parameters<typeof GET>[0];
}

const criticalTasksReport = {
	hasActiveTasks: true,
	kpis: {
		overallReadiness: { percent: 68, deltaPercent: -4, readyCount: 17, applicableCount: 25 },
		soldiersBelow70: { count: 3, totalApplicable: 8, thresholdPercent: 70 },
		tasksExpiringSoon: { count: 5, affectedSoldiers: 4, windowDays: 60 },
		tasksBelowThreshold: { count: 2, thresholdPercent: 70 }
	},
	mosReadiness: [{ mos: '68W', personnelCount: 5, readinessPercent: 60, readyCount: 12, applicableCount: 20 }],
	readinessTrend: { months: [{ month: '2026-09', label: 'Sep', overallReadinessPercent: 68 }] },
	projectedReadinessAtMonth6: {
		month: '2027-03',
		label: 'Mar',
		readinessPercent: 64,
		readyCount: 16,
		applicableCount: 25
	},
	tasksBelowThreshold: { thresholdPercent: 70, count: 0, rows: [] },
	atRiskSoldiers: { totalApplicable: 0, rows: [] }
};
const expectedIctlSummary = {
	hasActiveTasks: true,
	overallReadinessPercent: 68,
	overallDeltaPercent: -4,
	readyCount: 17,
	applicableCount: 25,
	soldiersBelowThresholdCount: 3,
	soldiersBelowThresholdTotal: 8,
	thresholdPercent: 70,
	expiringSoonCount: 5,
	expiringSoonAffectedSoldiers: 4,
	expiringSoonWindowDays: 60,
	tasksBelowThresholdCount: 2,
	projectedReadinessPercent: 64,
	mosReadiness: [{ mos: '68W', personnelCount: 5, readinessPercent: 60 }],
	trend: [{ month: '2026-09', label: 'Sep', readinessPercent: 68 }],
	tasksBelowThreshold: [],
	atRiskSoldiers: []
};

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-15T02:00:00Z'));
	requestedTables = [];
	blockedTables = new Set();
	fetchCriticalTasksDashboardSummary.mockReset().mockResolvedValue(criticalTasksReport);
});
afterEach(() => vi.useRealTimers());

const SUMMARY_TABLE_NAMES = ['personnel', 'personnel_onboardings', 'personnel_trainings', 'training_types'];

const expectedTrainingSummary = {
	stats: { current: 2, warningYellow: 0, warningOrange: 0, expired: 1, notCompleted: 0, notRequired: 0, total: 3 },
	issues: [
		{
			personnelId: 'p-ann',
			personName: 'SGT Alpha, Ann',
			typeName: 'CPR',
			label: 'Expired 277d ago',
			status: 'expired',
			daysUntilExpiration: -277
		}
	],
	expiredByType: [{ trainingTypeId: 'type-cpr', personnelIds: ['p-ann'], maxDaysLate: 277 }],
	expiredPersonnelCount: 1,
	missingPersonnelCount: 0,
	groupDelinquencies: [{ groupId: 'g-alpha', expiredPersonnelCount: 1, delinquentPersonnelCount: 1 }]
};

async function getSummary() {
	return (await GET(summaryEvent())).json();
}

describe('GET /org/[orgId]/api/dashboard/summary', () => {
	it('returns the viewer-day summary from the people, Training types and Onboarding population alone', async () => {
		admit();
		const response = await GET(summaryEvent());

		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		await expect(response.json()).resolves.toEqual({
			trainingSummary: expectedTrainingSummary,
			ictlSummary: expectedIctlSummary,
			onboardingTrainingCompletions: ['p-cy-type-cpr'],
			onboardingPersonnelIds: ['p-cy']
		});
		expect(fetchCriticalTasksDashboardSummary).toHaveBeenCalledWith(expect.anything(), {
			asOf: '2026-10-14',
			timeZone: 'America/New_York'
		});
		expect([...new Set(requestedTables)].sort()).toEqual(SUMMARY_TABLE_NAMES);
	});

	it('returns what the page load computes from the bootstrap reads of the same data', async () => {
		const request = admit();
		const ctx = createRequestDashboardSummaryContext(request as never);
		const [personnel, trainingTypes, activeOnboardings] = await Promise.all([
			ctx.roster.list({ status: 'active' }),
			ctx.trainingCatalog.listTypes(),
			ctx.onboardingWorkflow.listSavedActivePackets()
		]);
		const pageLoad = await fetchDashboardSummary(
			ctx,
			{ personnel, trainingTypes, activeOnboardings },
			'2026-10-14',
			'America/New_York'
		);

		await expect(getSummary()).resolves.toEqual(pageLoad);
	});

	it('rejects a request without an authenticated viewer before reading anything', async () => {
		admit({ userId: '' });

		await expect(GET(summaryEvent())).rejects.toMatchObject({ status: 403, body: { message: 'Unauthorized' } });
		expect(requestedTables).toEqual([]);
		expect(fetchCriticalTasksDashboardSummary).not.toHaveBeenCalled();
	});

	it('skips every Training read, and fails if one is attempted, without Training access', async () => {
		blockedTables = new Set(SUMMARY_TABLE_NAMES);
		admit({ capabilityMap: { training: 'none' } });

		await expect(getSummary()).resolves.toEqual({
			trainingSummary: null,
			ictlSummary: expectedIctlSummary,
			onboardingTrainingCompletions: [],
			onboardingPersonnelIds: []
		});
		expect(requestedTables).toEqual([]);
	});

	it('skips the Critical Tasks read, and fails if one is attempted, without Critical Tasks access', async () => {
		fetchCriticalTasksDashboardSummary.mockRejectedValue(new Error('Critical Tasks read attempted'));
		admit({ capabilityMap: { criticalTasks: 'none' } });

		await expect(getSummary()).resolves.toMatchObject({
			trainingSummary: expectedTrainingSummary,
			ictlSummary: null
		});
		expect(fetchCriticalTasksDashboardSummary).not.toHaveBeenCalled();
	});

	it('returns no packet population or completion keys to a Personnel and Training viewer without Onboarding', async () => {
		blockedTables = new Set(['personnel_onboardings']);
		admit({ capabilityMap: { personnel: 'view', training: 'view', onboarding: 'none' } });

		await expect(getSummary()).resolves.toEqual({
			trainingSummary: expectedTrainingSummary,
			ictlSummary: expectedIctlSummary,
			onboardingTrainingCompletions: [],
			onboardingPersonnelIds: []
		});
		expect(requestedTables).not.toContain('personnel_onboardings');
	});

	it('reads nothing for a viewer with neither lane', async () => {
		fetchCriticalTasksDashboardSummary.mockRejectedValue(new Error('Critical Tasks read attempted'));
		blockedTables = new Set(SUMMARY_TABLE_NAMES);
		admit({ capabilityMap: { training: 'none', criticalTasks: 'none' } });

		await expect(getSummary()).resolves.toEqual({
			trainingSummary: null,
			ictlSummary: null,
			onboardingTrainingCompletions: [],
			onboardingPersonnelIds: []
		});
		expect(requestedTables).toEqual([]);
	});

	it('reads no Training or Onboarding table an Organization switched off', async () => {
		blockedTables = new Set(SUMMARY_TABLE_NAMES);
		admit({ disabledFeatures: ['training', 'onboarding'] });

		await expect(getSummary()).resolves.toEqual({
			trainingSummary: null,
			ictlSummary: expectedIctlSummary,
			onboardingTrainingCompletions: [],
			onboardingPersonnelIds: []
		});
		expect(requestedTables).toEqual([]);
	});

	it('skips the Critical Tasks read an Organization switched off, though the viewer keeps the lane', async () => {
		fetchCriticalTasksDashboardSummary.mockRejectedValue(new Error('Critical Tasks read attempted'));
		admit({ disabledFeatures: ['criticalTasks'] });

		await expect(getSummary()).resolves.toMatchObject({
			trainingSummary: expectedTrainingSummary,
			ictlSummary: null
		});
		expect(fetchCriticalTasksDashboardSummary).not.toHaveBeenCalled();
	});

	it('keeps the Onboarding population out of an Organization that switched Onboarding off', async () => {
		blockedTables = new Set(['personnel_onboardings']);
		admit({ disabledFeatures: ['onboarding'] });

		await expect(getSummary()).resolves.toMatchObject({
			trainingSummary: expectedTrainingSummary,
			onboardingTrainingCompletions: [],
			onboardingPersonnelIds: []
		});
	});
});
