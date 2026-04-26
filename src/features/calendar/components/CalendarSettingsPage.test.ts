// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import CalendarSettingsPage from './CalendarSettingsPage.svelte';

const { orgContextMock } = vi.hoisted(() => ({
	orgContextMock: {
		orgId: 'org-1',
		isPrivileged: true,
		isFullEditor: true,
		readOnly: false
	}
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => orgContextMock
}));

vi.mock('$features/calendar/stores/statusTypes.svelte', () => ({
	statusTypesStore: {
		items: [],
		add: vi.fn(),
		update: vi.fn(),
		remove: vi.fn()
	}
}));

vi.mock('$features/calendar/stores/availability.svelte', () => ({
	availabilityStore: { removeByStatusTypeLocal: vi.fn() }
}));

vi.mock('$features/calendar/stores/specialDays.svelte', () => ({
	specialDaysStore: {
		items: [],
		add: vi.fn(),
		update: vi.fn(),
		remove: vi.fn(),
		resetFederalHolidays: vi.fn()
	}
}));

vi.mock('$features/calendar/stores/dailyAssignments.svelte', () => ({
	dailyAssignmentsStore: {
		types: [],
		addType: vi.fn(),
		updateType: vi.fn(),
		removeType: vi.fn()
	}
}));

describe('CalendarSettingsPage', () => {
	beforeEach(() => {
		cleanup();
		orgContextMock.isPrivileged = true;
		orgContextMock.isFullEditor = true;
	});

	it('uses shared toolbar navigation for settings sections and related calendar link', () => {
		render(CalendarSettingsPage);

		const toolbar = screen.getByRole('toolbar', { name: 'Calendar settings controls' });
		const settingsNav = screen.getByRole('navigation', { name: 'Calendar settings sections' });
		const relatedNav = screen.getByRole('navigation', { name: 'Related calendar pages' });

		expect(toolbar.contains(settingsNav)).toBe(true);
		expect(toolbar.contains(relatedNav)).toBe(true);
		expect(screen.getByRole('link', { name: 'Status Types' }).getAttribute('href')).toBe('#status-types');
		expect(screen.getByRole('link', { name: 'Assignment Types' }).getAttribute('href')).toBe('#assignment-types');
		expect(screen.getByRole('link', { name: 'Closures' }).getAttribute('href')).toBe('#special-days');
		expect(screen.getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
	});

	it('preserves the restricted settings state for non-managers', () => {
		orgContextMock.isPrivileged = false;
		orgContextMock.isFullEditor = false;

		render(CalendarSettingsPage);

		expect(screen.getByText('Access restricted.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'View calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
	});
});
