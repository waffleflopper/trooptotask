import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import type { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _createTrainingReportsPageLoad } from './+page.server';

function seededContext(training: 'none' | 'view') {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			capabilityMap: {
				calendar: 'none',
				personnel: 'none',
				training,
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet: { kind: 'organization' }
		}
	});
	const org = ctx.auth.orgId;
	ctx.store.seed('organizations', [{ id: org, name: 'Test Company', training_readiness_goal_percent: 90 }]);
	ctx.store.seed('groups', [
		{ id: 'alpha', organization_id: org, name: 'Alpha', sort_order: 0 },
		{ id: 'bravo', organization_id: org, name: 'Bravo', sort_order: 1 }
	]);
	ctx.store.seed(
		'personnel',
		[
			['p-able', 'alpha', 'Alpha'],
			['p-baker', 'bravo', 'Bravo']
		].map(([id, groupId, groupName]) => ({
			id,
			organization_id: org,
			rank: 'SGT',
			last_name: id,
			first_name: 'Pat',
			mos: '68W',
			clinic_role: 'Medic',
			group_id: groupId,
			archived_at: null,
			groups: { name: groupName }
		}))
	);
	return ctx;
}

function loadFor(training: 'none' | 'view', query: string, timeZone?: string) {
	const ctx = seededContext(training);
	const loadWithContextFn = vi.fn(async (_locals, _cookies, _orgId, config) =>
		config.fn(ctx as never)
	) as unknown as typeof loadWithContext;
	const load = _createTrainingReportsPageLoad({ loadWithContext: loadWithContextFn });
	const depends = vi.fn();
	const result = load({
		params: { orgId: 'test-org' },
		url: new URL(`https://example.test/org/test-org/training/reports?${query}`),
		locals: {} as App.Locals,
		cookies: { get: (name: string) => (name === 't2t_tz' ? timeZone : undefined) } as never,
		depends
	} as never);
	return { result, loadWithContextFn, depends };
}

describe('Training reports page load', () => {
	it('renders the first paint from the filters in the URL under Training view policy', async () => {
		const { result, loadWithContextFn } = loadFor('view', 'group=bravo&horizon=180');
		const { trainingReport } = await result;

		expect(trainingReport.input).toMatchObject({ groupId: 'bravo', horizonDays: 180 });
		expect(trainingReport.briefing.bottomLine).toMatchObject({ scopeName: 'Bravo', soldierCount: 1 });
		expect(vi.mocked(loadWithContextFn).mock.calls[0][3]).toMatchObject({
			policyAction: POLICY_ACTION_CATALOG.training.viewRecords
		});
	});

	it('evaluates the first paint on the viewer day from the time zone cookie', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-15T02:00:00Z'));
		try {
			const easternLoad = loadFor('view', '', 'America/New_York');
			const { trainingReport: eastern } = await easternLoad.result;
			const { trainingReport: fallback } = await loadFor('view', '', 'Not/AZone').result;

			expect(easternLoad.depends).toHaveBeenCalledWith('app:training-reports', 'app:viewer-day');
			expect(eastern.briefing.bottomLine.asOf).toBe('2026-10-14');
			expect(fallback.briefing.bottomLine.asOf).toBe('2026-10-15');
		} finally {
			vi.useRealTimers();
		}
	});

	it('refuses the page for a member without Training view', async () => {
		await expect(loadFor('none', '').result).rejects.toMatchObject({ status: 403 });
	});
});
