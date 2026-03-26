import { describe, it, expect } from 'vitest';
import { buildCalendarToolbarItems } from './calendarToolbarItems';

function makeInput(overrides: Partial<Parameters<typeof buildCalendarToolbarItems>[0]> = {}) {
	return {
		orgId: 'org1',
		canEditCalendar: false,
		canManageConfig: false,
		readOnly: false,
		breakdownExpanded: false,
		showStatusText: false,
		onToggleBreakdown: () => {},
		onToggleStatusText: () => {},
		onExportCSV: () => {},
		onExportPDF: () => {},
		...overrides
	};
}

describe('buildCalendarToolbarItems', () => {
	it("always includes an active-aware Today's Summary button", () => {
		const items = buildCalendarToolbarItems(makeInput({ breakdownExpanded: true }));
		const summaryItem = items.find((i) => i.label === "Today's Summary");
		expect(summaryItem).toBeDefined();
		expect(summaryItem!.type).toBe('button');
		expect(summaryItem!.active).toBe(true);
	});

	it('includes Bulk Status dropdown for users with edit + manage permissions', () => {
		const items = buildCalendarToolbarItems(makeInput({ canEditCalendar: true, canManageConfig: true }));
		const bulk = items.find((i) => i.label === 'Bulk Status');
		expect(bulk).toBeDefined();
		expect(bulk!.type).toBe('dropdown');
		expect(bulk!.items).toHaveLength(3);
		const labels = bulk!.items!.map((i) => i.label);
		expect(labels).toEqual(['Add Bulk', 'Remove Bulk', 'Import CSV']);
		expect(bulk!.items![0].href).toBe('/org/org1/calendar/bulk?tab=add');
	});

	it('does not include Bulk Status for plain members', () => {
		const items = buildCalendarToolbarItems(makeInput());
		expect(items.find((i) => i.label === 'Bulk Status')).toBeUndefined();
	});

	it('includes Planning dropdown with duty roster and assignment planner links for admins', () => {
		const items = buildCalendarToolbarItems(makeInput({ canEditCalendar: true, canManageConfig: true }));
		const planning = items.find((i) => i.label === 'Planning');
		expect(planning).toBeDefined();
		expect(planning!.type).toBe('dropdown');
		const labels = planning!.items!.map((i) => i.label);
		expect(labels).toEqual(['Duty Roster', 'Assignment Planner']);
	});

	it('includes settings icon-button with href for admins', () => {
		const items = buildCalendarToolbarItems(makeInput({ canManageConfig: true }));
		const settings = items.find((i) => i.label === 'Calendar Settings');
		expect(settings).toBeDefined();
		expect(settings!.type).toBe('icon-button');
		expect(settings!.href).toBe('/org/org1/calendar/settings');
	});

	it('does not include Planning or Settings for plain members', () => {
		const items = buildCalendarToolbarItems(makeInput());
		expect(items.find((i) => i.label === 'Planning')).toBeUndefined();
		expect(items.find((i) => i.label === 'Calendar Settings')).toBeUndefined();
	});

	it('always includes Export to Excel, Print/PDF, and an active-aware Show Status Text toggle in overflow', () => {
		const items = buildCalendarToolbarItems(makeInput({ showStatusText: true }));
		const overflowItems = items.filter((i) => i.type === 'overflow');
		const overflowLabels = overflowItems.map((i) => i.label);
		expect(overflowLabels).toContain('Export to Excel');
		expect(overflowLabels).toContain('Print / PDF');
		expect(overflowLabels).toContain('Show Status Text');
		expect(overflowItems.find((i) => i.label === 'Show Status Text')?.active).toBe(true);
	});

	it('keeps edit-requiring groups visible but disabled when readOnly', () => {
		const items = buildCalendarToolbarItems(
			makeInput({ canEditCalendar: true, canManageConfig: true, readOnly: true })
		);
		const bulk = items.find((i) => i.label === 'Bulk Status');
		const planning = items.find((i) => i.label === 'Planning');
		expect(bulk?.disabled).toBe(true);
		expect(planning?.disabled).toBe(true);
		expect(bulk?.items?.every((item) => item.disabled)).toBe(true);
		expect(planning?.items?.every((item) => item.disabled)).toBe(true);
	});
});
