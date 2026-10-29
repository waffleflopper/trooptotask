import { describe, expect, it, vi } from 'vitest';
import type { ToolbarAction, ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
import { buildCalendarToolbar, type CalendarToolbarInput } from './calendarToolbarItems';

function makeInput(overrides: Partial<CalendarToolbarInput> = {}): CalendarToolbarInput {
	return {
		orgUrlSegment: '1-11-bde',
		canManageAvailability: false,
		canManageAssignments: false,
		canManageConfig: false,
		showEvents: true,
		taskingsNeedingAction: 0,
		groupOptions: [{ value: '', label: 'Group: All' }],
		groupFilter: '',
		showStatusText: false,
		showPersonnelRoles: false,
		showOnboardingToggle: false,
		showSubGroups: null,
		highlightOnboarding: true,
		onGroupFilterChange: vi.fn(),
		onToggleStatusText: vi.fn(),
		onTogglePersonnelRoles: vi.fn(),
		onToggleHighlightOnboarding: vi.fn(),
		onExportExcel: vi.fn(),
		onExportPDF: vi.fn(),
		...overrides
	};
}

function labels(items: readonly ToolbarItem[] | ToolbarAction['menuItems']): string[] {
	return (items ?? []).map((item) => item.label);
}

function display(items: readonly ToolbarItem[]) {
	const item = items.find((candidate) => candidate.label === 'Display');
	if (item?.kind !== 'action' || !item.menuItems) throw new Error('Display is a menu');
	return item.menuItems;
}

describe('buildCalendarToolbar', () => {
	it('offers Duty planner, Settings and Bulk Status only to people who can use them', () => {
		const viewer = buildCalendarToolbar(makeInput());
		const manager = buildCalendarToolbar(
			makeInput({ canManageAvailability: true, canManageAssignments: true, canManageConfig: true })
		);

		expect(labels(viewer.items)).not.toContain('Duty planner');
		expect(labels(viewer.items)).not.toContain('Settings');
		expect(viewer.primary).toBeUndefined();
		expect(labels(manager.items)).toContain('Duty planner');
		expect(labels(manager.items)).toContain('Settings');
		expect(manager.primary?.label).toBe('Bulk Status');
	});

	it('points Duty planner, Reports, Settings and Bulk Status at their Calendar routes', () => {
		const { items, primary } = buildCalendarToolbar(
			makeInput({ canManageAvailability: true, canManageAssignments: true, canManageConfig: true })
		);
		const hrefOf = (label: string) => items.find((item) => item.label === label);

		expect(hrefOf('Duty planner')).toMatchObject({ href: '/org/1-11-bde/calendar/assignments' });
		expect(hrefOf('Reports')).toMatchObject({ href: '/org/1-11-bde/calendar/reports' });
		expect(hrefOf('Settings')).toMatchObject({ href: '/org/1-11-bde/calendar/settings', menuOnly: true });
		expect(primary?.menuItems?.map((item) => (item.kind === 'action' ? item.href : null))).toEqual([
			'/org/1-11-bde/calendar/bulk?tab=add',
			'/org/1-11-bde/calendar/bulk?tab=remove',
			'/org/1-11-bde/calendar/import'
		]);
	});

	it('links Events & Taskings to the Taskings list only while the feature is on', () => {
		const eventsOf = (showEvents: boolean) =>
			buildCalendarToolbar(makeInput({ showEvents })).items.find((item) => item.id === 'calendar-events');

		expect(eventsOf(true)).toMatchObject({ href: '/org/1-11-bde/calendar/taskings' });
		expect(eventsOf(false)).toBeUndefined();
	});

	it('badges Events & Taskings with the Taskings that need action', () => {
		const badgeOf = (taskingsNeedingAction: number) => {
			const item = buildCalendarToolbar(makeInput({ taskingsNeedingAction })).items.find(
				(candidate) => candidate.id === 'calendar-events'
			);
			return item?.kind === 'action' ? item.badge?.count : undefined;
		};

		expect(badgeOf(3)).toBe(3);
		expect(badgeOf(0)).toBe(0);
	});

	it('lists Show Onboarding in Display only while someone is onboarding', () => {
		expect(labels(display(buildCalendarToolbar(makeInput()).items))).not.toContain('Show Onboarding');
		expect(labels(display(buildCalendarToolbar(makeInput({ showOnboardingToggle: true })).items))).toContain(
			'Show Onboarding'
		);
	});

	it('shows each display preference as pressed or not in the Display menu', () => {
		const options = display(
			buildCalendarToolbar(makeInput({ showStatusText: true, showOnboardingToggle: true, highlightOnboarding: false }))
				.items
		);

		expect(options.find((item) => item.label === 'Show Status Text')).toMatchObject({ pressed: true });
		expect(options.find((item) => item.label === 'Show Personnel Roles')).toMatchObject({ pressed: false });
		expect(options.find((item) => item.label === 'Show Onboarding')).toMatchObject({ pressed: false });
	});
});
