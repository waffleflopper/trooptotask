import { describe, expect, it, vi } from 'vitest';
import { _createCriticalTasksReportsPageLoad } from './+page.server';

describe('critical tasks reports page server load', () => {
	it('registers the reports dependency and fetches the initial server summary', async () => {
		const initialSummary = {
			overallReadinessPercent: 67,
			readinessByMos: [{ mos: '68W', readinessPercent: 67, applicableCount: 3, readyCount: 2 }],
			bestPerformingMos: { mos: '68W', readinessPercent: 67, applicableCount: 3, readyCount: 2 },
			worstPerformingMos: { mos: '68W', readinessPercent: 67, applicableCount: 3, readyCount: 2 },
			completionTrend: [{ month: '2026-04', completions: 2 }]
		};
		const fetchSummary = vi.fn(async () => initialSummary);
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn({} as never));
		const load = _createCriticalTasksReportsPageLoad({ loadWithContext, fetchSummary });
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
		expect(fetchSummary).toHaveBeenCalledWith(expect.anything());
		expect(result).toEqual({ initialSummary });
	});
});
