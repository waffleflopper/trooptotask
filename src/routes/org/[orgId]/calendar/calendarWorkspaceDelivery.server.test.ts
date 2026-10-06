import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { error } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import { CALENDAR_ANCHOR_COOKIE } from '$features/calendar/index.server';
import type { Personnel } from '$features/personnel/contracts';
import type {
	AssignmentType,
	AvailabilityEntry,
	SpecialDay,
	StatusType,
	DailyAssignment
} from '$features/calendar/contracts';
import type { Group } from '$features/personnel/contracts';
import type { CalendarBootstrap } from '$features/calendar/index.server';

const {
	loadWithContextMock,
	fetchCalendarBootstrapMock,
	getActiveOnboardingPersonnelIdsMock,
	createRequestCalendarWorkspaceContextMock
} = vi.hoisted(() => ({
	loadWithContextMock: vi.fn(),
	fetchCalendarBootstrapMock: vi.fn(),
	getActiveOnboardingPersonnelIdsMock: vi.fn(),
	createRequestCalendarWorkspaceContextMock: vi.fn()
}));

vi.mock('$lib/server/adapters/requestContexts.server', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/requestContexts.server')>(
		'$lib/server/adapters/requestContexts.server'
	);
	return { ...actual, createRequestCalendarWorkspaceContext: createRequestCalendarWorkspaceContextMock };
});

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

vi.mock('$features/calendar/index.server', async () => {
	const actual = await vi.importActual<typeof import('$features/calendar/index.server')>(
		'$features/calendar/index.server'
	);
	return {
		...actual,
		fetchCalendarBootstrap: fetchCalendarBootstrapMock,
		getActiveOnboardingPersonnelIds: getActiveOnboardingPersonnelIdsMock
	};
});

import { streamCalendarWorkspaceBootstrap } from './calendarWorkspaceDelivery.server';

function makeHttpError(status: number, message: string): unknown {
	try {
		error(status, message);
	} catch (cause) {
		return cause;
	}
}

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
		createRequestCalendarWorkspaceContextMock.mockReturnValue({ auth: { orgId } });
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = Promise.resolve().then(() => config.fn(config.context({ auth: { orgId } })));
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
		if ('access' in workspace) throw new Error('Expected an authorized Calendar workspace');

		expect(routeData.calendar.data).toBeInstanceOf(Promise);
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

	it('settles a revoked Calendar grant as restricted instead of streaming a rejected workspace', async () => {
		let deny!: (reason: unknown) => void;
		const data = new Promise<never>((_resolve, reject) => {
			deny = reject;
		});
		loadWithContextMock.mockResolvedValueOnce({ data });

		const routeData = await streamCalendarWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: emptyCookies,
			orgId
		});

		const result = routeData.calendar.data.then(
			(value) => ({ value }),
			(cause) => ({ cause })
		);
		deny(makeHttpError(403, 'Calendar access denied'));
		expect(await result).toEqual({ value: { laneKey: 'calendar', access: 'restricted' } });
	});

	it('still rejects unexpected Calendar workspace failures', async () => {
		let fail!: (reason: unknown) => void;
		const data = new Promise<never>((_resolve, reject) => {
			fail = reject;
		});
		loadWithContextMock.mockResolvedValueOnce({ data });

		const routeData = await streamCalendarWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: emptyCookies,
			orgId
		});

		const result = routeData.calendar.data.then(
			(value) => ({ value }),
			(cause) => ({ cause })
		);
		fail(makeHttpError(500, 'Unavailable'));
		expect(await result).toMatchObject({ cause: { status: 500 } });
	});

	it('prefers the client-local anchor date and can widen only settings special days', async () => {
		const cookies = {
			get: vi.fn((name: string) => (name === CALENDAR_ANCHOR_COOKIE ? '2026-05-01' : undefined))
		} as unknown as Cookies;
		fetchCalendarBootstrapMock.mockImplementationOnce((_ctx, input) =>
			Promise.resolve({
				...calendarBootstrap,
				rangeStart: input.rangeStart,
				rangeEnd: input.rangeEnd,
				specialDays: Promise.resolve([
					{
						id: 'sd-wide',
						name: 'Settings special day',
						date: input.specialDaysRange?.rangeStart ?? input.rangeStart
					} as SpecialDay
				])
			})
		);

		const routeData = await streamCalendarWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies,
			orgId,
			specialDaysRange: { rangeStart: '2025-01-01', rangeEnd: '2028-12-31' }
		});
		const workspace = await routeData.calendar.data;
		if ('access' in workspace) throw new Error('Expected an authorized Calendar workspace');

		expect(workspace.data.rangeStart).toBe('2026-04-01');
		expect(workspace.data.rangeEnd).toBe('2026-06-30');
		await expect(workspace.data.specialDays).resolves.toEqual([
			expect.objectContaining({ id: 'sd-wide', date: '2025-01-01' })
		]);
		expect(workspace.hydration.calendarAssignments.rangeStart).toBe('2026-04-01');
		expect(workspace.hydration.calendarAssignments.rangeEnd).toBe('2026-06-30');
	});
});
