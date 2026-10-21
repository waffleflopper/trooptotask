import { afterEach, describe, expect, it, vi } from 'vitest';
import { _createCriticalTasksReportsPageLoad } from './+page.server';

afterEach(() => vi.useRealTimers());

describe('Critical Tasks reports page load', () => {
	it("builds the reports on the viewer's day and zone, and reruns when the browser records a zone", async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-15T02:00:00Z'));
		const depends = vi.fn();
		const load = _createCriticalTasksReportsPageLoad({
			loadWithContext: vi.fn(async (_locals, _cookies, _orgId, config) => config.fn({} as never)) as never,
			fetchPageModel: vi.fn(async (_ctx, { asOf, timeZone }) => ({ asOf, timeZone })) as never
		});

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {} as App.Locals,
			cookies: { get: (name: string) => (name === 't2t_tz' ? 'America/New_York' : undefined) },
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:critical-tasks-reports', 'app:viewer-day');
		expect(result).toEqual({ asOf: '2026-10-14', timeZone: 'America/New_York' });
	});
});
