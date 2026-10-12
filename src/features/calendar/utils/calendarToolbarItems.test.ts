import { describe, expect, it, vi } from 'vitest';
import { buildCalendarToolbar, type CalendarToolbarInput } from './calendarToolbarItems';

function makeInput(overrides: Partial<CalendarToolbarInput> = {}): CalendarToolbarInput {
	return {
		orgUrlSegment: '1-11-bde',
		canManageAvailability: false,
		canManageAssignments: false,
		canManageConfig: false,
		viewMode: 'month',
		groupOptions: [{ value: '', label: 'Group: All' }],
		groupFilter: '',
		showStatusText: false,
		showPersonnelRoles: false,
		showOnboardingToggle: false,
		highlightOnboarding: true,
		onViewModeChange: vi.fn(),
		onGroupFilterChange: vi.fn(),
		onToggleStatusText: vi.fn(),
		onTogglePersonnelRoles: vi.fn(),
		onToggleHighlightOnboarding: vi.fn(),
		onExportExcel: vi.fn(),
		onExportPDF: vi.fn(),
		...overrides
	};
}

describe('buildCalendarToolbar', () => {
	it('ranks a calendar admin toolbar with Bulk Status as the primary', () => {
		const { items, primary } = buildCalendarToolbar(
			makeInput({
				canManageAvailability: true,
				canManageAssignments: true,
				canManageConfig: true,
				showOnboardingToggle: true
			})
		);

		expect(items.map((item) => item.id)).toEqual([
			'calendar-view',
			'group',
			'show-onboarding',
			'show-status-text',
			'show-personnel-roles',
			'planning',
			'calendar-reports',
			'calendar-settings',
			'export-excel',
			'print-pdf'
		]);
		expect(primary?.label).toBe('Bulk Status');
		expect(primary?.menuItems?.map((item) => item.href)).toEqual([
			'/org/1-11-bde/calendar/bulk?tab=add',
			'/org/1-11-bde/calendar/bulk?tab=remove',
			'/org/1-11-bde/calendar/bulk?tab=import'
		]);
	});

	it('gives a plain viewer Reports, the exports and display toggles, and no primary', () => {
		const { items, primary } = buildCalendarToolbar(makeInput());

		expect(items.map((item) => item.id)).toEqual([
			'calendar-view',
			'group',
			'show-status-text',
			'show-personnel-roles',
			'calendar-reports',
			'export-excel',
			'print-pdf'
		]);
		expect(primary).toBeUndefined();
	});

	it('keeps exports and display toggles menu-only, with Show Onboarding on by default', () => {
		const { items } = buildCalendarToolbar(makeInput({ showOnboardingToggle: true }));
		const menuOnly = items.filter((item) => 'menuOnly' in item && item.menuOnly).map((item) => item.id);

		expect(menuOnly).toEqual([
			'show-onboarding',
			'show-status-text',
			'show-personnel-roles',
			'export-excel',
			'print-pdf'
		]);
		expect(items.find((item) => item.id === 'show-onboarding')).toMatchObject({ pressed: true, defaultPressed: true });
	});

	it('switches the view only to a known calendar view', () => {
		const onViewModeChange = vi.fn();
		const view = buildCalendarToolbar(makeInput({ onViewModeChange })).items[0];
		if (view.kind !== 'view') throw new Error('the first item is the calendar view');

		view.onValueChange('3-month');
		view.onValueChange('year');
		expect(onViewModeChange.mock.calls).toEqual([['3-month']]);
	});
});
