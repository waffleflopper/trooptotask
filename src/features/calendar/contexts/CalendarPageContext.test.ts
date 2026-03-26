import { describe, it, expect, beforeEach } from 'vitest';
import { CalendarPageContext, type CalendarPageData } from './CalendarPageContext.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import type { Personnel } from '$lib/types';

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

	// ---- Modal registry removed (Phase 3.3 — modals inlined into CalendarPageView) ----

	// ---- breakdown panel state --------------------------------------------

	describe('breakdownExpanded / toggleBreakdown', () => {
		it('breakdownExpanded starts true before responsive init runs', () => {
			expect(ctx.breakdownExpanded).toBe(true);
		});

		it('initBreakdownPreference collapses the panel on mobile viewports', () => {
			ctx.initBreakdownPreference(() => ({ matches: true }));
			expect(ctx.breakdownExpanded).toBe(false);
		});

		it('initBreakdownPreference keeps the panel expanded on desktop viewports', () => {
			ctx.breakdownExpanded = false;
			ctx.initBreakdownPreference(() => ({ matches: false }));
			expect(ctx.breakdownExpanded).toBe(true);
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

	// ---- calendarPersonnel / scopedPersonnelIds ---------------------------

	describe('calendarPersonnel', () => {
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
