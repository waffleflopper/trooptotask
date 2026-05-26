import { describe, expect, it, vi } from 'vitest';
import { _createCriticalTasksLibraryPageLoad } from './+page.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

describe('critical tasks library page server load', () => {
	it('guards task-library management behind the Critical Tasks configure policy boundary', async () => {
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn({} as never));
		const load = _createCriticalTasksLibraryPageLoad({ loadWithContext });
		const depends = vi.fn();

		await load({
			params: { orgId: 'org-1' },
			locals: {} as App.Locals,
			cookies: {} as never,
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:critical-tasks-library');
		expect(loadWithContext).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'org-1',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.configureLibrary
			})
		);
		expect(loadWithContext.mock.calls[0]?.[3]).not.toHaveProperty('permission');
	});
});
