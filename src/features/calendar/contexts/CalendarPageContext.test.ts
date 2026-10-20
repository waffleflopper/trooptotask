import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
	CalendarPageContext,
	type CalendarPageData,
	type CalendarPageAccess,
	type CalendarDisplayPreferences
} from './CalendarPageContext.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { groupsStore } from '$features/personnel';
import { loadCalendarRange } from '$features/calendar/utils/calendarRangeLoader';
import type { Personnel } from '$features/personnel/contracts';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import { buildRequestError, endOrganizationLifetime } from '$lib/stores/core';
import { settles } from '$lib/test-support/settles';
import { toastStore } from '$lib/stores/toast.svelte';

vi.mock('$features/calendar/utils/calendarRangeLoader', () => ({
	loadCalendarRange: vi.fn()
}));
vi.mock('$features/calendar/stores/availability.svelte', () => ({
	availabilityStore: {
		items: [],
		orgId: '',
		loading: false,
		load: vi.fn(),
		add: vi.fn(),
		updateOrThrow: vi.fn(),
		removeBool: vi.fn(),
		beginRead: () => ({ reconcile: (snapshot: unknown[]) => snapshot, close: () => {} })
	}
}));
vi.mock('$features/calendar/stores/dailyAssignments.svelte', () => ({
	dailyAssignmentsStore: { assignments: [], types: [], loading: false, load: vi.fn() }
}));
vi.mock('$features/calendar/stores/specialDays.svelte', () => ({
	specialDaysStore: { items: [], loading: false, load: vi.fn() }
}));
vi.mock('$features/calendar/stores/statusTypes.svelte', () => ({
	statusTypesStore: { items: [], loading: false, load: vi.fn() }
}));
vi.mock('$features/personnel', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/personnel')>()),
	groupsStore: { items: [], loading: false }
}));

const savePreferences = vi.fn<(patch: Partial<CalendarDisplayPreferences>) => void>();
function makeContext(data: CalendarPageData | (() => CalendarPageData), org: CalendarPageAccess, today?: string) {
	return new CalendarPageContext(data, org, savePreferences, today);
}

// ---------------------------------------------------------------------------
// Minimal mock data
// ---------------------------------------------------------------------------

const mockPersonnel: Personnel[] = [
	{
		id: 'p1',
		firstName: 'Alice',
		lastName: 'Smith',
		rank: 'SGT',
		groupId: 'g1',
		groupName: 'Alpha',
		clinicRole: '',
		mos: '11B'
	},
	{
		id: 'p2',
		firstName: 'Bob',
		lastName: 'Jones',
		rank: 'SSG',
		groupId: 'g2',
		groupName: 'Bravo',
		clinicRole: 'Medic',
		mos: '68W'
	}
];

const mockData: CalendarPageData = {
	orgId: 'org1',
	orgName: 'Test Org',
	userId: 'user1',
	personnel: mockPersonnel,
	allPersonnel: mockPersonnel
};

const mutableAvailabilityStore = availabilityStore as unknown as { loading: boolean };
const mutableDailyAssignmentsStore = dailyAssignmentsStore as unknown as { loading: boolean };
const mutableSpecialDaysStore = specialDaysStore as unknown as { loading: boolean };
const mutableStatusTypesStore = statusTypesStore as unknown as { loading: boolean };
const mutableGroupsStore = groupsStore as unknown as { loading: boolean };

function makeMockOrg(
	overrides: {
		userRole?: 'owner' | 'admin' | 'member';
		capabilityMap?: import('$lib/access/memberAccessShape').CapabilityMap;
		scopeSet?: import('$lib/access/memberAccessShape').ScopeSet;
	} = {}
) {
	const role = overrides.userRole ?? 'member';
	const isPrivileged = role === 'owner' || role === 'admin';
	return {
		userId: 'user1',
		...createClientAccess({
			membershipRole: role,
			capabilityMap:
				overrides.capabilityMap ?? (isPrivileged ? createCapabilityMap('configure') : createCapabilityMap('view')),
			scopeSet: overrides.scopeSet
		})
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CalendarPageContext', () => {
	let ctx: CalendarPageContext;
	let org: CalendarPageAccess;

	beforeEach(() => {
		org = makeMockOrg();
		mutableAvailabilityStore.loading = false;
		mutableDailyAssignmentsStore.loading = false;
		mutableSpecialDaysStore.loading = false;
		mutableStatusTypesStore.loading = false;
		mutableGroupsStore.loading = false;
		savePreferences.mockClear();
		vi.mocked(loadCalendarRange).mockReset();
		vi.mocked(availabilityStore.load).mockReset();
		vi.mocked(availabilityStore.add).mockReset();
		vi.mocked(availabilityStore.updateOrThrow).mockReset();
		vi.mocked(availabilityStore.removeBool).mockReset();
		vi.restoreAllMocks();
		ctx = makeContext(mockData, org);
	});

	// ---- Derived permission flags ------------------------------------------

	describe('permission flags', () => {
		it('canManageConfig is false when not owner/admin/fullEditor', () => {
			expect(ctx.canManageConfig).toBe(false);
		});

		it('canManageConfig is true for owner', () => {
			const ownerCtx = makeContext(mockData, makeMockOrg({ userRole: 'owner' }));
			expect(ownerCtx.canManageConfig).toBe(true);
		});

		it('canManageConfig is true for admin', () => {
			const adminCtx = makeContext(mockData, makeMockOrg({ userRole: 'admin' }));
			expect(adminCtx.canManageConfig).toBe(true);
		});

		it('canManageConfig is true for Calendar configure capability', () => {
			const editorCtx = makeContext(
				mockData,
				makeMockOrg({
					capabilityMap: {
						calendar: 'configure',
						personnel: 'view',
						training: 'view',
						criticalTasks: 'view',
						onboarding: 'view',
						ratingScheme: 'view'
					}
				})
			);
			expect(editorCtx.canManageConfig).toBe(true);
		});

		it('allows Calendar operate affordances', () => {
			const operatorCtx = makeContext(
				mockData,
				makeMockOrg({
					capabilityMap: {
						calendar: 'operate',
						personnel: 'view',
						training: 'view',
						criticalTasks: 'view',
						onboarding: 'view',
						ratingScheme: 'view'
					}
				})
			);

			expect(operatorCtx.canManageAvailability).toBe(true);
			expect(operatorCtx.canManageAssignments).toBe(true);
		});

		it('allows group-scoped Calendar managers to view and manage the scoped workspace', () => {
			const scopedManagerCtx = makeContext(
				mockData,
				makeMockOrg({
					capabilityMap: {
						calendar: 'operate',
						personnel: 'view',
						training: 'view',
						criticalTasks: 'view',
						onboarding: 'view',
						ratingScheme: 'view'
					},
					scopeSet: { kind: 'groups', groupIds: ['g1'] }
				})
			);

			expect(scopedManagerCtx.canViewCalendar).toBe(true);
			expect(scopedManagerCtx.canManageAvailability).toBe(true);
			expect(scopedManagerCtx.canManageAssignments).toBe(true);
		});
	});

	describe('isHydrating', () => {
		it('is false once the composite stores are loaded', () => {
			expect(ctx.isHydrating).toBe(false);
		});

		it('is true while any composite store is still loading', () => {
			mutableSpecialDaysStore.loading = true;
			expect(makeContext(mockData, org).isHydrating).toBe(true);
		});
	});

	// ---- Modal registry removed (Phase 3.3 — modals inlined into CalendarPageView) ----

	describe('syncUserPreferences', () => {
		it('honors a saved personnel role display preference', () => {
			ctx.syncUserPreferences({ showStatusText: true, showPersonnelRoles: true, highlightOnboarding: false });

			expect(ctx.showStatusText).toBe(true);
			expect(ctx.showPersonnelRoles).toBe(true);
			expect(ctx.highlightOnboarding).toBe(false);
			expect(savePreferences).not.toHaveBeenCalled();
		});
	});

	// ---- View mode state ---------------------------------------------------

	describe('viewMode', () => {
		it('defaults to month', () => {
			expect(ctx.viewMode).toBe('month');
		});

		it('setViewMode shows the chosen view', () => {
			ctx.setViewMode('3-month');
			expect(ctx.viewMode).toBe('3-month');
			ctx.setViewMode('month');
			expect(ctx.viewMode).toBe('month');
		});

		it('navigateToMonth switches to month view and navigates calendarStore', () => {
			ctx.setViewMode('3-month');
			expect(ctx.viewMode).toBe('3-month');

			const targetDate = new Date(2026, 5, 15); // June 2026
			ctx.navigateToMonth(targetDate);

			expect(ctx.viewMode).toBe('month');
			// calendarStore should have navigated to June 2026
			expect(calendarStore.month).toBe(5);
			expect(calendarStore.year).toBe(2026);
		});
	});

	// ---- Selected state ----------------------------------------------------

	describe('selection state', () => {
		it('assignmentDate starts null', () => expect(ctx.assignmentDate).toBeNull());
		it('showStatusText starts false', () => expect(ctx.showStatusText).toBe(false));
		it('showPersonnelRoles starts false', () => expect(ctx.showPersonnelRoles).toBe(false));
		it('highlightOnboarding starts true', () => expect(ctx.highlightOnboarding).toBe(true));
	});

	const operateCapabilities = {
		calendar: 'operate',
		personnel: 'view',
		training: 'view',
		criticalTasks: 'view',
		onboarding: 'view',
		ratingScheme: 'view'
	} as const;

	describe('handleCellClick', () => {
		it('opens the editor for that person and day when Calendar operate policy allows availability changes', () => {
			const operatorCtx = makeContext(mockData, makeMockOrg({ capabilityMap: operateCapabilities }));
			operatorCtx.handleCellClick(mockPersonnel[0], new Date(2026, 2, 15));
			expect(operatorCtx.editor).toEqual({
				kind: 'create',
				person: mockPersonnel[0],
				startDate: '2026-03-15',
				endDate: '2026-03-15'
			});
		});

		it('does nothing when Calendar operate policy denies availability changes', () => {
			const noEditCtx = makeContext(mockData, makeMockOrg());
			noEditCtx.handleCellClick(mockPersonnel[0], new Date());
			expect(noEditCtx.editor).toBeNull();
		});

		it('does nothing when person is outside the shared Scope Set', () => {
			const scopedCtx = makeContext(
				mockData,
				makeMockOrg({ capabilityMap: operateCapabilities, scopeSet: { kind: 'groups', groupIds: ['g2'] } })
			);
			scopedCtx.handleCellClick(mockPersonnel[0], new Date());
			expect(scopedCtx.editor).toBeNull();
		});
	});

	describe('scopedGroups', () => {
		const mutableGroups = groupsStore as unknown as { items: { id: string; name: string; sortOrder: number }[] };

		afterEach(() => {
			mutableGroups.items = [];
		});

		it('offers a Group-scoped caller only the Groups in their scope, and an organization caller all of them', () => {
			mutableGroups.items = [
				{ id: 'g1', name: 'Alpha', sortOrder: 0 },
				{ id: 'g2', name: 'Bravo', sortOrder: 1 }
			];

			const scoped = makeContext(mockData, makeMockOrg({ scopeSet: { kind: 'groups', groupIds: ['g2'] } }));
			const unscoped = makeContext(mockData, makeMockOrg());

			expect(scoped.scopedGroups.map((group) => group.name)).toEqual(['Bravo']);
			expect(unscoped.scopedGroups.map((group) => group.name)).toEqual(['Alpha', 'Bravo']);
		});
	});

	describe('handlePersonClick', () => {
		it('opens the editor on today when Calendar operate policy allows availability changes', () => {
			const operatorCtx = makeContext(mockData, makeMockOrg({ capabilityMap: operateCapabilities }), '2026-03-20');
			operatorCtx.handlePersonClick(mockPersonnel[0]);
			expect(operatorCtx.editor).toEqual({
				kind: 'create',
				person: mockPersonnel[0],
				startDate: '2026-03-20',
				endDate: '2026-03-20'
			});
		});

		it('does nothing when Calendar operate policy denies availability changes', () => {
			const noEditCtx = makeContext(mockData, makeMockOrg());
			noEditCtx.handlePersonClick(mockPersonnel[0]);
			expect(noEditCtx.editor).toBeNull();
		});
	});

	it('closes an open popover when the editor opens', () => {
		const operatorCtx = makeContext(mockData, makeMockOrg({ capabilityMap: operateCapabilities }));
		operatorCtx.openEntry(mockPersonnel[0], 'entry-1', {} as HTMLElement);
		expect(operatorCtx.popover).toMatchObject({ kind: 'entry', entryId: 'entry-1' });

		operatorCtx.handleCellClick(mockPersonnel[0], new Date(2026, 2, 15));

		expect(operatorCtx.editor).toEqual({
			kind: 'create',
			person: mockPersonnel[0],
			startDate: '2026-03-15',
			endDate: '2026-03-15'
		});
		expect(operatorCtx.popover).toBeNull();
	});

	describe('saveAvailability', () => {
		const record = {
			personnelId: 'p1',
			statusTypeId: 'leave',
			startDate: '2026-04-07',
			endDate: '2026-04-08',
			note: null as string | null
		};
		const range = (availabilityEntries: (typeof record & { id: string })[]) => ({
			rangeStart: '2026-04-01',
			rangeEnd: '2026-04-30',
			availabilityEntries,
			specialDays: [],
			dailyAssignments: []
		});

		it('reports a create as saved when its reply is lost but the re-read holds the new row', async () => {
			vi.mocked(availabilityStore.add).mockRejectedValueOnce(new Error('POST availability failed'));
			vi.mocked(loadCalendarRange).mockResolvedValueOnce(range([{ id: 'saved-1', ...record }]));

			expect(await ctx.saveAvailability({ kind: 'create', record })).toBe('saved');
			expect(loadCalendarRange).toHaveBeenCalledExactlyOnceWith('org1', {
				rangeStart: '2026-04-07',
				rangeEnd: '2026-04-07'
			});
		});

		it('reports a refused create as not saved when the re-read lacks it', async () => {
			vi.mocked(availabilityStore.add).mockRejectedValueOnce(new Error('POST availability failed'));
			vi.mocked(loadCalendarRange).mockResolvedValueOnce(range([]));

			expect(await ctx.saveAvailability({ kind: 'create', record })).toBe('not-saved');
		});

		it('reports the write as unconfirmed when the re-read fails too', async () => {
			vi.mocked(availabilityStore.removeBool).mockResolvedValueOnce(false);
			vi.mocked(loadCalendarRange).mockRejectedValueOnce(new Error('Range unavailable'));

			expect(await ctx.saveAvailability({ kind: 'remove', entry: { id: 'e1', ...record } })).toBe('unconfirmed');
		});

		const edit = {
			kind: 'update',
			entry: { id: 'entry-1', ...record },
			changes: { statusTypeId: 'leave', startDate: '2026-04-07', endDate: '2026-04-10', note: 'Block leave' }
		} as const;
		const edited = { id: 'entry-1', ...record, endDate: '2026-04-10', note: 'Block leave' };

		it('refuses a second write while one settles, says so, and announces the first only once it lands', async () => {
			const success = vi.spyOn(toastStore, 'success');
			const error = vi.spyOn(toastStore, 'error');
			let resolveAdd!: (entry: typeof record & { id: string }) => void;
			vi.mocked(availabilityStore.add).mockImplementationOnce(() => new Promise((resolve) => (resolveAdd = resolve)));
			const first = ctx.saveAvailability({ kind: 'create', record });

			expect(await ctx.saveAvailability({ kind: 'create', record })).toBe('busy');
			expect(error).toHaveBeenCalledTimes(1);
			expect(success).not.toHaveBeenCalled();

			resolveAdd({ id: 'saved-1', ...record });

			expect(await first).toBe('saved');
			expect(success).toHaveBeenCalledTimes(1);
			expect(availabilityStore.add).toHaveBeenCalledTimes(1);
		});

		function held<T>() {
			let resolve!: (value: T) => void;
			const promise = new Promise<T>((settle) => (resolve = settle));
			return { promise, resolve };
		}
		const readOfApril7 = ['org1', { rangeStart: '2026-04-07', rangeEnd: '2026-04-07' }] as const;

		it('saves an edit as one update of the same entry and announces it only once the update lands', async () => {
			const success = vi.spyOn(toastStore, 'success');
			const update = held<boolean>();
			vi.mocked(availabilityStore.updateOrThrow).mockReturnValueOnce(update.promise);
			const pending = ctx.saveAvailability(edit);

			expect(await settles(pending)).toBe(false);
			expect(success).not.toHaveBeenCalled();

			update.resolve(true);

			expect(await pending).toBe('saved');
			expect(success).toHaveBeenCalledTimes(1);
			expect(vi.mocked(availabilityStore.updateOrThrow).mock.calls).toEqual([['entry-1', edit.changes]]);
			expect(availabilityStore.add).not.toHaveBeenCalled();
			expect(availabilityStore.removeBool).not.toHaveBeenCalled();
		});

		it("recognizes a lost edit reply by the entry's own ID, not a look-alike, without writing again", async () => {
			const success = vi.spyOn(toastStore, 'success');
			const error = vi.spyOn(toastStore, 'error');
			const lookAlike = { ...edited, id: 'other-entry' };
			vi.mocked(availabilityStore.updateOrThrow).mockRejectedValue(new Error('PUT availability failed'));
			const unchanged = held<ReturnType<typeof range>>();
			vi.mocked(loadCalendarRange).mockReturnValueOnce(unchanged.promise);
			const refused = ctx.saveAvailability(edit);

			await vi.waitFor(() => expect(loadCalendarRange).toHaveBeenCalledExactlyOnceWith(...readOfApril7));
			expect(await settles(refused)).toBe(false);
			expect(error).not.toHaveBeenCalled();

			unchanged.resolve(range([{ id: 'entry-1', ...record }, lookAlike]));

			expect(await refused).toBe('not-saved');
			expect(error).toHaveBeenCalledTimes(1);
			expect(success).not.toHaveBeenCalled();
			expect(availabilityStore.updateOrThrow).toHaveBeenCalledTimes(1);

			vi.mocked(loadCalendarRange).mockResolvedValueOnce(range([edited, lookAlike]));
			expect(await ctx.saveAvailability(edit)).toBe('saved');
			expect(success).toHaveBeenCalledTimes(1);
			expect(error).toHaveBeenCalledTimes(1);
			expect(vi.mocked(availabilityStore.updateOrThrow).mock.calls).toEqual([
				['entry-1', edit.changes],
				['entry-1', edit.changes]
			]);
			expect(availabilityStore.add).not.toHaveBeenCalled();
			expect(availabilityStore.removeBool).not.toHaveBeenCalled();
		});

		it.each([
			['edit', edit],
			['removal', { kind: 'remove', entry: { id: 'entry-1', ...record } }]
		] as const)('restores the saved row and reports a refused %s once the re-read lands', async (_, change) => {
			const success = vi.spyOn(toastStore, 'success');
			const error = vi.spyOn(toastStore, 'error');
			vi.mocked(availabilityStore.updateOrThrow).mockResolvedValueOnce(false);
			vi.mocked(availabilityStore.removeBool).mockResolvedValueOnce(false);
			const reread = held<ReturnType<typeof range>>();
			vi.mocked(loadCalendarRange).mockReturnValueOnce(reread.promise);
			const pending = ctx.saveAvailability(change);

			await vi.waitFor(() => expect(loadCalendarRange).toHaveBeenCalledExactlyOnceWith(...readOfApril7));
			expect(await settles(pending)).toBe(false);
			expect(error).not.toHaveBeenCalled();
			expect(availabilityStore.load).not.toHaveBeenCalled();

			reread.resolve(range([{ id: 'entry-1', ...record }]));

			expect(await pending).toBe('not-saved');
			expect(availabilityStore.load).toHaveBeenCalledWith([{ id: 'entry-1', ...record }], 'org1');
			expect(error).toHaveBeenCalledTimes(1);
			expect(success).not.toHaveBeenCalled();
			expect(
				vi.mocked(availabilityStore.updateOrThrow).mock.calls.length +
					vi.mocked(availabilityStore.removeBool).mock.calls.length
			).toBe(1);
			expect(availabilityStore.add).not.toHaveBeenCalled();
		});

		it('reports a refused edit with the server reason at once, without a re-read, and keeps it retryable', async () => {
			const success = vi.spyOn(toastStore, 'success');
			const error = vi.spyOn(toastStore, 'error');
			vi.mocked(availabilityStore.updateOrThrow).mockRejectedValueOnce(
				await buildRequestError(
					Response.json({ message: 'This status type was deleted.' }, { status: 404 }),
					'PUT',
					'availability'
				)
			);

			expect(await ctx.saveAvailability(edit)).toBe('not-saved');
			expect(error.mock.calls).toEqual([['This status type was deleted.']]);
			expect(loadCalendarRange).not.toHaveBeenCalled();
			expect(success).not.toHaveBeenCalled();

			vi.mocked(availabilityStore.updateOrThrow).mockResolvedValueOnce(true);
			expect(await ctx.saveAvailability(edit)).toBe('saved');
		});

		it('re-reads after a server failure on an edit and keeps the generic message', async () => {
			const error = vi.spyOn(toastStore, 'error');
			vi.mocked(availabilityStore.updateOrThrow).mockRejectedValueOnce(
				await buildRequestError(Response.json({ message: 'relation missing' }, { status: 500 }), 'PUT', 'availability')
			);
			vi.mocked(loadCalendarRange).mockResolvedValueOnce(range([{ id: 'entry-1', ...record }]));

			expect(await ctx.saveAvailability(edit)).toBe('not-saved');
			expect(loadCalendarRange).toHaveBeenCalledExactlyOnceWith(...readOfApril7);
			expect(error.mock.calls).toEqual([['Could not save status. Try again.']]);
		});

		it('stays silent when the Organization changes while a lost reply is being checked', async () => {
			const success = vi.spyOn(toastStore, 'success');
			const error = vi.spyOn(toastStore, 'error');
			let currentData = mockData;
			let resolveRead!: (value: ReturnType<typeof range>) => void;
			vi.mocked(availabilityStore.add).mockRejectedValueOnce(new Error('POST availability failed'));
			vi.mocked(loadCalendarRange).mockImplementationOnce(() => new Promise((resolve) => (resolveRead = resolve)));
			const navigatedCtx = makeContext(() => currentData, org);
			const pending = navigatedCtx.saveAvailability({ kind: 'create', record });
			await vi.waitFor(() => expect(loadCalendarRange).toHaveBeenCalled());

			currentData = { ...mockData, orgId: 'org2' };
			resolveRead(range([{ id: 'saved-1', ...record }]));

			expect(await pending).toBe('stale');
			expect(success).not.toHaveBeenCalled();
			expect(error).not.toHaveBeenCalled();
			expect(availabilityStore.load).not.toHaveBeenCalled();
		});

		it('does not report an old Organization edit as saved after navigation', async () => {
			const success = vi.spyOn(toastStore, 'success');
			let currentData = mockData;
			let resolveUpdate!: (saved: boolean) => void;
			vi.mocked(availabilityStore.updateOrThrow).mockImplementation(
				() => new Promise((resolve) => (resolveUpdate = resolve))
			);
			const navigatedCtx = makeContext(() => currentData, org);
			const pending = navigatedCtx.saveAvailability({
				kind: 'update',
				entry: { id: 'entry-1', ...record },
				changes: { statusTypeId: 'leave', startDate: '2026-04-07', endDate: '2026-04-07', note: null }
			});
			currentData = { ...mockData, orgId: 'org2' };
			resolveUpdate(true);

			expect(await pending).toBe('stale');
			expect(success).not.toHaveBeenCalled();
		});
	});

	describe('reconcileAvailability', () => {
		it('reads both the clicked date and replacement date after an uncertain edit', async () => {
			const savedEntry = {
				id: 'saved-2',
				personnelId: 'p1',
				statusTypeId: 'leave',
				startDate: '2026-04-09',
				endDate: '2026-04-09',
				note: null
			};
			vi.mocked(loadCalendarRange)
				.mockResolvedValueOnce({
					rangeStart: '2026-04-07',
					rangeEnd: '2026-04-07',
					availabilityEntries: [],
					specialDays: [],
					dailyAssignments: []
				})
				.mockResolvedValueOnce({
					rangeStart: '2026-04-09',
					rangeEnd: '2026-04-09',
					availabilityEntries: [savedEntry],
					specialDays: [],
					dailyAssignments: []
				});

			const saved = await ctx.reconcileAvailability(['2026-04-07', '2026-04-09'], 'org1');

			expect(loadCalendarRange).toHaveBeenCalledWith('org1', {
				rangeStart: '2026-04-07',
				rangeEnd: '2026-04-07'
			});
			expect(loadCalendarRange).toHaveBeenCalledWith('org1', {
				rangeStart: '2026-04-09',
				rangeEnd: '2026-04-09'
			});
			expect(saved).toEqual([savedEntry]);
		});

		it('does not reload availability for an old Organization after navigation', async () => {
			const currentData = { ...mockData, orgId: 'org2' };
			const navigatedCtx = makeContext(() => currentData, org);
			const result = await navigatedCtx.reconcileAvailability(['2026-04-07'], 'org1');

			expect(result).toBeNull();
			expect(loadCalendarRange).not.toHaveBeenCalled();
			expect(availabilityStore.load).not.toHaveBeenCalled();
		});

		it('does not apply a late response after switching Organizations', async () => {
			let currentData = mockData;
			let resolveRange!: (value: Awaited<ReturnType<typeof loadCalendarRange>>) => void;
			vi.mocked(loadCalendarRange).mockImplementation(() => new Promise((resolve) => (resolveRange = resolve)));
			const navigatedCtx = makeContext(() => currentData, org);
			const pending = navigatedCtx.reconcileAvailability(['2026-04-07'], 'org1');
			currentData = { ...mockData, orgId: 'org2' };
			resolveRange({
				rangeStart: '2026-04-07',
				rangeEnd: '2026-04-07',
				availabilityEntries: [],
				specialDays: [],
				dailyAssignments: []
			});

			expect(await pending).toBeNull();
			expect(availabilityStore.load).not.toHaveBeenCalled();
		});

		it('treats a failed late range read as abandoned after an Organization switch', async () => {
			let currentData = mockData;
			let rejectRange!: (error: Error) => void;
			vi.mocked(loadCalendarRange).mockImplementation(() => new Promise((_, reject) => (rejectRange = reject)));
			const navigatedCtx = makeContext(() => currentData, org);
			const pending = navigatedCtx.reconcileAvailability(['2026-04-07'], 'org1');
			currentData = { ...mockData, orgId: 'org2' };
			rejectRange(new Error('Old range unavailable'));

			expect(await pending).toBeNull();
			expect(availabilityStore.load).not.toHaveBeenCalled();
		});

		it.each(['response', 'failure'] as const)(
			'drops a recovery %s that arrives after its Organization shell ends',
			async (outcome) => {
				let settle!: {
					resolve: (value: Awaited<ReturnType<typeof loadCalendarRange>>) => void;
					reject: (error: Error) => void;
				};
				vi.mocked(loadCalendarRange).mockImplementation(
					() => new Promise((resolve, reject) => (settle = { resolve, reject }))
				);
				const pending = ctx.reconcileAvailability(['2026-04-07'], 'org1');
				endOrganizationLifetime();
				if (outcome === 'response')
					settle.resolve({
						rangeStart: '2026-04-07',
						rangeEnd: '2026-04-07',
						availabilityEntries: [],
						specialDays: [],
						dailyAssignments: []
					});
				else settle.reject(new Error('Old range unavailable'));

				expect(await settles(pending)).toBe(false);
				expect(availabilityStore.load).not.toHaveBeenCalled();
			}
		);

		it('reports a failed range read while the same Organization is still open', async () => {
			vi.mocked(loadCalendarRange).mockRejectedValueOnce(new Error('Current range unavailable'));

			await expect(ctx.reconcileAvailability(['2026-04-07'], 'org1')).rejects.toThrow('Current range unavailable');
		});

		it('does not merge a response after Calendar scope narrows in the same Organization', async () => {
			let access = makeMockOrg();
			let resolveRange!: (value: Awaited<ReturnType<typeof loadCalendarRange>>) => void;
			vi.mocked(loadCalendarRange).mockImplementation(() => new Promise((resolve) => (resolveRange = resolve)));
			const mutableOrg = new Proxy(org, {
				get(_target, property) {
					return Reflect.get(access, property);
				}
			});
			const scopedCtx = makeContext(mockData, mutableOrg);
			const pending = scopedCtx.reconcileAvailability(['2026-04-07'], 'org1');
			access = makeMockOrg({ scopeSet: { kind: 'groups', groupIds: [] } });
			resolveRange({
				rangeStart: '2026-04-07',
				rangeEnd: '2026-04-07',
				availabilityEntries: [],
				specialDays: [],
				dailyAssignments: []
			});

			expect(await pending).toBeNull();
			expect(availabilityStore.load).not.toHaveBeenCalled();
		});
	});

	// ---- handleDateClick / closeAssignmentModal ---------------------------

	describe('handleDateClick / closeAssignmentModal', () => {
		it('sets assignmentDate', () => {
			const d = new Date('2026-04-01');
			ctx.handleDateClick(d);
			expect(ctx.assignmentDate).toBe(d);
		});

		it('closeAssignmentModal clears assignmentDate', () => {
			ctx.handleDateClick(new Date());
			ctx.closeAssignmentModal();
			expect(ctx.assignmentDate).toBeNull();
		});
	});

	describe('openDutyPicker / closePopover', () => {
		const anchor = {} as HTMLElement;
		const date = new Date(2026, 9, 27);

		it('opens the duty picker only for assignment managers', () => {
			const viewer = makeContext(mockData, makeMockOrg());
			viewer.openDutyPicker('sd', date, anchor);
			expect(viewer.popover).toBeNull();

			const manager = makeContext(mockData, makeMockOrg({ userRole: 'admin' }));
			manager.openDutyPicker('sd', date, anchor);
			expect(manager.popover).toEqual({ kind: 'duty', typeId: 'sd', date, anchor });
			manager.closePopover();
			expect(manager.popover).toBeNull();
		});
	});

	// ---- toggleHighlightOnboarding ----------------------------------------

	describe('toggleHighlightOnboarding', () => {
		it('flips highlightOnboarding', () => {
			expect(ctx.highlightOnboarding).toBe(true);
			ctx.toggleHighlightOnboarding();
			expect(ctx.highlightOnboarding).toBe(false);
			ctx.toggleHighlightOnboarding();
			expect(ctx.highlightOnboarding).toBe(true);
		});
	});

	describe('toggleShowStatusText', () => {
		it('flips showStatusText', () => {
			expect(ctx.showStatusText).toBe(false);
			ctx.toggleShowStatusText();
			expect(ctx.showStatusText).toBe(true);
			ctx.toggleShowStatusText();
			expect(ctx.showStatusText).toBe(false);
		});
	});

	describe('toggleShowPersonnelRoles', () => {
		it('flips showPersonnelRoles and persists the preference', () => {
			expect(ctx.showPersonnelRoles).toBe(false);

			ctx.toggleShowPersonnelRoles();

			expect(ctx.showPersonnelRoles).toBe(true);
			expect(savePreferences).toHaveBeenCalledWith({ showPersonnelRoles: true });
		});
	});

	// ---- calendarPersonnel / scopedPersonnelIds ---------------------------

	describe('calendarPersonnel', () => {
		it('uses workspace personnel when the route data is nested under calendar.data', () => {
			const workspacePerson = { ...mockPersonnel[0], id: 'workspace-person', lastName: 'Workspace' };
			const nestedCtx = makeContext(
				{
					...mockData,
					personnel: [],
					allPersonnel: [],
					calendar: {
						data: {
							personnel: [workspacePerson],
							activeOnboardingPersonnelIds: ['workspace-person']
						}
					}
				},
				makeMockOrg()
			);

			expect(nestedCtx.calendarPersonnel).toEqual([workspacePerson]);
			expect(nestedCtx.scopedPersonnelIds).toEqual(new Set(['workspace-person']));
			expect(nestedCtx.activeOnboardingPersonnelIds).toEqual(['workspace-person']);
		});

		it('falls back to personnel when allPersonnel is absent', () => {
			const ctx2 = makeContext({ ...mockData, allPersonnel: undefined }, makeMockOrg());
			expect(ctx2.calendarPersonnel).toEqual(mockPersonnel);
		});

		it('uses allPersonnel when present', () => {
			expect(ctx.calendarPersonnel).toEqual(mockPersonnel);
		});
	});

	describe('scopedPersonnelIds', () => {
		it('contains ids from personnel (scoped set)', () => {
			expect(ctx.scopedPersonnelIds.has('p1')).toBe(true);
		});

		it('does not contain unknown ids', () => {
			expect(ctx.scopedPersonnelIds.has('unknown')).toBe(false);
		});
	});

	describe('calendar roster filters', () => {
		it('builds group filter options from the scoped roster', () => {
			expect(ctx.groupFilterOptions).toEqual([
				{ value: '', label: 'All groups', count: 2 },
				{ value: 'g1', label: 'Alpha', count: 1 },
				{ value: 'g2', label: 'Bravo', count: 1 }
			]);
		});

		it('filters the visible roster to one group', () => {
			ctx.setCalendarGroupFilter('g2');

			expect(ctx.filteredPBG).toEqual([{ group: 'Bravo', personnel: [mockPersonnel[1]] }]);
		});

		it('filters the visible roster from typed personnel search text', () => {
			ctx.setCalendarPersonnelSearch('med');

			expect(ctx.filteredPBG).toEqual([{ group: 'Bravo', personnel: [mockPersonnel[1]] }]);
		});

		it('matches typed personnel search text against rank, MOS, name, role, and group', () => {
			ctx.setCalendarPersonnelSearch('sgt');
			expect(ctx.filteredPBG).toEqual([{ group: 'Alpha', personnel: [mockPersonnel[0]] }]);

			ctx.setCalendarPersonnelSearch('68w');
			expect(ctx.filteredPBG).toEqual([{ group: 'Bravo', personnel: [mockPersonnel[1]] }]);

			ctx.setCalendarPersonnelSearch('smith');
			expect(ctx.filteredPBG).toEqual([{ group: 'Alpha', personnel: [mockPersonnel[0]] }]);

			ctx.setCalendarPersonnelSearch('medic');
			expect(ctx.filteredPBG).toEqual([{ group: 'Bravo', personnel: [mockPersonnel[1]] }]);

			ctx.setCalendarPersonnelSearch('bravo');
			expect(ctx.filteredPBG).toEqual([{ group: 'Bravo', personnel: [mockPersonnel[1]] }]);
		});

		it('combines group filtering with typed personnel search text', () => {
			ctx.setCalendarGroupFilter('g2');
			ctx.setCalendarPersonnelSearch('alice');

			expect(ctx.calendarPersonnelSearch).toBe('alice');
			expect(ctx.filteredPBG).toEqual([]);

			ctx.setCalendarPersonnelSearch('bob');
			expect(ctx.filteredPBG).toEqual([{ group: 'Bravo', personnel: [mockPersonnel[1]] }]);
		});
	});

	describe('todayAvailability', () => {
		const TODAY = '2026-10-16';
		const leave = {
			id: 'leave',
			name: 'Leave',
			color: '#16a34a',
			textColor: '#ffffff',
			shortLabel: null,
			sortOrder: 0
		} satisfies StatusType;
		const carol: Personnel = { ...mockPersonnel[0], id: 'p3', firstName: 'Carol', lastName: 'Diaz' };
		const roster = [...mockPersonnel, carol];
		const loaded = (rangeStart: string, rangeEnd: string): CalendarPageData => ({
			...mockData,
			calendar: { data: { rangeStart, rangeEnd, personnel: roster, allPersonnel: roster } }
		});
		const entry = (id: string, personnelId: string, startDate: string, endDate: string): AvailabilityEntry => ({
			id,
			personnelId,
			statusTypeId: 'leave',
			startDate,
			endDate,
			note: null
		});
		const stores = { availability: availabilityStore, statusTypes: statusTypesStore } as unknown as {
			availability: { items: AvailabilityEntry[] };
			statusTypes: { items: StatusType[] };
		};

		beforeEach(() => {
			stores.statusTypes.items = [leave];
			stores.availability.items = [
				entry('a', 'p1', '2026-10-10', '2026-10-20'),
				entry('b', 'p1', '2026-10-16', '2026-10-16'),
				entry('c', 'p2', '2026-10-15', '2026-10-15')
			];
		});

		afterEach(() => {
			stores.statusTypes.items = [];
			stores.availability.items = [];
		});

		it('counts each person out today once and ignores Group filter and search', () => {
			const today = makeContext(loaded('2026-09-01', '2026-11-30'), org, TODAY);

			expect(today.todayAvailability).toEqual({ date: new Date(2026, 9, 16), available: 2, total: 3 });
			today.setCalendarGroupFilter('g2');
			today.setCalendarPersonnelSearch('bob');
			expect(today.todayAvailability).toEqual({ date: new Date(2026, 9, 16), available: 2, total: 3 });
		});

		it('counts only the people in the viewer scope', () => {
			const scoped = makeContext(
				loaded('2026-09-01', '2026-11-30'),
				makeMockOrg({ scopeSet: { kind: 'groups', groupIds: ['g1'] } }),
				TODAY
			);

			expect(scoped.todayAvailability).toEqual({ date: new Date(2026, 9, 16), available: 1, total: 2 });
		});

		it('is hidden while the loaded range does not include today', () => {
			expect(makeContext(loaded('2027-01-01', '2027-03-31'), org, TODAY).todayAvailability).toBeNull();
			expect(makeContext(mockData, org, TODAY).todayAvailability).toBeNull();
			expect(makeContext(loaded('2026-10-16', '2026-10-31'), org, TODAY).todayAvailability).toEqual({
				date: new Date(2026, 9, 16),
				available: 2,
				total: 3
			});
		});
	});

	// ---- upcomingLossMap -------------------------------------------------------

	describe('upcomingLossMap', () => {
		const TODAY = '2026-04-14';
		// 48 days from TODAY — well within the 180-day default window
		const IN_WINDOW = '2026-06-01';
		// 382 days from TODAY — beyond any reasonable window
		const OUT_OF_WINDOW = '2027-05-01';

		function makePersonWithEts(id: string, ets: string): (typeof mockPersonnel)[0] {
			return { ...mockPersonnel[0], id, ets } as (typeof mockPersonnel)[0];
		}

		function makePersonWithDeros(id: string, deros: string): (typeof mockPersonnel)[0] {
			return { ...mockPersonnel[0], id, deros } as (typeof mockPersonnel)[0];
		}

		it('returns an empty map when no personnel have tracked dates', () => {
			const ctxLoss = makeContext(mockData, org, TODAY);
			expect(ctxLoss.upcomingLossMap.size).toBe(0);
		});

		it('includes a person whose ETS falls within the warning window', () => {
			const personnel = [makePersonWithEts('p1', IN_WINDOW)];
			const ctxLoss = makeContext({ ...mockData, personnel, allPersonnel: personnel }, org, TODAY);
			const record = ctxLoss.upcomingLossMap.get('p1');
			expect(record).toBeDefined();
			expect(record?.triggerType).toBe('ETS');
		});

		it('includes a person whose DEROS falls within the warning window', () => {
			const personnel = [makePersonWithDeros('p1', IN_WINDOW)];
			const ctxLoss = makeContext({ ...mockData, personnel, allPersonnel: personnel }, org, TODAY);
			const record = ctxLoss.upcomingLossMap.get('p1');
			expect(record).toBeDefined();
			expect(record?.triggerType).toBe('PCS / DEROS');
		});

		it('shows no loss flags when the unit turns Losses and awards off', () => {
			const personnel = [makePersonWithEts('p1', IN_WINDOW)];
			const ctxLoss = makeContext(
				{ ...mockData, personnel, allPersonnel: personnel, disabledFeatures: ['lossesAndAwards'] },
				org,
				TODAY
			);
			expect(ctxLoss.upcomingLossMap.size).toBe(0);
			expect(ctxLoss.lossWarningsUnavailable).toBe(false);
		});

		it('excludes a person whose ETS falls outside the warning window', () => {
			const personnel = [makePersonWithEts('p1', OUT_OF_WINDOW)];
			const ctxLoss = makeContext({ ...mockData, personnel, allPersonnel: personnel }, org, TODAY);
			expect(ctxLoss.upcomingLossMap.has('p1')).toBe(false);
		});

		it('returns an empty map when the personnel list is empty', () => {
			const ctxLoss = makeContext({ ...mockData, personnel: [], allPersonnel: [] }, org, TODAY);
			expect(ctxLoss.upcomingLossMap.size).toBe(0);
		});

		it('respects a custom lossWarningWindowDays from workspace data (too narrow)', () => {
			// ETS 17 days from today — inside 180d default but outside a 10-day window
			const personnel = [makePersonWithEts('p1', '2026-05-01')];
			const ctxLoss = makeContext(
				{
					...mockData,
					personnel,
					allPersonnel: personnel,
					calendar: { data: { personnel, lossWarningWindowDays: 10 } }
				},
				org,
				TODAY
			);
			expect(ctxLoss.upcomingLossMap.has('p1')).toBe(false);
		});

		it('respects a custom lossWarningWindowDays from workspace data (wide enough)', () => {
			// ETS 17 days from today — inside a 30-day window
			const personnel = [makePersonWithEts('p1', '2026-05-01')];
			const ctxLoss = makeContext(
				{
					...mockData,
					personnel,
					allPersonnel: personnel,
					calendar: { data: { personnel, lossWarningWindowDays: 30 } }
				},
				org,
				TODAY
			);
			expect(ctxLoss.upcomingLossMap.has('p1')).toBe(true);
		});

		it('shows no loss flags and reports warnings unavailable when the window could not be read', () => {
			const personnel = [makePersonWithEts('p1', IN_WINDOW)];
			const ctxLoss = makeContext(
				{
					...mockData,
					personnel,
					allPersonnel: personnel,
					calendar: { data: { personnel, lossWarningWindowDays: null } }
				},
				org,
				TODAY
			);
			expect([...ctxLoss.upcomingLossMap.keys()]).toEqual([]);
			expect(ctxLoss.lossWarningsUnavailable).toBe(true);
		});

		it('flags an ETS 60 days out but not 61 under a stored 60-day window', () => {
			const personnel = [makePersonWithEts('day-60', '2026-06-13'), makePersonWithEts('day-61', '2026-06-14')];
			const ctxLoss = makeContext(
				{
					...mockData,
					personnel,
					allPersonnel: personnel,
					calendar: { data: { personnel, lossWarningWindowDays: 60 } }
				},
				org,
				TODAY
			);
			expect([...ctxLoss.upcomingLossMap.keys()]).toEqual(['day-60']);
			expect(ctxLoss.lossWarningsUnavailable).toBe(false);
		});

		it('defaults to a 180-day window when lossWarningWindowDays is absent', () => {
			// ETS 120 days from today — inside the 180-day default
			const personnel = [makePersonWithEts('p1', '2026-08-12')];
			const ctxLoss = makeContext({ ...mockData, personnel, allPersonnel: personnel }, org, TODAY);
			expect(ctxLoss.upcomingLossMap.has('p1')).toBe(true);
		});
	});
});
