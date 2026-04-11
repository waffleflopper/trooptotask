import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CalendarPageContext, type CalendarPageData } from './CalendarPageContext.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import { queueUserPreferencesPatch } from '$lib/preferences/userPreferences.client';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import type { Personnel } from '$lib/types';

vi.mock('$lib/preferences/userPreferences.client', () => ({
	queueUserPreferencesPatch: vi.fn()
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
vi.mock('$lib/stores/groups.svelte', () => ({
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
		mos: ''
	}
];

const mockData: CalendarPageData = {
	orgId: 'org1',
	orgName: 'Test Org',
	userId: 'user1',
	personnel: mockPersonnel,
	allPersonnel: mockPersonnel,
	scopedGroupId: null,
	permissions: {
		canViewCalendar: true,
		canEditCalendar: true
	}
};

const mutableAvailabilityStore = availabilityStore as unknown as { loading: boolean };
const mutableDailyAssignmentsStore = dailyAssignmentsStore as unknown as { loading: boolean };
const mutableSpecialDaysStore = specialDaysStore as unknown as { loading: boolean };
const mutableStatusTypesStore = statusTypesStore as unknown as { loading: boolean };
const mutableGroupsStore = groupsStore as unknown as { loading: boolean };

function makeMockOrg(overrides: Partial<OrgContext> = {}): OrgContext {
	return {
		orgId: 'org1',
		orgName: 'Test Org',
		userId: 'user1',
		role: 'member',
		isOwner: false,
		isAdmin: false,
		isPrivileged: false,
		isFullEditor: false,
		permissions: {} as OrgContext['permissions'],
		scopedGroupId: null,
		readOnly: false,
		...overrides
	};
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
		ctx = new CalendarPageContext(mockData, org);
	});

	// ---- Derived permission flags ------------------------------------------

	describe('permission flags', () => {
		it('readOnly is false when billing is not enabled', () => {
			expect(ctx.readOnly).toBe(false);
		});

		it('canManageConfig is false when not owner/admin/fullEditor', () => {
			expect(ctx.canManageConfig).toBe(false);
		});

		it('canManageConfig is true for owner', () => {
			const ownerCtx = new CalendarPageContext(mockData, makeMockOrg({ isOwner: true }));
			expect(ownerCtx.canManageConfig).toBe(true);
		});

		it('canManageConfig is true for admin', () => {
			const adminCtx = new CalendarPageContext(mockData, makeMockOrg({ isAdmin: true }));
			expect(adminCtx.canManageConfig).toBe(true);
		});

		it('canManageConfig is true for fullEditor', () => {
			const editorCtx = new CalendarPageContext(mockData, makeMockOrg({ isFullEditor: true }));
			expect(editorCtx.canManageConfig).toBe(true);
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

	// ---- breakdown panel state --------------------------------------------

	describe('breakdownExpanded / toggleBreakdown', () => {
		it('breakdownExpanded starts true before responsive init runs', () => {
			expect(ctx.breakdownExpanded).toBe(true);
		});

		it('syncUserPreferences collapses the panel on mobile when no explicit preference is saved', () => {
			ctx.syncUserPreferences(getDefaultUserOrgPreferences(), () => ({ matches: true }));
			expect(ctx.breakdownExpanded).toBe(false);
		});

		it('syncUserPreferences honors an explicit saved today-summary preference', () => {
			ctx.syncUserPreferences(
				{
					...getDefaultUserOrgPreferences(),
					calendar: {
						...getDefaultUserOrgPreferences().calendar,
						todaySummaryExpanded: true
					}
				},
				() => ({ matches: true })
			);
			expect(ctx.breakdownExpanded).toBe(true);
		});

		it('syncUserPreferences honors a saved personnel role display preference', () => {
			ctx.syncUserPreferences({
				...getDefaultUserOrgPreferences(),
				calendar: {
					...getDefaultUserOrgPreferences().calendar,
					showPersonnelRoles: false
				}
			});

			expect(ctx.showPersonnelRoles).toBe(false);
		});

		it('toggleBreakdown flips breakdownExpanded', () => {
			ctx.toggleBreakdown();
			expect(ctx.breakdownExpanded).toBe(false);
			ctx.toggleBreakdown();
			expect(ctx.breakdownExpanded).toBe(true);
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
		it('showPersonnelRoles starts true', () => expect(ctx.showPersonnelRoles).toBe(true));
		it('highlightOnboarding starts true', () => expect(ctx.highlightOnboarding).toBe(true));
	});

	// ---- handleCellClick --------------------------------------------------

	describe('handleCellClick', () => {
		it('sets selectedPerson and selectedDate when canEditCalendar', () => {
			const date = new Date('2026-03-15');
			ctx.handleCellClick(mockPersonnel[0], date);
			expect(ctx.selectedPerson).toBe(mockPersonnel[0]);
			expect(ctx.selectedDate).toBe(date);
		});

		it('does nothing when canEditCalendar is false', () => {
			const noEditCtx = new CalendarPageContext(
				{ ...mockData, permissions: { ...mockData.permissions, canEditCalendar: false } },
				makeMockOrg()
			);
			noEditCtx.handleCellClick(mockPersonnel[0], new Date());
			expect(noEditCtx.selectedPerson).toBeNull();
		});

		it('does nothing when person is outside scoped group', () => {
			const scopedCtx = new CalendarPageContext(
				{ ...mockData, scopedGroupId: 'other-group', personnel: [] }, // p1 is NOT in scoped set
				makeMockOrg()
			);
			scopedCtx.handleCellClick(mockPersonnel[0], new Date());
			expect(scopedCtx.selectedPerson).toBeNull();
		});
	});

	// ---- handlePersonClick ------------------------------------------------

	describe('handlePersonClick', () => {
		it('sets selectedPerson and selectedDate to today when canEditCalendar', () => {
			const before = Date.now();
			ctx.handlePersonClick(mockPersonnel[0]);
			const after = Date.now();
			expect(ctx.selectedPerson).toBe(mockPersonnel[0]);
			expect(ctx.selectedDate).toBeInstanceOf(Date);
			expect(ctx.selectedDate!.getTime()).toBeGreaterThanOrEqual(before);
			expect(ctx.selectedDate!.getTime()).toBeLessThanOrEqual(after);
		});

		it('does nothing when canEditCalendar is false', () => {
			const noEditCtx = new CalendarPageContext(
				{ ...mockData, permissions: { ...mockData.permissions, canEditCalendar: false } },
				makeMockOrg()
			);
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
			expect(ctx.showPersonnelRoles).toBe(true);

			ctx.toggleShowPersonnelRoles();

			expect(ctx.showPersonnelRoles).toBe(false);
			expect(queueUserPreferencesPatch).toHaveBeenCalledWith('org1', {
				calendar: {
					showPersonnelRoles: false
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

	// ---- bulk handlers removed (moved to bulk page) -----------------------

	describe('bulk handlers removed', () => {
		it('does not have handleBulkStatusApply method', () => {
			expect((ctx as unknown as Record<string, unknown>)['handleBulkStatusApply']).toBeUndefined();
		});

		it('does not have handleBulkStatusRemove method', () => {
			expect((ctx as unknown as Record<string, unknown>)['handleBulkStatusRemove']).toBeUndefined();
		});
	});

	// ---- overflow items removed (Phase 3.3 — replaced by SmartToolbar in 3.4)

	describe('calendarOverflowItems removed', () => {
		it('does not have calendarOverflowItems getter', () => {
			expect((ctx as unknown as Record<string, unknown>)['calendarOverflowItems']).toBeUndefined();
		});
	});

	// ---- duty roster handlers removed (moved to duty-roster page) ---------

	describe('duty roster handlers removed', () => {
		it('does not have handleApplyRoster method', () => {
			expect((ctx as unknown as Record<string, unknown>)['handleApplyRoster']).toBeUndefined();
		});

		it('does not have handleSaveRoster method', () => {
			expect((ctx as unknown as Record<string, unknown>)['handleSaveRoster']).toBeUndefined();
		});

		it('does not have handleDeleteRoster method', () => {
			expect((ctx as unknown as Record<string, unknown>)['handleDeleteRoster']).toBeUndefined();
		});

		it('does not have handleUpdateExemptions method', () => {
			expect((ctx as unknown as Record<string, unknown>)['handleUpdateExemptions']).toBeUndefined();
		});
	});

	// ---- export handlers removed (Phase 3.3) --------------------------------

	describe('export handlers removed', () => {
		it('does not have handleExportCSV method', () => {
			expect((ctx as unknown as Record<string, unknown>)['handleExportCSV']).toBeUndefined();
		});

		it('does not have handleExportPDF method', () => {
			expect((ctx as unknown as Record<string, unknown>)['handleExportPDF']).toBeUndefined();
		});
	});
});
