import { describe, it, expect } from 'vitest';
import { buildCalendarToolbarItems } from './calendarToolbarItems';

function makeInput(overrides: Partial<Parameters<typeof buildCalendarToolbarItems>[0]> = {}) {
	return {
		orgId: 'org1',
		canManageAvailability: false,
		canManageAssignments: false,
		canManageConfig: false,
		readOnly: false,
		showStatusText: false,
		showPersonnelRoles: true,
		showOnboardingToggle: false,
		highlightOnboarding: false,
		dutyStartDayOnly: false,
		onToggleStatusText: () => {},
		onTogglePersonnelRoles: () => {},
		onToggleHighlightOnboarding: () => {},
		onToggleDutyStartDayOnly: () => {},
		onExportCSV: () => {},
		onExportPDF: () => {},
		...overrides
	};
}

describe('buildCalendarToolbarItems', () => {
	it("does not include Today's Summary in calendar overflow", () => {
		const items = buildCalendarToolbarItems(makeInput());

		expect(items.find((i) => i.label === "Today's Summary")).toBeUndefined();
	});

	it('includes onboarding as an active-aware overflow option only when available', () => {
		const withoutOnboarding = buildCalendarToolbarItems(makeInput());
		expect(withoutOnboarding.find((i) => i.label === 'Show Onboarding')).toBeUndefined();

		const withOnboarding = buildCalendarToolbarItems(
			makeInput({ showOnboardingToggle: true, highlightOnboarding: true })
		);
		const onboardingItem = withOnboarding.find((i) => i.label === 'Show Onboarding');
		expect(onboardingItem).toBeDefined();
		expect(onboardingItem!.overflow).toBe('always');
		expect(onboardingItem!.toggle).toBe(true);
		expect(onboardingItem!.active).toBe(true);
	});

	it('includes Bulk Status dropdown for users with Calendar availability operation access', () => {
		const items = buildCalendarToolbarItems(makeInput({ canManageAvailability: true }));
		const bulk = items.find((i) => i.label === 'Bulk Status');
		expect(bulk).toBeDefined();
		expect(bulk!.icon).toBe('clipboard-list');
		expect(bulk!.displayMode).toBe('full');
		expect(bulk!.menuItems).toHaveLength(3);
		const labels = bulk!.menuItems!.map((i) => i.label);
		expect(labels).toEqual(['Add Bulk', 'Remove Bulk', 'Import CSV']);
		expect(bulk!.menuItems![0].href).toBe('/org/org1/calendar/bulk?tab=add');
	});

	it('does not include Bulk Status for plain members', () => {
		const items = buildCalendarToolbarItems(makeInput());
		expect(items.find((i) => i.label === 'Bulk Status')).toBeUndefined();
	});

	it('includes Planning dropdown with assignment planner for assignment operators', () => {
		const items = buildCalendarToolbarItems(makeInput({ canManageAssignments: true }));
		const planning = items.find((i) => i.label === 'Planning');
		expect(planning).toBeDefined();
		expect(planning!.icon).toBe('calendar-days');
		expect(planning!.displayMode).toBe('full');
		const labels = planning!.menuItems!.map((i) => i.label);
		expect(labels).toEqual(['Assignment Planner']);
	});

	it('keeps Duty Rosters planning behind Calendar configuration access while that workflow is still advanced-only', () => {
		const items = buildCalendarToolbarItems(makeInput({ canManageAssignments: true, canManageConfig: true }));
		const planning = items.find((i) => i.label === 'Planning');
		const labels = planning!.menuItems!.map((i) => i.label);
		expect(labels).toEqual(['Duty Rosters (alpha)', 'Assignment Planner']);
		expect(planning!.menuItems![0].href).toBe('/org/org1/duty-rosters');
	});

	it('includes settings as the first low-priority action to compact for admins', () => {
		const items = buildCalendarToolbarItems(makeInput({ canManageConfig: true }));
		const settings = items.find((i) => i.label === 'Settings');
		expect(settings).toBeDefined();
		expect(settings!.icon).toBe('settings');
		expect(settings!.displayMode).toBeUndefined();
		expect(settings!.priority).toBe('low');
		expect(settings!.variant).toBe('secondary');
		expect(settings!.href).toBe('/org/org1/calendar/settings');
	});

	it('does not include Planning or Settings for plain members', () => {
		const items = buildCalendarToolbarItems(makeInput());
		expect(items.find((i) => i.label === 'Planning')).toBeUndefined();
		expect(items.find((i) => i.label === 'Settings')).toBeUndefined();
	});

	it('always includes Export to Excel, Print/PDF, and an active-aware Show Status Text toggle in overflow', () => {
		const items = buildCalendarToolbarItems(makeInput({ showStatusText: true }));
		const overflowItems = items.filter((i) => i.priority === 'low');
		const overflowLabels = overflowItems.map((i) => i.label);
		expect(overflowLabels).toContain('Export to Excel');
		expect(overflowLabels).toContain('Print / PDF');
		expect(overflowLabels).toContain('Show Status Text');
		expect(overflowItems.find((i) => i.label === 'Show Status Text')?.active).toBe(true);
		expect(overflowItems.find((i) => i.label === 'Show Status Text')?.toggle).toBe(true);
	});

	it('always includes an active-aware Show Personnel Roles toggle in overflow', () => {
		const items = buildCalendarToolbarItems(makeInput({ showPersonnelRoles: false }));
		const overflowItems = items.filter((i) => i.priority === 'low');
		expect(overflowItems.find((i) => i.label === 'Show Personnel Roles')?.active).toBe(false);
		expect(overflowItems.find((i) => i.label === 'Show Personnel Roles')?.toggle).toBe(true);
	});

	it('keeps edit-requiring groups visible but disabled when readOnly', () => {
		const items = buildCalendarToolbarItems(
			makeInput({ canManageAvailability: true, canManageAssignments: true, readOnly: true })
		);
		const bulk = items.find((i) => i.label === 'Bulk Status');
		const planning = items.find((i) => i.label === 'Planning');
		expect(bulk?.disabled).toBe(true);
		expect(planning?.disabled).toBe(true);
		expect(bulk?.disabledReason).toBe('Read-only mode');
		expect(planning?.disabledReason).toBe('Read-only mode');
		expect(bulk?.menuItems?.every((item) => item.disabled)).toBe(true);
		expect(planning?.menuItems?.every((item) => item.disabled)).toBe(true);
		expect(bulk?.menuItems?.every((item) => item.disabledReason === 'Read-only mode')).toBe(true);
		expect(planning?.menuItems?.every((item) => item.disabledReason === 'Read-only mode')).toBe(true);
	});
});
