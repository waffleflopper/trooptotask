import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CalendarPageContext, type CalendarPageData } from './CalendarPageContext.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { groupsStore } from '$features/personnel';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import { queueUserPreferencesPatch } from '$lib/preferences/userPreferences.client';
import { loadCalendarRange } from '$features/calendar/utils/calendarRangeLoader';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import type { Personnel } from '$lib/types';
import {
	createTestOrgContext,
	FULL_TEST_CAPABILITY_MAP,
	VIEW_TEST_CAPABILITY_MAP
} from '$lib/test-support/orgContextBuilder';

vi.mock('$lib/preferences/userPreferences.client', () => ({
	queueUserPreferencesPatch: vi.fn()
}));
vi.mock('$features/calendar/utils/calendarRangeLoader', () => ({
	loadCalendarRange: vi.fn()
}));
vi.mock('$features/calendar/stores/availability.svelte', () => ({
	availabilityStore: { items: [], loading: false, load: vi.fn() }
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
	return createTestOrgContext({
		orgId: 'org1',
		userId: 'user1',
		userRole: role,
		capabilityMap: overrides.capabilityMap ?? (isPrivileged ? FULL_TEST_CAPABILITY_MAP : VIEW_TEST_CAPABILITY_MAP),
		scopeSet: overrides.scopeSet
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CalendarPageContext', () => {
	let ctx: CalendarPageContext;
	let org: OrgContext;

	beforeEach(() => {
		org = makeMockOrg();
		mutableAvailabilityStore.loading = false;
		mutableDailyAssignmentsStore.loading = false;
		mutableSpecialDaysStore.loading = false;
		mutableStatusTypesStore.loading = false;
		mutableGroupsStore.loading = false;
		vi.mocked(queueUserPreferencesPatch).mockClear();
		vi.mocked(loadCalendarRange).mockReset();
		vi.mocked(availabilityStore.load).mockReset();
		ctx = new CalendarPageContext(mockData, org);
	});

	// ---- Derived permission flags ------------------------------------------

	describe('permission flags', () => {
		it('canManageConfig is false when not owner/admin/fullEditor', () => {
			expect(ctx.canManageConfig).toBe(false);
		});

		it('canManageConfig is true for owner', () => {
			const ownerCtx = new CalendarPageContext(mockData, makeMockOrg({ userRole: 'owner' }));
			expect(ownerCtx.canManageConfig).toBe(true);
		});

		it('canManageConfig is true for admin', () => {
			const adminCtx = new CalendarPageContext(mockData, makeMockOrg({ userRole: 'admin' }));
			expect(adminCtx.canManageConfig).toBe(true);
		});

		it('canManageConfig is true for Calendar configure capability', () => {
			const editorCtx = new CalendarPageContext(
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
			const operatorCtx = new CalendarPageContext(
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
			const scopedManagerCtx = new CalendarPageContext(
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
			expect(new CalendarPageContext(mockData, org).isHydrating).toBe(true);
		});
	});

	// ---- Modal registry removed (Phase 3.3 — modals inlined into CalendarPageView) ----

	describe('syncUserPreferences', () => {
		it('honors a saved personnel role display preference', () => {
			ctx.syncUserPreferences({
				...getDefaultUserOrgPreferences(),
				calendar: {
					...getDefaultUserOrgPreferences().calendar,
					showPersonnelRoles: false
				}
			});

			expect(ctx.showPersonnelRoles).toBe(false);
		});
	});

	// ---- View mode state ---------------------------------------------------

	describe('viewMode', () => {
		it('defaults to month', () => {
			expect(ctx.viewMode).toBe('month');
		});

		it('toggleViewMode switches between month and 3-month', () => {
			ctx.toggleViewMode();
			expect(ctx.viewMode).toBe('3-month');
			ctx.toggleViewMode();
			expect(ctx.viewMode).toBe('month');
		});

		it('navigateToMonth switches to month view and navigates calendarStore', () => {
			ctx.toggleViewMode(); // now in 3-month
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
		it('selectedPerson starts null', () => expect(ctx.selectedPerson).toBeNull());
		it('selectedDate starts null', () => expect(ctx.selectedDate).toBeNull());
		it('assignmentDate starts null', () => expect(ctx.assignmentDate).toBeNull());
		it('showStatusText starts false', () => expect(ctx.showStatusText).toBe(false));
		it('showPersonnelRoles starts false', () => expect(ctx.showPersonnelRoles).toBe(false));
		it('highlightOnboarding starts true', () => expect(ctx.highlightOnboarding).toBe(true));
	});

	// ---- handleCellClick --------------------------------------------------

	describe('handleCellClick', () => {
		it('sets selectedPerson and selectedDate when Calendar operate policy allows availability changes', () => {
			const operatorCtx = new CalendarPageContext(
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
			const date = new Date('2026-03-15');
			operatorCtx.handleCellClick(mockPersonnel[0], date);
			expect(operatorCtx.selectedPerson).toBe(mockPersonnel[0]);
			expect(operatorCtx.selectedDate).toBe(date);
		});

		it('does nothing when Calendar operate policy denies availability changes', () => {
			const noEditCtx = new CalendarPageContext(mockData, makeMockOrg());
			noEditCtx.handleCellClick(mockPersonnel[0], new Date());
			expect(noEditCtx.selectedPerson).toBeNull();
		});

		it('does nothing when person is outside the shared Scope Set', () => {
			const scopedCtx = new CalendarPageContext(
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
					scopeSet: { kind: 'groups', groupIds: ['g2'] }
				})
			);
			scopedCtx.handleCellClick(mockPersonnel[0], new Date());
			expect(scopedCtx.selectedPerson).toBeNull();
		});
	});

	// ---- handlePersonClick ------------------------------------------------

	describe('handlePersonClick', () => {
		it('sets selectedPerson and selectedDate to today when Calendar operate policy allows availability changes', () => {
			const operatorCtx = new CalendarPageContext(
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
			const before = Date.now();
			operatorCtx.handlePersonClick(mockPersonnel[0]);
			const after = Date.now();
			expect(operatorCtx.selectedPerson).toBe(mockPersonnel[0]);
			expect(operatorCtx.selectedDate).toBeInstanceOf(Date);
			expect(operatorCtx.selectedDate!.getTime()).toBeGreaterThanOrEqual(before);
			expect(operatorCtx.selectedDate!.getTime()).toBeLessThanOrEqual(after);
		});

		it('does nothing when Calendar operate policy denies availability changes', () => {
			const noEditCtx = new CalendarPageContext(mockData, makeMockOrg());
			noEditCtx.handlePersonClick(mockPersonnel[0]);
			expect(noEditCtx.selectedPerson).toBeNull();
		});
	});

	// ---- closeAvailabilityModal -------------------------------------------

	describe('closeAvailabilityModal', () => {
		it('clears selectedPerson and selectedDate', () => {
			ctx.handleCellClick(mockPersonnel[0], new Date());
			ctx.closeAvailabilityModal();
			expect(ctx.selectedPerson).toBeNull();
			expect(ctx.selectedDate).toBeNull();
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
			const navigatedCtx = new CalendarPageContext(() => currentData, org);
			const result = await navigatedCtx.reconcileAvailability(['2026-04-07'], 'org1');

			expect(result).toBeNull();
			expect(loadCalendarRange).not.toHaveBeenCalled();
			expect(availabilityStore.load).not.toHaveBeenCalled();
		});

		it('does not apply a late response after switching Organizations', async () => {
			let currentData = mockData;
			let resolveRange!: (value: Awaited<ReturnType<typeof loadCalendarRange>>) => void;
			vi.mocked(loadCalendarRange).mockImplementation(() => new Promise((resolve) => (resolveRange = resolve)));
			const navigatedCtx = new CalendarPageContext(() => currentData, org);
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

		it('does not merge a response after Calendar scope narrows in the same Organization', async () => {
			let access = makeMockOrg();
			let resolveRange!: (value: Awaited<ReturnType<typeof loadCalendarRange>>) => void;
			vi.mocked(loadCalendarRange).mockImplementation(() => new Promise((resolve) => (resolveRange = resolve)));
			const mutableOrg = new Proxy(org, {
				get(_target, property) {
					return Reflect.get(access, property);
				}
			});
			const scopedCtx = new CalendarPageContext(mockData, mutableOrg);
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
			expect(queueUserPreferencesPatch).toHaveBeenCalledWith('org1', {
				calendar: {
					showPersonnelRoles: true
				}
			});
		});
	});

	// ---- calendarPersonnel / scopedPersonnelIds ---------------------------

	describe('calendarPersonnel', () => {
		it('uses workspace personnel when the route data is nested under calendar.data', () => {
			const workspacePerson = { ...mockPersonnel[0], id: 'workspace-person', lastName: 'Workspace' };
			const nestedCtx = new CalendarPageContext(
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
			const ctx2 = new CalendarPageContext({ ...mockData, allPersonnel: undefined }, makeMockOrg());
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
			const ctxLoss = new CalendarPageContext(mockData, org, TODAY);
			expect(ctxLoss.upcomingLossMap.size).toBe(0);
		});

		it('includes a person whose ETS falls within the warning window', () => {
			const personnel = [makePersonWithEts('p1', IN_WINDOW)];
			const ctxLoss = new CalendarPageContext({ ...mockData, personnel, allPersonnel: personnel }, org, TODAY);
			const record = ctxLoss.upcomingLossMap.get('p1');
			expect(record).toBeDefined();
			expect(record?.triggerType).toBe('ETS');
		});

		it('includes a person whose DEROS falls within the warning window', () => {
			const personnel = [makePersonWithDeros('p1', IN_WINDOW)];
			const ctxLoss = new CalendarPageContext({ ...mockData, personnel, allPersonnel: personnel }, org, TODAY);
			const record = ctxLoss.upcomingLossMap.get('p1');
			expect(record).toBeDefined();
			expect(record?.triggerType).toBe('PCS / DEROS');
		});

		it('excludes a person whose ETS falls outside the warning window', () => {
			const personnel = [makePersonWithEts('p1', OUT_OF_WINDOW)];
			const ctxLoss = new CalendarPageContext({ ...mockData, personnel, allPersonnel: personnel }, org, TODAY);
			expect(ctxLoss.upcomingLossMap.has('p1')).toBe(false);
		});

		it('returns an empty map when the personnel list is empty', () => {
			const ctxLoss = new CalendarPageContext({ ...mockData, personnel: [], allPersonnel: [] }, org, TODAY);
			expect(ctxLoss.upcomingLossMap.size).toBe(0);
		});

		it('respects a custom lossWarningWindowDays from workspace data (too narrow)', () => {
			// ETS 17 days from today — inside 180d default but outside a 10-day window
			const personnel = [makePersonWithEts('p1', '2026-05-01')];
			const ctxLoss = new CalendarPageContext(
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
			const ctxLoss = new CalendarPageContext(
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

		it('defaults to a 180-day window when lossWarningWindowDays is absent', () => {
			// ETS 120 days from today — inside the 180-day default
			const personnel = [makePersonWithEts('p1', '2026-08-12')];
			const ctxLoss = new CalendarPageContext({ ...mockData, personnel, allPersonnel: personnel }, org, TODAY);
			expect(ctxLoss.upcomingLossMap.has('p1')).toBe(true);
		});
	});
});
