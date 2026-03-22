import { describe, it, expect, beforeEach } from 'vitest';
import { CalendarPageContext, type CalendarPageData } from './CalendarPageContext.svelte';
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
	isOwner: false,
	isAdmin: false,
	isFullEditor: false,
	permissions: {
		canViewCalendar: true,
		canEditCalendar: true
	}
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CalendarPageContext', () => {
	let ctx: CalendarPageContext;

	beforeEach(() => {
		ctx = new CalendarPageContext(mockData);
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
			const ownerCtx = new CalendarPageContext({ ...mockData, isOwner: true });
			expect(ownerCtx.canManageConfig).toBe(true);
		});

		it('canManageConfig is true for admin', () => {
			const adminCtx = new CalendarPageContext({ ...mockData, isAdmin: true });
			expect(adminCtx.canManageConfig).toBe(true);
		});

		it('canManageConfig is true for fullEditor', () => {
			const editorCtx = new CalendarPageContext({ ...mockData, isFullEditor: true });
			expect(editorCtx.canManageConfig).toBe(true);
		});
	});

	// ---- Modal visibility state --------------------------------------------

	describe('modal state (all start closed)', () => {
		it('showStatusManager starts false', () => expect(ctx.showStatusManager).toBe(false));
		it('showSpecialDayManager starts false', () => expect(ctx.showSpecialDayManager).toBe(false));
		it('showTodayBreakdown starts false', () => expect(ctx.showTodayBreakdown).toBe(false));
		it('showBulkStatusModal starts false', () => expect(ctx.showBulkStatusModal).toBe(false));
		it('showBulkStatusImportModal starts false', () => expect(ctx.showBulkStatusImportModal).toBe(false));
		it('showBulkRemoveModal starts false', () => expect(ctx.showBulkRemoveModal).toBe(false));
		it('showAssignmentPlanner starts false', () => expect(ctx.showAssignmentPlanner).toBe(false));
		it('showLongRangeView starts false', () => expect(ctx.showLongRangeView).toBe(false));
		it('showAssignmentTypeManager starts false', () => expect(ctx.showAssignmentTypeManager).toBe(false));
		it('showDutyRosterGenerator starts false', () => expect(ctx.showDutyRosterGenerator).toBe(false));
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
			const noEditCtx = new CalendarPageContext({
				...mockData,
				permissions: { ...mockData.permissions, canEditCalendar: false }
			});
			noEditCtx.handleCellClick(mockPersonnel[0], new Date());
			expect(noEditCtx.selectedPerson).toBeNull();
		});

		it('does nothing when person is outside scoped group', () => {
			const scopedCtx = new CalendarPageContext({
				...mockData,
				scopedGroupId: 'other-group',
				personnel: [] // p1 is NOT in scoped set
			});
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
			const noEditCtx = new CalendarPageContext({
				...mockData,
				permissions: { ...mockData.permissions, canEditCalendar: false }
			});
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
			const ctx2 = new CalendarPageContext({
				...mockData,
				allPersonnel: undefined
			});
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

	// ---- overflow items ---------------------------------------------------

	describe('calendarOverflowItems', () => {
		it("always includes Today's Breakdown and 3-Month View", () => {
			const labels = ctx.calendarOverflowItems.map((i) => i.label);
			expect(labels).toContain("Today's Breakdown");
			expect(labels).toContain('3-Month View');
		});

		it('does not include configure items when canManageConfig is false', () => {
			const labels = ctx.calendarOverflowItems.map((i) => i.label);
			expect(labels).not.toContain('Status Types');
			expect(labels).not.toContain('Assignment Types');
		});

		it('includes configure items when canManageConfig is true', () => {
			const ownerCtx = new CalendarPageContext({ ...mockData, isOwner: true });
			const labels = ownerCtx.calendarOverflowItems.map((i) => i.label);
			expect(labels).toContain('Status Types');
			expect(labels).toContain('Assignment Types');
			expect(labels).toContain('Holidays');
		});

		it('includes Status Reports link for owner', () => {
			const ownerCtx = new CalendarPageContext({ ...mockData, isOwner: true });
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
	});
});
