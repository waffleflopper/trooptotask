// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import CalendarSettingsPage from './CalendarSettingsPage.svelte';
import type { SpecialDay, StatusType } from '$lib/types';

const { orgContextMock, statusTypesStoreMock, specialDaysStoreMock } = vi.hoisted(() => ({
	orgContextMock: {
		orgId: 'org-1',
		isPrivileged: true,
		isFullEditor: true,
		readOnly: false,
		affordanceForFeatureAction: vi.fn(() => ({ allowed: true, visible: true, disabled: false }))
	},
	statusTypesStoreMock: {
		items: [] as StatusType[],
		add: vi.fn(),
		update: vi.fn(),
		remove: vi.fn()
	},
	specialDaysStoreMock: {
		items: [] as SpecialDay[],
		add: vi.fn(),
		update: vi.fn(),
		remove: vi.fn(),
		resetFederalHolidays: vi.fn()
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
	specialDaysStore: specialDaysStoreMock
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
		orgContextMock.affordanceForFeatureAction.mockReturnValue({ allowed: true, visible: true, disabled: false });
		statusTypesStoreMock.items = [];
		statusTypesStoreMock.add.mockReset();
		statusTypesStoreMock.update.mockReset();
		statusTypesStoreMock.remove.mockReset();
		specialDaysStoreMock.items = [];
		specialDaysStoreMock.add.mockReset();
		specialDaysStoreMock.update.mockReset();
		specialDaysStoreMock.remove.mockReset();
		specialDaysStoreMock.resetFederalHolidays.mockReset();
	});

	it('preserves the restricted settings state for non-managers', () => {
		orgContextMock.isPrivileged = false;
		orgContextMock.isFullEditor = false;
		orgContextMock.affordanceForFeatureAction.mockReturnValue({ allowed: false, visible: false, disabled: false });

		render(CalendarSettingsPage);

		expect(screen.getByText('Access restricted.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'View calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
	});

	it('allows Calendar configure capability without full-editor compatibility', () => {
		orgContextMock.isPrivileged = false;
		orgContextMock.isFullEditor = false;
		orgContextMock.affordanceForFeatureAction.mockReturnValue({ allowed: true, visible: true, disabled: false });

		render(CalendarSettingsPage);

		expect(screen.getByRole('navigation', { name: 'Calendar settings controls' })).toBeTruthy();
		expect(screen.queryByText('Access restricted.')).toBeNull();
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

		expect(screen.getByText('Authorized absence (unavailable, nonchargeable)')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));

		const dialog = screen.getByRole('dialog');
		const nameInput = within(dialog).getByLabelText('Status name');
		await fireEvent.input(nameInput, { target: { value: 'Detail' } });

		const treatmentSelect = within(dialog).getByLabelText('Duty roster treatment');
		(treatmentSelect as HTMLSelectElement).value = 'other-duty';
		await fireEvent.change(treatmentSelect);

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add Status Type' }));

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

	it('keeps the closures year visible after changing the filter', async () => {
		specialDaysStoreMock.items = [
			{
				id: 'new-year-2026',
				date: '2026-01-01',
				name: "New Year's Day",
				type: 'federal-holiday'
			}
		];

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: /Closures/i }));

		const yearSelect = screen.getByLabelText('Year') as HTMLSelectElement;
		expect(yearSelect.value).toBe(String(new Date().getFullYear()));

		yearSelect.value = '2026';
		await fireEvent.change(yearSelect);

		expect(yearSelect.value).toBe('2026');
		expect(screen.getByText("New Year's Day")).toBeTruthy();
	});
});
