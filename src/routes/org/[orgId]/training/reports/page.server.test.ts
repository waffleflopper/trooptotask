import { describe, expect, it, vi } from 'vitest';
import { _createTrainingReportsPageLoad } from './+page.server';

describe('training reports page server load', () => {
	it('loads the initial report page through the training permission boundary', async () => {
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn({} as never));
		const fetchTrainingReportPage = vi.fn(async () => ({
			dashboard: {
				readinessPercent: 0,
				statusCounts: { current: 0, warningYellow: 0, warningOrange: 0, expired: 0, notCompleted: 0 },
				worstTypes: [],
				groupComparison: []
			},
			detail: {
				rows: [],
				totalRows: 0,
				page: 1,
				pageSize: 25,
				totalPages: 1,
				sort: { column: 'name', direction: 'asc' as const }
			},
			trainingTypes: [],
			filterOptions: { groups: [], mos: [], roles: [], ranks: [] }
		}));
		const load = _createTrainingReportsPageLoad({ loadWithContext, fetchTrainingReportPage });
		const depends = vi.fn();

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {} as App.Locals,
			cookies: {} as never,
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:training-reports');
		expect(loadWithContext).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'org-1',
			expect.objectContaining({ permission: 'training' })
		);
		expect(fetchTrainingReportPage).toHaveBeenCalledWith(expect.anything(), {
			sort: { column: 'name', direction: 'asc' }
		});
		expect(result.trainingReport.detail.pageSize).toBe(25);
	});
});
