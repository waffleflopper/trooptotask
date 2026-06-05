import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';
import type { CalendarWorkspaceRouteData } from '$features/calendar/server/calendarWorkspaceBootstrap';
import { _createCalendarLayoutLoad } from './+layout.server';

describe('calendar layout server load', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('registers calendar dependencies and streams the Calendar-owned workspace bootstrap', async () => {
		const depends = vi.fn();
		const streamCalendarWorkspace = vi.fn<() => Promise<CalendarWorkspaceRouteData>>().mockResolvedValue({
			calendar: { data: Promise.resolve({ laneKey: 'calendar' } as never) }
		});
		const load = _createCalendarLayoutLoad({ streamCalendarWorkspace });
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;

		const result = await load({
			params: { orgId: '1-11-bde' },
			locals,
			cookies,
			url: new URL('https://app.test/org/org-1/calendar'),
			depends,
			parent: async () => createReadyAppShellRouteData({ orgId: 'org-1' })
		} as unknown as Parameters<typeof load>[0]);

		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:calendar-data');
		expect(streamCalendarWorkspace).toHaveBeenCalledWith({ locals, cookies, orgId: 'org-1' });
		expect(result).toEqual({
			calendar: { data: expect.any(Promise) }
		});
	});

	it('requests full settings-year special days for calendar settings hydration', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-01T00:00:00Z'));
		const streamCalendarWorkspace = vi.fn<() => Promise<CalendarWorkspaceRouteData>>().mockResolvedValue({
			calendar: { data: Promise.resolve({ laneKey: 'calendar' } as never) }
		});
		const load = _createCalendarLayoutLoad({ streamCalendarWorkspace });

		await load({
			params: { orgId: '1-11-bde' },
			locals: {} as App.Locals,
			cookies: {} as Cookies,
			url: new URL('https://app.test/org/org-1/calendar/settings'),
			depends: vi.fn(),
			parent: async () => createReadyAppShellRouteData({ orgId: 'org-1' })
		} as unknown as Parameters<typeof load>[0]);

		expect(streamCalendarWorkspace).toHaveBeenCalledWith({
			locals: {},
			cookies: {},
			orgId: 'org-1',
			specialDaysRange: { rangeStart: '2025-01-01', rangeEnd: '2028-12-31' }
		});
	});
});
