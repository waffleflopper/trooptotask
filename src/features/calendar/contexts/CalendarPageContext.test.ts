import { describe, it, expect, beforeEach } from 'vitest';
import { CalendarPageContext, type CalendarPageData } from './CalendarPageContext.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
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
	let modals: ModalRegistry;
	let org: OrgContext;

	beforeEach(() => {
		modals = new ModalRegistry();
		org = makeMockOrg();
		ctx = new CalendarPageContext(mockData, modals, org);
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
			const ownerCtx = new CalendarPageContext(mockData, new ModalRegistry(), makeMockOrg({ isOwner: true }));
			expect(ownerCtx.canManageConfig).toBe(true);
		});

		it('canManageConfig is true for admin', () => {
			const adminCtx = new CalendarPageContext(mockData, new ModalRegistry(), makeMockOrg({ isAdmin: true }));
			expect(adminCtx.canManageConfig).toBe(true);
		});

		it('canManageConfig is true for fullEditor', () => {
			const editorCtx = new CalendarPageContext(mockData, new ModalRegistry(), makeMockOrg({ isFullEditor: true }));
			expect(editorCtx.canManageConfig).toBe(true);
		});
	});

	// ---- Modal visibility state --------------------------------------------

	describe('modal state (all start closed)', () => {
		it('status-manager starts closed', () => expect(modals.isOpen('status-manager')).toBe(false));
		it('special-day-manager starts closed', () => expect(modals.isOpen('special-day-manager')).toBe(false));
		// today-breakdown modal removed — converted to inline panel (breakdownExpanded state)
		// bulk-status, bulk-status-import, bulk-remove modals removed — moved to /calendar/bulk page
		it('long-range-view starts closed', () => expect(modals.isOpen('long-range-view')).toBe(false));
		it('assignment-type-manager starts closed', () => expect(modals.isOpen('assignment-type-manager')).toBe(false));
		// duty-roster-generator modal removed — moved to /calendar/duty-roster page
	});

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
				new ModalRegistry(),
				makeMockOrg()
			);
			noEditCtx.handleCellClick(mockPersonnel[0], new Date());
			expect(noEditCtx.selectedPerson).toBeNull();
		});

		it('does nothing when person is outside scoped group', () => {
			const scopedCtx = new CalendarPageContext(
				{ ...mockData, scopedGroupId: 'other-group', personnel: [] }, // p1 is NOT in scoped set
				new ModalRegistry(),
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
				new ModalRegistry(),
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
			const ctx2 = new CalendarPageContext(
				{ ...mockData, allPersonnel: undefined },
				new ModalRegistry(),
				makeMockOrg()
			);
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

	// ---- overflow items ---------------------------------------------------

	describe('calendarOverflowItems', () => {
		it("always includes Today's Breakdown and 3-Month View", () => {
			const labels = ctx.calendarOverflowItems.map((i) => i.label);
			expect(labels).toContain("Today's Breakdown");
			expect(labels).toContain('3-Month View');
		});

		it("Today's Breakdown overflow item toggles the panel (not a modal)", () => {
			const item = ctx.calendarOverflowItems.find((i) => i.label === "Today's Breakdown");
			expect(item?.onclick).toBeDefined();
			expect(ctx.breakdownExpanded).toBe(true);
			item!.onclick!();
			expect(ctx.breakdownExpanded).toBe(false);
		});

		it('does not include configure items when canManageConfig is false', () => {
			const labels = ctx.calendarOverflowItems.map((i) => i.label);
			expect(labels).not.toContain('Status Types');
			expect(labels).not.toContain('Assignment Types');
		});

		it('does NOT include configure items in overflow (moved to settings page)', () => {
			const ownerCtx = new CalendarPageContext(mockData, new ModalRegistry(), makeMockOrg({ isOwner: true }));
			const labels = ownerCtx.calendarOverflowItems.map((i) => i.label);
			expect(labels).not.toContain('Status Types');
			expect(labels).not.toContain('Assignment Types');
			expect(labels).not.toContain('Holidays');
		});

		it('includes Status Reports link for owner', () => {
			const ownerCtx = new CalendarPageContext(mockData, new ModalRegistry(), makeMockOrg({ isOwner: true }));
			const labels = ownerCtx.calendarOverflowItems.map((i) => i.label);
			expect(labels).toContain('Status Reports');
		});

		it('does not include Status Reports for plain member', () => {
			const labels = ctx.calendarOverflowItems.map((i) => i.label);
			expect(labels).not.toContain('Status Reports');
		});

		it('always includes Export to Excel and Print / PDF', () => {
			const labels = ctx.calendarOverflowItems.map((i) => i.label);
			expect(labels).toContain('Export to Excel');
			expect(labels).toContain('Print / PDF');
		});

		it('includes Bulk Operations as a navigation link for owner', () => {
			const ownerCtx = new CalendarPageContext(mockData, new ModalRegistry(), makeMockOrg({ isOwner: true }));
			const bulkItem = ownerCtx.calendarOverflowItems.find((i) => i.label === 'Bulk Operations');
			expect(bulkItem).toBeDefined();
			expect(bulkItem!.href).toBe('/org/org1/calendar/bulk');
			expect(bulkItem!.onclick).toBeUndefined();
		});

		it('does not include Bulk Operations for plain member', () => {
			const labels = ctx.calendarOverflowItems.map((i) => i.label);
			expect(labels).not.toContain('Bulk Operations');
		});

		it('does not include old Bulk Status or Bulk Remove modal items', () => {
			const ownerCtx = new CalendarPageContext(mockData, new ModalRegistry(), makeMockOrg({ isOwner: true }));
			const labels = ownerCtx.calendarOverflowItems.map((i) => i.label);
			expect(labels).not.toContain('Bulk Status');
			expect(labels).not.toContain('Bulk Remove');
		});

		it('includes Duty Roster as a navigation link for owner', () => {
			const ownerCtx = new CalendarPageContext(mockData, new ModalRegistry(), makeMockOrg({ isOwner: true }));
			const dutyItem = ownerCtx.calendarOverflowItems.find((i) => i.label === 'Duty Roster');
			expect(dutyItem).toBeDefined();
			expect(dutyItem!.href).toBe('/org/org1/calendar/duty-roster');
			expect(dutyItem!.onclick).toBeUndefined();
		});

		it('does not include Duty Roster for plain member', () => {
			const labels = ctx.calendarOverflowItems.map((i) => i.label);
			expect(labels).not.toContain('Duty Roster');
		});

		it('does not include Assignments after moving the planner to its own page', () => {
			const ownerCtx = new CalendarPageContext(mockData, new ModalRegistry(), makeMockOrg({ isOwner: true }));
			const labels = ownerCtx.calendarOverflowItems.map((i) => i.label);
			expect(labels).not.toContain('Assignments');
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

	// ---- duty-roster-generator modal removed ------------------------------

	describe('duty-roster-generator modal removed', () => {
		it('does not reference duty-roster-generator modal in overflow items', () => {
			const ownerCtx = new CalendarPageContext(mockData, new ModalRegistry(), makeMockOrg({ isOwner: true }));
			const dutyItem = ownerCtx.calendarOverflowItems.find((i) => i.label === 'Duty Roster');
			// Should be a link, not a modal opener
			expect(dutyItem!.href).toBeDefined();
			expect(dutyItem!.onclick).toBeUndefined();
		});
	});
});
