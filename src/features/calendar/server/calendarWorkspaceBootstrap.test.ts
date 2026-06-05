import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { CALENDAR_ANCHOR_COOKIE } from '$features/calendar/utils/calendarAnchorDate';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { CalendarBootstrap } from '$lib/server/core/useCases/calendarQuery';

const { loadWithContextMock, fetchCalendarBootstrapMock, getActiveOnboardingPersonnelIdsMock } = vi.hoisted(() => ({
	loadWithContextMock: vi.fn(),
	fetchCalendarBootstrapMock: vi.fn(),
	getActiveOnboardingPersonnelIdsMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

vi.mock('$lib/server/core/useCases/calendarQuery', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/calendarQuery')>(
		'$lib/server/core/useCases/calendarQuery'
	);
	return {
		...actual,
		fetchCalendarBootstrap: fetchCalendarBootstrapMock,
		getActiveOnboardingPersonnelIds: getActiveOnboardingPersonnelIdsMock
	};
});

import { streamCalendarWorkspaceBootstrap } from './calendarWorkspaceBootstrap';

describe('streamCalendarWorkspaceBootstrap', () => {
	const orgId = '11111111-1111-1111-1111-111111111111';
	const emptyCookies = {
		get: vi.fn(() => undefined)
	} as unknown as Cookies;
	const availabilityEntries = Promise.resolve([{ id: 'av1', personnelId: 'p1' } as AvailabilityEntry]);
	const specialDays = Promise.resolve([{ id: 'sd1', name: 'Training Holiday', date: '2026-05-25' } as SpecialDay]);
	const dailyAssignments = Promise.resolve([{ id: 'da1', date: '2026-05-01' } as DailyAssignment]);
	const calendarBootstrap: Omit<CalendarBootstrap, 'activeOnboardingPersonnelIds'> = {
		rangeStart: '2026-03-01',
		rangeEnd: '2026-05-31',
		availabilityEntries,
		specialDays,
		assignmentTypes: [{ id: 'at1', name: 'CQ' } as AssignmentType],
		dailyAssignments,
		pinnedGroups: ['Alpha'],
		advancedDutyEvents: [],
		personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
		groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
		statusTypes: [{ id: 'st1', name: 'Leave' } as StatusType],
		lossWarningWindowDays: 180
	};

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-10T12:00:00Z'));
		vi.clearAllMocks();
		fetchCalendarBootstrapMock.mockResolvedValue(calendarBootstrap);
		getActiveOnboardingPersonnelIdsMock.mockResolvedValue(['p1']);
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = Promise.resolve(config.fn({ auth: { orgId } } as never));
			return config.defer ? Promise.resolve({ data }) : data;
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('streams a lane-keyed Calendar workspace result with explicit merge hydration targets', async () => {
		const routeData = await streamCalendarWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: emptyCookies,
			orgId
		});

		const workspace = await routeData.calendar.data;

		expect(loadWithContextMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			orgId,
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.calendar.viewAvailability,
				policyResource: { kind: 'unscoped' },
				defer: true
			})
		);
		expect(loadWithContextMock.mock.calls[0]?.[3]).not.toHaveProperty('permission');
		expect(fetchCalendarBootstrapMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				rangeStart: '2026-03-01',
				rangeEnd: '2026-05-31'
			})
		);
		expect(workspace).toEqual({
			laneKey: 'calendar',
			data: {
				...calendarBootstrap,
				activeOnboardingPersonnelIds: ['p1']
			},
			hydration: expect.objectContaining({
				orgId,
				availabilityEntries: {
					mode: 'merge',
					deferred: true,
					items: availabilityEntries,
					snapshotKey: expect.any(String)
				},
				specialDays: {
					mode: 'merge',
					deferred: true,
					items: specialDays,
					snapshotKey: expect.any(String)
				},
				calendarAssignments: expect.objectContaining({
					mode: 'merge',
					deferred: true,
					items: expect.any(Promise),
					snapshotKey: expect.any(String),
					rangeStart: '2026-03-01',
					rangeEnd: '2026-05-31'
				})
			})
		});
		await expect(workspace.hydration.calendarAssignments.items).resolves.toEqual({
			types: calendarBootstrap.assignmentTypes,
			assignments: [{ id: 'da1', date: '2026-05-01' }]
		});
	});

	it('prefers the client-local anchor date and can widen only settings special days', async () => {
		const cookies = {
			get: vi.fn((name: string) => (name === CALENDAR_ANCHOR_COOKIE ? '2026-05-01' : undefined))
		} as unknown as Cookies;

		await streamCalendarWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies,
			orgId,
			specialDaysRange: { rangeStart: '2025-01-01', rangeEnd: '2028-12-31' }
		}).then((routeData) => routeData.calendar.data);

		expect(fetchCalendarBootstrapMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				rangeStart: '2026-04-01',
				rangeEnd: '2026-06-30',
				specialDaysRange: { rangeStart: '2025-01-01', rangeEnd: '2028-12-31' }
			})
		);
	});
});
