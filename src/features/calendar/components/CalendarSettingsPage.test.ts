// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import CalendarSettingsPage from './CalendarSettingsPage.svelte';
import type { StatusType } from '$lib/types';

const { orgContextMock, statusTypesStoreMock } = vi.hoisted(() => ({
	orgContextMock: {
		orgId: 'org-1',
		isPrivileged: true,
		isFullEditor: true,
		readOnly: false
	},
	statusTypesStoreMock: {
		items: [] as StatusType[],
		add: vi.fn(),
		update: vi.fn(),
		remove: vi.fn()
	}
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => orgContextMock
}));

vi.mock('$features/calendar/stores/statusTypes.svelte', () => ({
	statusTypesStore: statusTypesStoreMock
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
		orgContextMock.readOnly = false;
		statusTypesStoreMock.items = [];
		statusTypesStoreMock.add.mockReset();
		statusTypesStoreMock.update.mockReset();
		statusTypesStoreMock.remove.mockReset();
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

	it('surfaces DA6 duty roster treatment controls for status types', async () => {
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				da6AvailabilityTreatment: 'authorized-absence',
				da6TreatmentReviewed: true
			}
		];

		render(CalendarSettingsPage);

		expect(screen.getAllByText('Authorized absence (unavailable, nonchargeable)').length).toBeGreaterThanOrEqual(2);
		expect(screen.getByRole('button', { name: 'Duty roster treatment help' })).toBeTruthy();

		const newTreatment = screen.getByLabelText('Duty roster treatment');
		(newTreatment as HTMLSelectElement).value = 'other-duty';
		await fireEvent.change(newTreatment);
		await fireEvent.input(screen.getByPlaceholderText('Status name (e.g., Leave, TDY)'), {
			target: { value: 'Detail' }
		});
		const addButton = screen
			.getAllByRole('button', { name: '+ Add' })
			.find((button) => !button.hasAttribute('disabled'));
		expect(addButton).toBeTruthy();
		await fireEvent.click(addButton!);

		expect(statusTypesStoreMock.add).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'Detail',
				da6AvailabilityTreatment: 'other-duty'
			})
		);
	});

	it('guides admins to review existing status types without a DA6 treatment', () => {
		statusTypesStoreMock.items = [
			{
				id: 'annual-leave',
				name: 'Annual Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				da6AvailabilityTreatment: null,
				da6TreatmentReviewed: false
			},
			{
				id: 'detail',
				name: 'Detail',
				color: '#c47f00',
				textColor: '#0e0e0d',
				da6AvailabilityTreatment: null,
				da6TreatmentReviewed: false
			},
			{
				id: 'tdy',
				name: 'TDY',
				color: '#2f5d75',
				textColor: '#ffffff',
				da6AvailabilityTreatment: 'other-duty',
				da6TreatmentReviewed: true
			},
			{
				id: 'appointment',
				name: 'Appointment',
				color: '#ed8936',
				textColor: '#ffffff',
				da6AvailabilityTreatment: null,
				da6TreatmentReviewed: true
			}
		];

		render(CalendarSettingsPage);

		const review = screen.getByRole('region', { name: 'DA6 treatment review' });
		expect(within(review).getByText('Confirm statuses with no DA6 effect')).toBeTruthy();
		expect(
			within(review).getByText(
				'These status types are excluded from DA Form 6 rosters unless you edit them and assign a duty roster treatment.'
			)
		).toBeTruthy();
		expect(within(review).getByText('2 need review')).toBeTruthy();
		expect(within(review).getByText('Annual Leave')).toBeTruthy();
		expect(within(review).getByText('Detail')).toBeTruthy();
		expect(within(review).queryByText('TDY')).toBeNull();
		expect(within(review).queryByText('Appointment')).toBeNull();
		expect(statusTypesStoreMock.update).not.toHaveBeenCalled();
	});

	it('lets admins mark no-effect DA6 status types as reviewed without assigning a treatment', async () => {
		statusTypesStoreMock.items = [
			{
				id: 'appointment',
				name: 'Appointment',
				color: '#ed8936',
				textColor: '#ffffff',
				da6AvailabilityTreatment: null,
				da6TreatmentReviewed: false
			}
		];

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: 'Confirm Appointment has no DA6 effect' }));

		expect(statusTypesStoreMock.update).toHaveBeenCalledWith('appointment', {
			da6AvailabilityTreatment: null,
			da6TreatmentReviewed: true
		});
	});
});
