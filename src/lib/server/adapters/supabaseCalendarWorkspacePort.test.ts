import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { CalendarBootstrap } from '$lib/server/core/useCases/calendarQuery';

const { loadWithContextMock, fetchCalendarBootstrapMock, getActiveOnboardingPersonnelIdsMock } = vi.hoisted(() => ({
	loadWithContextMock: vi.fn(),
	fetchCalendarBootstrapMock: vi.fn(),
	getActiveOnboardingPersonnelIdsMock: vi.fn()
}));

vi.mock('./httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('./httpAdapter')>('./httpAdapter');
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

vi.mock('../core/useCases/calendarQuery', async () => {
	const actual = await vi.importActual<typeof import('../core/useCases/calendarQuery')>(
		'../core/useCases/calendarQuery'
	);
	return {
		...actual,
		fetchCalendarBootstrap: fetchCalendarBootstrapMock
	};
});

vi.mock('../core/useCases/onboardingCalendarQuery', async () => {
	const actual = await vi.importActual<typeof import('../core/useCases/onboardingCalendarQuery')>(
		'../core/useCases/onboardingCalendarQuery'
	);
	return {
		...actual,
		getActiveOnboardingPersonnelIds: getActiveOnboardingPersonnelIdsMock
	};
});

import { createSupabaseCalendarWorkspacePort } from './supabaseOrgShell';

describe('createSupabaseCalendarWorkspacePort', () => {
	const calendarBootstrap: Omit<CalendarBootstrap, 'activeOnboardingPersonnelIds'> = {
		rangeStart: '2026-03-01',
		rangeEnd: '2026-05-31',
		availabilityEntries: [],
		specialDays: [],
		assignmentTypes: [],
		dailyAssignments: [],
		pinnedGroups: [],
		advancedDutyEvents: [],
		personnel: [],
		groups: [],
		statusTypes: []
	};

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-10T12:00:00Z'));
		vi.clearAllMocks();
		fetchCalendarBootstrapMock.mockResolvedValue(calendarBootstrap);
		getActiveOnboardingPersonnelIdsMock.mockResolvedValue([]);
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = Promise.resolve(config.fn({} as never));
			return config.defer ? Promise.resolve({ data }) : data;
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('streams a smaller initial bootstrap range around the active month', async () => {
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
		const port = createSupabaseCalendarWorkspacePort(
			{} as App.Locals,
			{} as Cookies,
			'11111111-1111-1111-1111-111111111111'
		);

		const streamed = await port.streamWorkspaceData<CalendarBootstrap>('calendar');

		await streamed.data;

		expect(fetchCalendarBootstrapMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				rangeStart: '2026-03-01',
				rangeEnd: '2026-05-31'
			})
		);
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			'[calendar-load]',
			expect.objectContaining({
				orgId: '11111111-1111-1111-1111-111111111111',
				phase: 'workspace-bootstrap',
				status: 'ok',
				durationMs: expect.any(Number)
			})
		);
	});
});
