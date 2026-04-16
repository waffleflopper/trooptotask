import { describe, expect, it, vi } from 'vitest';
import { _createCriticalTasksReportsPageLoad } from './+page.server';

describe('critical tasks reports page server load', () => {
	it('registers the reports dependency without re-running a redundant training permission load', async () => {
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn({} as never));
		const load = _createCriticalTasksReportsPageLoad({ loadWithContext });
		const depends = vi.fn();

		const locals = { session: { user: { id: 'user-1' } } } as App.Locals;
		const result = await load({
			params: { orgId: 'org-1' },
			locals,
			cookies: {} as never,
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:critical-tasks-reports');
		expect(loadWithContext).not.toHaveBeenCalled();
		expect(result).toEqual({ session: locals.session });
	});
});
