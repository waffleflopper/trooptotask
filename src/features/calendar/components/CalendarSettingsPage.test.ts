// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import CalendarSettingsPage from './CalendarSettingsPage.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { AssignmentType, SpecialDay, StatusType } from '$lib/types';

const { orgContextMock, statusTypesStoreMock, availabilityStoreMock, assignmentTypesStoreMock, specialDaysStoreMock } =
	vi.hoisted(() => ({
		orgContextMock: {
			orgId: 'org-1',
			isPrivileged: true,
			affordanceForFeatureAction: vi.fn(() => ({ allowed: true, visible: true, disabled: false }))
		},
		statusTypesStoreMock: {
			items: [] as StatusType[],
			add: vi.fn(),
			update: vi.fn(),
			remove: vi.fn()
		},
		availabilityStoreMock: {
			removeByStatusTypeLocal: vi.fn()
		},
		assignmentTypesStoreMock: {
			types: [] as AssignmentType[],
			addType: vi.fn(),
			updateType: vi.fn(),
			removeType: vi.fn()
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
	availabilityStore: availabilityStoreMock
}));

vi.mock('$features/calendar/stores/specialDays.svelte', () => ({
	specialDaysStore: specialDaysStoreMock
}));

vi.mock('$features/calendar/stores/dailyAssignments.svelte', () => ({
	dailyAssignmentsStore: assignmentTypesStoreMock
}));

describe('CalendarSettingsPage', () => {
	beforeEach(() => {
		cleanup();
		orgContextMock.isPrivileged = true;
		orgContextMock.affordanceForFeatureAction.mockReturnValue({ allowed: true, visible: true, disabled: false });
		statusTypesStoreMock.items = [];
		statusTypesStoreMock.add.mockReset();
		statusTypesStoreMock.update.mockReset();
		statusTypesStoreMock.remove.mockReset();
		statusTypesStoreMock.add.mockResolvedValue({
			id: 'created-status',
			name: 'Created status',
			color: '#4a4a47',
			textColor: '#f8f7f4',
			da6TreatmentReviewed: true
		});
		statusTypesStoreMock.update.mockResolvedValue(true);
		statusTypesStoreMock.remove.mockResolvedValue(true);
		availabilityStoreMock.removeByStatusTypeLocal.mockReset();
		assignmentTypesStoreMock.types = [];
		assignmentTypesStoreMock.addType.mockReset();
		assignmentTypesStoreMock.updateType.mockReset();
		assignmentTypesStoreMock.removeType.mockReset();
		assignmentTypesStoreMock.addType.mockResolvedValue({
			id: 'created-assignment',
			name: 'Created Assignment',
			shortName: 'CA',
			assignTo: 'personnel',
			color: '#2563eb',
			exemptPersonnelIds: [],
			showInDateHeader: false
		});
		assignmentTypesStoreMock.updateType.mockResolvedValue(true);
		assignmentTypesStoreMock.removeType.mockResolvedValue(true);
		specialDaysStoreMock.items = [];
		specialDaysStoreMock.add.mockReset();
		specialDaysStoreMock.update.mockReset();
		specialDaysStoreMock.remove.mockReset();
		specialDaysStoreMock.resetFederalHolidays.mockReset();
		specialDaysStoreMock.add.mockResolvedValue({
			id: 'created-closure',
			date: '2026-01-15',
			name: 'Created Closure',
			type: 'org-closure'
		});
		specialDaysStoreMock.update.mockResolvedValue(true);
		specialDaysStoreMock.remove.mockResolvedValue(true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('preserves the restricted settings state for non-managers', () => {
		orgContextMock.isPrivileged = false;
		orgContextMock.affordanceForFeatureAction.mockReturnValue({ allowed: false, visible: false, disabled: false });

		render(CalendarSettingsPage);

		expect(screen.getByText('Access restricted.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'View calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
	});

	it('allows Calendar configure capability', () => {
		orgContextMock.isPrivileged = false;
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

	it('blocks accidental close affordances once an add-status form is dirty but keeps Cancel explicit', async () => {
		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));

		const dialog = screen.getByRole('dialog', { name: 'Add Status Type' });
		expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy();

		await fireEvent.input(within(dialog).getByLabelText('Status name'), { target: { value: 'Detail' } });

		expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

		expect(screen.queryByRole('dialog', { name: 'Add Status Type' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		const reopenedName = within(screen.getByRole('dialog', { name: 'Add Status Type' })).getByLabelText(
			'Status name'
		) as HTMLInputElement;
		expect(reopenedName.value).toBe('');
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

	it('keeps the add-status dialog open when creation fails', async () => {
		statusTypesStoreMock.add.mockResolvedValueOnce(null);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		const dialog = screen.getByRole('dialog', { name: 'Add Status Type' });
		await fireEvent.input(within(dialog).getByLabelText('Status name'), { target: { value: 'Detail' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add Status Type' }));

		expect(screen.getByRole('dialog', { name: 'Add Status Type' })).toBeTruthy();
		expect(errorToast).toHaveBeenCalledWith('Failed to add status type');
	});

	it('keeps the edit-status dialog open when save fails', async () => {
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				da6AvailabilityTreatment: null,
				da6TreatmentReviewed: true
			}
		];
		statusTypesStoreMock.update.mockResolvedValueOnce(false);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit status type' }));
		const dialog = screen.getByRole('dialog', { name: 'Edit Status Type' });
		await fireEvent.input(within(dialog).getByLabelText('Status name'), { target: { value: 'Leave Updated' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

		expect(screen.getByRole('dialog', { name: 'Edit Status Type' })).toBeTruthy();
		expect(errorToast).toHaveBeenCalledWith('Failed to save status type');
	});

	it('keeps delete confirmation open and local availability intact when deletion fails', async () => {
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				da6AvailabilityTreatment: null,
				da6TreatmentReviewed: true
			}
		];
		statusTypesStoreMock.remove.mockResolvedValueOnce(false);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete status type' }));
		const dialog = screen.getByRole('alertdialog', { name: 'Delete Status Type' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

		expect(screen.getByRole('alertdialog', { name: 'Delete Status Type' })).toBeTruthy();
		expect(availabilityStoreMock.removeByStatusTypeLocal).not.toHaveBeenCalled();
		expect(errorToast).toHaveBeenCalledWith('Failed to delete status type');
	});

	it('keeps the add-assignment dialog open when creation fails', async () => {
		assignmentTypesStoreMock.addType.mockResolvedValueOnce(null);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: /Assignment Types/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		const dialog = screen.getByRole('dialog', { name: 'Add Assignment Type' });
		await fireEvent.input(within(dialog).getByLabelText('Full name'), { target: { value: 'Staff Duty' } });
		await fireEvent.input(within(dialog).getByLabelText('Short code'), { target: { value: 'SD' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add Assignment Type' }));

		expect(screen.getByRole('dialog', { name: 'Add Assignment Type' })).toBeTruthy();
		expect(errorToast).toHaveBeenCalledWith('Failed to add assignment type');
	});

	it('keeps the edit-assignment dialog open when save fails', async () => {
		assignmentTypesStoreMock.types = [
			{
				id: 'cq',
				name: 'Charge of Quarters',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#2563eb',
				exemptPersonnelIds: [],
				showInDateHeader: false
			}
		];
		assignmentTypesStoreMock.updateType.mockResolvedValueOnce(false);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: /Assignment Types/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Edit assignment type' }));
		const dialog = screen.getByRole('dialog', { name: 'Edit Assignment Type' });
		await fireEvent.input(within(dialog).getByLabelText('Full name'), { target: { value: 'Staff Duty' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

		expect(screen.getByRole('dialog', { name: 'Edit Assignment Type' })).toBeTruthy();
		expect(errorToast).toHaveBeenCalledWith('Failed to save assignment type');
	});

	it('keeps delete assignment confirmation open when deletion fails', async () => {
		assignmentTypesStoreMock.types = [
			{
				id: 'cq',
				name: 'Charge of Quarters',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#2563eb',
				exemptPersonnelIds: [],
				showInDateHeader: false
			}
		];
		assignmentTypesStoreMock.removeType.mockResolvedValueOnce(false);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: /Assignment Types/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete assignment type' }));
		const dialog = screen.getByRole('alertdialog', { name: 'Delete Assignment Type' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

		expect(screen.getByRole('alertdialog', { name: 'Delete Assignment Type' })).toBeTruthy();
		expect(errorToast).toHaveBeenCalledWith('Failed to delete assignment type');
	});

	it('reports assignment header selection failures', async () => {
		assignmentTypesStoreMock.types = [
			{
				id: 'cq',
				name: 'Charge of Quarters',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#2563eb',
				exemptPersonnelIds: [],
				showInDateHeader: true
			},
			{
				id: 'sd',
				name: 'Staff Duty',
				shortName: 'SD',
				assignTo: 'personnel',
				color: '#047857',
				exemptPersonnelIds: [],
				showInDateHeader: false
			}
		];
		assignmentTypesStoreMock.updateType.mockResolvedValueOnce(false);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: /Assignment Types/i }));
		await fireEvent.click(screen.getByRole('radio', { name: 'Show Staff Duty in date header' }));

		expect(assignmentTypesStoreMock.updateType).toHaveBeenCalledWith('cq', { showInDateHeader: false });
		expect(errorToast).toHaveBeenCalledWith('Failed to update header assignment type');
	});

	it('hides archived assignment types from Calendar settings management', async () => {
		assignmentTypesStoreMock.types = [
			{
				id: 'active-type',
				name: 'Charge of Quarters',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#2563eb',
				exemptPersonnelIds: [],
				showInDateHeader: true
			},
			{
				id: 'archived-type',
				name: 'Archived Duty',
				shortName: 'OLD',
				assignTo: 'personnel',
				color: '#6b7280',
				exemptPersonnelIds: [],
				showInDateHeader: false,
				archivedAt: '2026-05-18T20:00:00.000Z'
			}
		];

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: /Assignment Types/i }));

		expect(screen.getAllByText('Charge of Quarters').length).toBeGreaterThan(0);
		expect(screen.queryByText('Archived Duty')).toBeNull();
		expect(screen.getByText(/Currently showing:/)).toBeTruthy();
		const settingsNav = screen.getByRole('navigation', { name: 'Calendar settings controls' });
		expect(within(settingsNav).getByRole('button', { name: /Assignment Types/ }).textContent).toContain('1');
	});

	it('keeps the add-closure dialog open when creation fails', async () => {
		specialDaysStoreMock.add.mockResolvedValueOnce(null);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: /Closures/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		const dialog = screen.getByRole('dialog', { name: 'Add Closure' });
		await fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Training holiday' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add Closure' }));

		expect(screen.getByRole('dialog', { name: 'Add Closure' })).toBeTruthy();
		expect(errorToast).toHaveBeenCalledWith('Failed to add closure');
	});

	it('keeps the edit-closure dialog open when save fails', async () => {
		specialDaysStoreMock.items = [
			{
				id: 'closure-1',
				date: `${new Date().getFullYear()}-01-15`,
				name: 'Training Day',
				type: 'org-closure'
			}
		];
		specialDaysStoreMock.update.mockResolvedValueOnce(false);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: /Closures/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Edit closure' }));
		const dialog = screen.getByRole('dialog', { name: 'Edit Closure' });
		await fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Updated Training Day' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

		expect(screen.getByRole('dialog', { name: 'Edit Closure' })).toBeTruthy();
		expect(errorToast).toHaveBeenCalledWith('Failed to save closure');
	});

	it('keeps delete closure confirmation open when deletion fails', async () => {
		specialDaysStoreMock.items = [
			{
				id: 'closure-1',
				date: `${new Date().getFullYear()}-01-15`,
				name: 'Training Day',
				type: 'org-closure'
			}
		];
		specialDaysStoreMock.remove.mockResolvedValueOnce(false);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage);

		await fireEvent.click(screen.getByRole('button', { name: /Closures/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete closure' }));
		const dialog = screen.getByRole('alertdialog', { name: 'Remove Special Day' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

		expect(screen.getByRole('alertdialog', { name: 'Remove Special Day' })).toBeTruthy();
		expect(errorToast).toHaveBeenCalledWith('Failed to delete closure');
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
