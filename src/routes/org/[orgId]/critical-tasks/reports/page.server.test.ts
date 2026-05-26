import { describe, expect, it, vi } from 'vitest';
import { _createCriticalTasksReportsPageLoad } from './+page.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

describe('critical tasks reports page server load', () => {
	it('registers the reports dependency and fetches the initial dashboard payload', async () => {
		const initialDashboard = {
			kpis: {
				overallReadiness: { percent: 67, deltaPercent: 4, readyCount: 2, applicableCount: 3 },
				soldiersBelow70: { count: 1, totalApplicable: 2, thresholdPercent: 70 },
				tasksExpiringSoon: { count: 1, affectedSoldiers: 1, windowDays: 60 },
				tasksBelowThreshold: { count: 1, thresholdPercent: 70 }
			},
			tasksBelowThreshold: {
				thresholdPercent: 70,
				rows: []
			},
			atRiskSoldiers: {
				rows: []
			},
			readinessTrend: {
				comparisonMos: [],
				months: []
			},
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
			readinessMatrix: {
				hasCategorizedTasks: false,
				categories: [],
				rows: []
			},
			readinessDistribution: {
				bins: [],
				defaultMos: null,
				series: []
			}
		};
		const reportScope = {
			personnel: [],
			groups: [],
			hasActiveTasks: false,
			activeTaskCount: 0,
			totalPersonnelCount: 0,
			filterOptions: {
				mos: [],
				ranks: [],
				roles: []
			}
		};
		const pageModel = { initialDashboard, reportScope };
		const fetchPageModel = vi.fn(async () => pageModel);
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn({} as never));
		const load = _createCriticalTasksReportsPageLoad({ loadWithContext, fetchPageModel });
		const depends = vi.fn();

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {} as App.Locals,
			cookies: {} as never,
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:critical-tasks-reports');
		expect(loadWithContext).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'org-1',
			expect.objectContaining({ policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness })
		);
		expect(loadWithContext.mock.calls[0]?.[3]).not.toHaveProperty('permission');
		expect(fetchPageModel).toHaveBeenCalledWith(expect.anything());
		expect(result).toEqual(pageModel);
	});
});
