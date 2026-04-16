import { describe, expect, it, vi } from 'vitest';
import { _createCriticalTasksReportsPageLoad } from './+page.server';

describe('critical tasks reports page server load', () => {
	it('checks training permission before rendering the reports route', async () => {
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn({} as never));
		const load = _createCriticalTasksReportsPageLoad({ loadWithContext });
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
		expect(result.reportAccess).toBe(true);
	});
});
