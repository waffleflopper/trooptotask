import { describe, expect, it, vi } from 'vitest';
import { _createCriticalTasksReportsPageLoad } from './+page.server';

describe('critical tasks reports page server load', () => {
	it('registers the reports dependency and fetches the initial dashboard payload', async () => {
		const initialDashboard = {
			kpis: {
				overallReadiness: { percent: 67, deltaPercent: 4, readyCount: 2, applicableCount: 3 },
				soldiersBelow70: { count: 1, totalAssigned: 2, thresholdPercent: 70 },
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
		const fetchDashboard = vi.fn(async () => initialDashboard);
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn({} as never));
		const load = _createCriticalTasksReportsPageLoad({ loadWithContext, fetchDashboard });
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
			expect.objectContaining({ permission: 'training' })
		);
		expect(fetchDashboard).toHaveBeenCalledWith(expect.anything());
		expect(result).toEqual({ initialDashboard });
	});
});
