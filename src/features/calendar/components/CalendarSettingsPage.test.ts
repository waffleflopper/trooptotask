// @vitest-environment happy-dom
import { createClientAccess, type ClientAccessFacts } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import CalendarSettingsPage from './CalendarSettingsPage.svelte';
import { stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import { toastStore } from '$lib/stores/toast.svelte';
import type { AssignmentType, SpecialDay, StatusType } from '$features/calendar/contracts';

const { statusTypesStoreMock, availabilityStoreMock, assignmentTypesStoreMock, specialDaysStoreMock, pageMock } =
	vi.hoisted(() => ({
		pageMock: { url: new URL('http://localhost/org/org-1/calendar/settings'), params: { orgId: 'org-1' } },
		statusTypesStoreMock: {
			items: [] as StatusType[],
			pendingOrder: null,
			orderBusy: false,
			add: vi.fn(),
			updateOrThrow: vi.fn(),
			remove: vi.fn(),
			previewEffect: vi.fn(),
			setOrder: vi.fn()
		},
		availabilityStoreMock: {
			removeByStatusTypeLocal: vi.fn()
		},
		assignmentTypesStoreMock: {
			types: [] as AssignmentType[],
			pendingLaneIds: null,
			typesBusy: false,
			typeWritesBusy: false,
			addType: vi.fn(),
			updateType: vi.fn(),
			removeType: vi.fn(),
			setCalendarLanes: vi.fn()
		},
		specialDaysStoreMock: {
			items: [] as SpecialDay[],
			addClosureDays: vi.fn(),
			update: vi.fn(),
			remove: vi.fn(),
			resetFederalHolidays: vi.fn()
		}
	}));

let accessFacts: ClientAccessFacts = { membershipRole: 'owner' };
const orgUrlSegment = 'org-1';
const access = createClientAccess(() => accessFacts);
const org = {
	get orgUrlSegment() {
		return orgUrlSegment;
	},
	get scopeSet() {
		return access.scopeSet;
	},
	affordanceForFeatureAction: access.affordanceForFeatureAction
};

vi.mock('$app/state', () => ({ page: pageMock }));

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

async function openRowAction(rowName: string, action: 'Edit' | 'Delete' | 'Remove') {
	const trigger = screen.getByRole('button', {
		name: (name) => name === `More actions for ${rowName}` || name.startsWith(`More actions for ${rowName}, `)
	});
	await fireEvent.keyDown(trigger, { key: 'Enter' });
	await fireEvent.click(await screen.findByRole('menuitem', { name: action }));
}

async function pickDay(composer: HTMLElement, picker: 'First day' | 'Last day', day: string) {
	await fireEvent.click(within(composer).getByRole('button', { name: picker }));
	await fireEvent.click(await screen.findByRole('button', { name: day }));
}

describe('CalendarSettingsPage', () => {
	beforeEach(() => {
		cleanup();
		pageMock.url = new URL('http://localhost/org/org-1/calendar/settings');
		accessFacts = { membershipRole: 'member', capabilityMap: createCapabilityMap('configure') };
		statusTypesStoreMock.items = [];
		statusTypesStoreMock.add.mockReset();
		statusTypesStoreMock.updateOrThrow.mockReset();
		statusTypesStoreMock.remove.mockReset();
		statusTypesStoreMock.previewEffect.mockReset();
		statusTypesStoreMock.previewEffect.mockResolvedValue([]);
		statusTypesStoreMock.setOrder.mockReset();
		statusTypesStoreMock.setOrder.mockResolvedValue({ status: 'saved' });
		statusTypesStoreMock.add.mockResolvedValue({
			id: 'created-status',
			name: 'Created status',
			color: '#4a4a47',
			textColor: '#f8f7f4'
		});
		statusTypesStoreMock.updateOrThrow.mockResolvedValue(true);
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
			poolRules: null,
			weekendMode: 'same',
			excusals: [],
			showOnCalendar: false,
			sortOrder: 0
		});
		assignmentTypesStoreMock.updateType.mockResolvedValue(true);
		assignmentTypesStoreMock.removeType.mockResolvedValue(true);
		specialDaysStoreMock.items = [];
		specialDaysStoreMock.addClosureDays.mockReset();
		specialDaysStoreMock.update.mockReset();
		specialDaysStoreMock.remove.mockReset();
		specialDaysStoreMock.resetFederalHolidays.mockReset();
		specialDaysStoreMock.update.mockResolvedValue(true);
		specialDaysStoreMock.remove.mockResolvedValue(true);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function onOctober14() {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 9, 14, 12));
	}

	it('preserves the restricted settings state for non-managers', () => {
		accessFacts = { membershipRole: 'member', capabilityMap: createCapabilityMap('view') };

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		expect(screen.getByText('Access restricted.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'View calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
		expect(screen.queryByRole('toolbar', { name: 'Calendar settings controls' })).toBeNull();
	});

	it('filters the section from the toolbar and keeps Add new pinned when Back to Calendar folds into More', async () => {
		const { layOut } = stubToolbarWidths();
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#2563eb',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'A',
				sortOrder: 0
			},
			{
				id: 'tdy',
				name: 'TDY',
				color: '#16a34a',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'A',
				sortOrder: 1
			}
		];
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await layOut(2000);

		const toolbar = screen.getByRole('toolbar', { name: 'Calendar settings controls' });
		await fireEvent.input(within(toolbar).getByRole('searchbox', { name: 'Filter Status Types' }), {
			target: { value: 'tdy' }
		});
		await waitFor(() => expect(screen.queryByText('Leave')).toBeNull());
		expect(screen.getAllByText('TDY').length).toBeGreaterThan(0);

		await layOut(1);
		expect(within(toolbar).queryByRole('link', { name: 'Back to Calendar' })).toBeNull();
		expect(within(toolbar).getByRole('button', { name: 'Add new' })).toBeTruthy();
		const more = within(toolbar).getByRole('button', { name: 'More Calendar settings controls' });
		more.focus();
		await fireEvent.keyDown(more, { key: 'Enter' });
		expect(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Back to Calendar' })).toBeTruthy();
		vi.unstubAllGlobals();
	});

	it('allows Calendar configure capability', () => {
		accessFacts = { membershipRole: 'member', capabilityMap: createCapabilityMap('configure') };

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		expect(screen.getByRole('tablist', { name: 'Calendar settings sections' })).toBeTruthy();
		expect(screen.queryByText('Access restricted.')).toBeNull();
	});

	it('creates a status with no stored one-day label and closes the composer', async () => {
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		const composer = screen.getByRole('form', { name: 'New status type' });
		await fireEvent.input(within(composer).getByLabelText('Name'), { target: { value: ' Quarters ' } });
		expect((within(composer).getByLabelText('One-day label') as HTMLInputElement).value).toBe('QUA');
		await fireEvent.click(within(composer).getByRole('button', { name: 'Add status type' }));
		expect(statusTypesStoreMock.add).toHaveBeenCalledWith({
			name: 'Quarters',
			color: '#4a5568',
			textColor: '#ffffff',
			rosterEffect: 'A',
			shortLabel: null
		});
		await waitFor(() => expect(screen.queryByRole('form', { name: 'New status type' })).toBeNull());
	});

	it('saves a typed one-day label in capitals with the chosen color and text', async () => {
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		const composer = screen.getByRole('form', { name: 'New status type' });
		await fireEvent.input(within(composer).getByLabelText('Name'), { target: { value: 'Quarters' } });
		await fireEvent.input(within(composer).getByLabelText('One-day label'), { target: { value: 'qtr' } });
		await fireEvent.click(within(composer).getByRole('radio', { name: 'Teal' }));
		await fireEvent.click(within(composer).getByRole('radio', { name: 'Dark' }));
		await fireEvent.click(within(composer).getByRole('button', { name: 'Add status type' }));
		expect(statusTypesStoreMock.add).toHaveBeenCalledWith({
			name: 'Quarters',
			color: '#319795',
			textColor: '#1c1b19',
			rosterEffect: 'A',
			shortLabel: 'QTR'
		});
	});

	it('keeps the composer open when creation fails', async () => {
		statusTypesStoreMock.add.mockResolvedValueOnce(null);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		const composer = screen.getByRole('form', { name: 'New status type' });
		await fireEvent.input(within(composer).getByLabelText('Name'), { target: { value: 'Detail' } });
		await fireEvent.click(within(composer).getByRole('button', { name: 'Add status type' }));

		await waitFor(() => expect(errorToast).toHaveBeenCalledOnce());
		const retained = screen.getByRole('form', { name: 'New status type' });
		expect((within(retained).getByLabelText('Name') as HTMLInputElement).value).toBe('Detail');
		expect((within(retained).getByRole('button', { name: 'Add status type' }) as HTMLButtonElement).disabled).toBe(
			false
		);
	});

	it('edits in place, keeps a custom text color and a stored label, and stays open when the save fails', async () => {
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#48bb78',
				textColor: '#f8f7f4',
				shortLabel: 'LV',
				rosterEffect: 'A',
				sortOrder: 0
			}
		];
		statusTypesStoreMock.updateOrThrow.mockResolvedValueOnce(false);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await openRowAction('Leave', 'Edit');
		const composer = screen.getByRole('form', { name: 'Edit Leave' });
		expect((within(composer).getByLabelText('One-day label') as HTMLInputElement).value).toBe('LV');
		await fireEvent.input(within(composer).getByLabelText('Name'), { target: { value: 'Annual Leave' } });
		await fireEvent.click(within(composer).getByRole('button', { name: 'Save changes' }));

		expect(statusTypesStoreMock.updateOrThrow).toHaveBeenCalledWith('leave', {
			name: 'Annual Leave',
			color: '#48bb78',
			textColor: '#f8f7f4',
			rosterEffect: 'A',
			shortLabel: 'LV'
		});
		await waitFor(() => expect(errorToast).toHaveBeenCalledOnce());
		const retained = screen.getByRole('form', { name: 'Edit Leave' });
		expect((within(retained).getByLabelText('Name') as HTMLInputElement).value).toBe('Annual Leave');
		expect((within(retained).getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(false);
	});

	it('saves an edit only when it is valid and changed, and clears a stored label to the derived one', async () => {
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				shortLabel: 'LV',
				rosterEffect: 'A',
				sortOrder: 0
			}
		];
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await openRowAction('Leave', 'Edit');
		const composer = screen.getByRole('form', { name: 'Edit Leave' });
		const label = within(composer).getByLabelText('One-day label') as HTMLInputElement;
		const save = within(composer).getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;
		expect(save.disabled).toBe(true);

		await fireEvent.input(label, { target: { value: 'ABCD' } });
		expect(label.getAttribute('aria-invalid')).toBe('true');
		expect(save.disabled).toBe(true);
		await fireEvent.submit(composer);
		expect(statusTypesStoreMock.updateOrThrow).not.toHaveBeenCalled();

		await fireEvent.input(label, { target: { value: '' } });
		expect(save.disabled).toBe(false);
		await fireEvent.click(save);

		expect(statusTypesStoreMock.updateOrThrow).toHaveBeenCalledWith('leave', {
			name: 'Leave',
			color: '#48bb78',
			textColor: '#ffffff',
			rosterEffect: 'A',
			shortLabel: null
		});
	});

	it('creates a status with the roster effect chosen, with no preview', async () => {
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		const composer = screen.getByRole('form', { name: 'New status type' });
		await fireEvent.input(within(composer).getByLabelText('Name'), { target: { value: 'Detail' } });
		await fireEvent.click(within(composer).getByRole('radio', { name: /Other duty/ }));
		await fireEvent.click(within(composer).getByRole('button', { name: 'Add status type' }));
		expect(statusTypesStoreMock.add).toHaveBeenCalledWith(expect.objectContaining({ rosterEffect: 'D' }));
		expect(statusTypesStoreMock.previewEffect).not.toHaveBeenCalled();
	});

	describe('changing the roster effect of a saved status', () => {
		const leave = {
			id: 'leave',
			name: 'Leave',
			color: '#48bb78',
			textColor: '#ffffff',
			shortLabel: 'LV',
			rosterEffect: 'A',
			sortOrder: 0
		} as const;
		const kim = {
			assignmentTypeId: 'cq',
			rosterName: 'CQ',
			track: 'all',
			personId: 'kim',
			person: 'SGT Kim',
			change: { kind: 'number', from: 11, to: 9 }
		} as const;

		async function chooseOtherDuty() {
			render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
			await openRowAction('Leave', 'Edit');
			const composer = screen.getByRole('form', { name: 'Edit Leave' });
			await fireEvent.click(within(composer).getByRole('radio', { name: /Other duty/ }));
			await fireEvent.click(within(composer).getByRole('button', { name: 'Save changes' }));
		}

		it('lists the changed numbers and saves nothing until confirmed', async () => {
			statusTypesStoreMock.items = [leave];
			statusTypesStoreMock.previewEffect.mockResolvedValueOnce([
				kim,
				{ ...kim, personId: 'lee', person: 'SPC Lee', change: { kind: 'earlier', days: 3 } }
			]);
			await chooseOtherDuty();

			const dialog = await screen.findByRole('alertdialog');
			expect(within(dialog).getByText('SGT Kim 11 → 9 on the CQ DA 6')).toBeTruthy();
			expect(within(dialog).getByText('SPC Lee: 3 earlier days change on the CQ DA 6')).toBeTruthy();
			expect(statusTypesStoreMock.previewEffect).toHaveBeenCalledWith('leave', 'D', expect.stringMatching(/^\d{4}-/));
			expect(statusTypesStoreMock.updateOrThrow).not.toHaveBeenCalled();

			await fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
			await waitFor(() =>
				expect(statusTypesStoreMock.updateOrThrow).toHaveBeenCalledWith(
					'leave',
					expect.objectContaining({ rosterEffect: 'D' })
				)
			);
		});

		it('holds the confirmation and locks the form until a slow save settles', async () => {
			statusTypesStoreMock.items = [leave];
			statusTypesStoreMock.previewEffect.mockResolvedValueOnce([kim]);
			const saved = Promise.withResolvers<boolean>();
			statusTypesStoreMock.updateOrThrow.mockReturnValueOnce(saved.promise);
			await chooseOtherDuty();

			const dialog = await screen.findByRole('alertdialog');
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

			await waitFor(() => expect(statusTypesStoreMock.updateOrThrow).toHaveBeenCalledTimes(1));
			expect(screen.getByRole('alertdialog')).toBeTruthy();
			expect((within(dialog).getByRole('button', { name: /Save changes/ }) as HTMLButtonElement).disabled).toBe(true);
			expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
			const composer = screen.getByRole('form', { name: 'Edit Leave' });
			expect(composer.querySelector('fieldset')?.disabled).toBe(true);

			saved.resolve(true);
			await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
			expect(screen.queryByRole('form', { name: 'Edit Leave' })).toBeNull();
		});

		it('keeps the confirmation open with the error when the save fails, and saves on retry', async () => {
			statusTypesStoreMock.items = [leave];
			statusTypesStoreMock.previewEffect.mockResolvedValueOnce([kim]);
			statusTypesStoreMock.updateOrThrow.mockRejectedValueOnce(new Error('Status types are busy'));
			await chooseOtherDuty();

			const dialog = await screen.findByRole('alertdialog');
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

			const alert = await within(dialog).findByRole('alert');
			expect(alert.textContent).toBe('Failed to save status type');
			await waitFor(() =>
				expect((within(dialog).getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(false)
			);

			await fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
			await waitFor(() => expect(statusTypesStoreMock.updateOrThrow).toHaveBeenCalledTimes(2));
			await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		});

		it('saves without a confirmation when no number changes', async () => {
			statusTypesStoreMock.items = [leave];
			await chooseOtherDuty();

			await waitFor(() =>
				expect(statusTypesStoreMock.updateOrThrow).toHaveBeenCalledWith(
					'leave',
					expect.objectContaining({ rosterEffect: 'D' })
				)
			);
			expect(screen.queryByRole('alertdialog')).toBeNull();
		});

		it('keeps the edit unsaved and shows the reason when the preview cannot be read', async () => {
			statusTypesStoreMock.items = [leave];
			statusTypesStoreMock.previewEffect.mockRejectedValueOnce(new Error('network'));
			await chooseOtherDuty();

			const dialog = await screen.findByRole('alertdialog');
			expect(within(dialog).getByText(/not saved/i)).toBeTruthy();
			expect(statusTypesStoreMock.updateOrThrow).not.toHaveBeenCalled();

			await fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
			await waitFor(() => expect(statusTypesStoreMock.previewEffect).toHaveBeenCalledTimes(2));
		});

		it('does not preview an edit that leaves the effect alone', async () => {
			statusTypesStoreMock.items = [leave];
			render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
			await openRowAction('Leave', 'Edit');
			const composer = screen.getByRole('form', { name: 'Edit Leave' });
			await fireEvent.input(within(composer).getByLabelText('Name'), { target: { value: 'Annual Leave' } });
			await fireEvent.click(within(composer).getByRole('button', { name: 'Save changes' }));
			await waitFor(() => expect(statusTypesStoreMock.updateOrThrow).toHaveBeenCalled());
			expect(statusTypesStoreMock.previewEffect).not.toHaveBeenCalled();
		});
	});

	it('shows each status effect on its row', () => {
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'A',
				sortOrder: 0
			},
			{
				id: 'dental',
				name: 'Dental',
				color: '#4a5568',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'available',
				sortOrder: 1
			},
			{
				id: 'awol',
				name: 'AWOL',
				color: '#dc2626',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'U',
				sortOrder: 2
			}
		];
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		expect(screen.getByText('Away, count holds')).toBeTruthy();
		expect(screen.getByText('Still available')).toBeTruthy();
		expect(screen.getByText('Misconduct, count runs')).toBeTruthy();
	});

	it('keeps a single choice chosen when the chosen text or color is pressed again', async () => {
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		const composer = screen.getByRole('form', { name: 'New status type' });

		for (const name of ['White', 'Slate']) {
			const choice = within(composer).getByRole('radio', { name });
			expect(choice.getAttribute('aria-checked')).toBe('true');
			await fireEvent.click(choice);
			expect(within(composer).getByRole('radio', { name }).getAttribute('aria-checked')).toBe('true');
		}
	});

	it('never brings back a cancelled or discarded draft', async () => {
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		const nameField = () =>
			within(screen.getByRole('form', { name: 'New status type' })).getByLabelText('Name') as HTMLInputElement;

		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		await fireEvent.input(nameField(), { target: { value: 'Detail' } });
		await fireEvent.click(
			within(screen.getByRole('form', { name: 'New status type' })).getByRole('button', { name: 'Cancel' })
		);
		expect(screen.queryByRole('form', { name: 'New status type' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		expect(nameField().value).toBe('');

		await fireEvent.input(nameField(), { target: { value: 'Quarters' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		await fireEvent.click(
			within(screen.getByRole('alertdialog', { name: 'Discard changes?' })).getByRole('button', { name: 'Discard' })
		);
		await waitFor(() => expect(nameField().value).toBe(''));
		expect(statusTypesStoreMock.add).not.toHaveBeenCalled();
	});

	it('closes the composer on Escape, asking first when it has changes, and returns focus to what opened it', async () => {
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'A',
				sortOrder: 0
			}
		];
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await openRowAction('Leave', 'Edit');
		await fireEvent.keyDown(within(screen.getByRole('form', { name: 'Edit Leave' })).getByLabelText('Name'), {
			key: 'Escape'
		});
		await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit Leave' })).toBeNull());
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions for Leave' }));

		const add = screen.getByRole('button', { name: 'Add new' });
		add.focus();
		await fireEvent.click(add);
		const name = within(screen.getByRole('form', { name: 'New status type' })).getByLabelText('Name');
		await fireEvent.input(name, { target: { value: 'Detail' } });
		await fireEvent.keyDown(name, { key: 'Escape' });
		await fireEvent.click(
			within(screen.getByRole('alertdialog', { name: 'Discard changes?' })).getByRole('button', { name: 'Discard' })
		);
		await waitFor(() => expect(screen.queryByRole('form', { name: 'New status type' })).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add new' })));
	});

	it('asks before an open composer with changes is replaced', async () => {
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'A',
				sortOrder: 0
			}
		];
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		await fireEvent.input(within(screen.getByRole('form', { name: 'New status type' })).getByLabelText('Name'), {
			target: { value: 'Detail' }
		});

		await openRowAction('Leave', 'Edit');
		await fireEvent.click(
			within(screen.getByRole('alertdialog', { name: 'Discard changes?' })).getByRole('button', { name: 'Cancel' })
		);
		expect(
			(within(screen.getByRole('form', { name: 'New status type' })).getByLabelText('Name') as HTMLInputElement).value
		).toBe('Detail');
		expect(screen.queryByRole('form', { name: 'Edit Leave' })).toBeNull();

		await openRowAction('Leave', 'Edit');
		await fireEvent.click(
			within(screen.getByRole('alertdialog', { name: 'Discard changes?' })).getByRole('button', { name: 'Discard' })
		);
		await waitFor(() => expect(screen.getByRole('form', { name: 'Edit Leave' })).toBeTruthy());
		expect(screen.queryByRole('form', { name: 'New status type' })).toBeNull();
	});

	it('saves the full status order after a keyboard move and offers no grips while the list is filtered', async () => {
		const { layOut } = stubToolbarWidths();
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'A',
				sortOrder: 0
			},
			{
				id: 'school',
				name: 'School',
				color: '#4299e1',
				textColor: '#ffffff',
				shortLabel: 'SCH',
				rosterEffect: 'A',
				sortOrder: 1
			},
			{
				id: 'sick',
				name: 'Sick',
				color: '#e53e3e',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'A',
				sortOrder: 2
			}
		];
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await layOut(2000);

		await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Leave' }), { key: 'ArrowDown' });
		expect(statusTypesStoreMock.setOrder).toHaveBeenCalledWith(['school', 'leave', 'sick']);

		const toolbar = screen.getByRole('toolbar', { name: 'Calendar settings controls' });
		await fireEvent.input(within(toolbar).getByRole('searchbox', { name: 'Filter Status Types' }), {
			target: { value: 's' }
		});
		await waitFor(() => expect(screen.queryByRole('button', { name: 'Reorder School' })).toBeNull());
		expect(screen.queryByRole('button', { name: /^Reorder / })).toBeNull();
		vi.unstubAllGlobals();
	});

	it('keeps delete confirmation open and local availability intact when deletion fails', async () => {
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'A',
				sortOrder: 3
			}
		];
		statusTypesStoreMock.remove.mockResolvedValueOnce(false);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await openRowAction('Leave', 'Delete');
		const dialog = screen.getByRole('alertdialog', { name: 'Delete Status Type' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

		expect(screen.getByRole('alertdialog', { name: 'Delete Status Type' })).toBeTruthy();
		expect(availabilityStoreMock.removeByStatusTypeLocal).not.toHaveBeenCalled();
		expect(errorToast).toHaveBeenCalledOnce();
	});

	it.each([
		['A', true],
		['available', false]
	] as const)(
		'warns about open DA 6 forms when deleting a status with roster effect %s: %s',
		async (rosterEffect, warns) => {
			statusTypesStoreMock.items = [
				{
					id: 's1',
					name: 'Leave',
					color: '#48bb78',
					textColor: '#ffffff',
					shortLabel: null,
					rosterEffect,
					sortOrder: 0
				}
			];

			render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

			await openRowAction('Leave', 'Delete');
			const dialog = screen.getByRole('alertdialog', { name: 'Delete Status Type' });
			expect(/DA 6/.test(dialog.textContent ?? '')).toBe(warns);
		}
	);

	it.each([
		['personnel', true],
		['group', false]
	] as const)('warns about the duty roster only when deleting a %s-assigned type: %s', async (assignTo, warns) => {
		assignmentTypesStoreMock.types = [
			{
				id: 'cq',
				name: 'Charge of Quarters',
				shortName: 'CQ',
				assignTo,
				color: '#2563eb',
				poolRules: null,
				weekendMode: 'same',
				excusals: [],
				showOnCalendar: false,
				sortOrder: 0
			}
		];

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await fireEvent.click(screen.getByRole('tab', { name: /Assignment Types/i }));
		await openRowAction('Charge of Quarters', 'Delete');
		const dialog = screen.getByRole('alertdialog', { name: 'Delete Assignment Type' });
		expect(/duty roster/.test(dialog.textContent ?? '')).toBe(warns);
	});

	it('keeps the add-assignment dialog open when creation fails', async () => {
		assignmentTypesStoreMock.addType.mockResolvedValueOnce(null);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await fireEvent.click(screen.getByRole('tab', { name: /Assignment Types/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		const dialog = screen.getByRole('dialog', { name: 'Add Assignment Type' });
		await fireEvent.input(within(dialog).getByLabelText('Full name'), { target: { value: 'Staff Duty' } });
		await fireEvent.input(within(dialog).getByLabelText('Short code'), { target: { value: 'SD' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add Assignment Type' }));

		expect(screen.getByRole('dialog', { name: 'Add Assignment Type' })).toBeTruthy();
		expect(errorToast).toHaveBeenCalledWith('Failed to add assignment type');
	});

	it('keeps the assignment target chosen when the chosen target is pressed again', async () => {
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await fireEvent.click(screen.getByRole('tab', { name: /Assignment Types/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		const dialog = screen.getByRole('dialog', { name: 'Add Assignment Type' });

		await fireEvent.click(within(dialog).getByRole('radio', { name: 'Person' }));

		expect(within(dialog).getByRole('radio', { name: 'Person' }).getAttribute('aria-checked')).toBe('true');
	});

	it('keeps the edit-assignment dialog open when save fails', async () => {
		assignmentTypesStoreMock.types = [
			{
				id: 'cq',
				name: 'Charge of Quarters',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#2563eb',
				poolRules: null,
				weekendMode: 'same',
				excusals: [],
				showOnCalendar: false,
				sortOrder: 0
			}
		];
		assignmentTypesStoreMock.updateType.mockResolvedValueOnce(false);

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await fireEvent.click(screen.getByRole('tab', { name: /Assignment Types/i }));
		await openRowAction('Charge of Quarters', 'Edit');
		const dialog = screen.getByRole('dialog', { name: 'Edit Assignment Type' });
		await fireEvent.input(within(dialog).getByLabelText('Full name'), { target: { value: 'Staff Duty' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

		await waitFor(() => expect(assignmentTypesStoreMock.updateType).toHaveBeenCalled());
		const retained = screen.getByRole('dialog', { name: 'Edit Assignment Type' });
		expect((within(retained).getByLabelText('Full name') as HTMLInputElement).value).toBe('Staff Duty');
	});

	it('keeps delete assignment confirmation open when deletion fails', async () => {
		assignmentTypesStoreMock.types = [
			{
				id: 'cq',
				name: 'Charge of Quarters',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#2563eb',
				poolRules: null,
				weekendMode: 'same',
				excusals: [],
				showOnCalendar: false,
				sortOrder: 0
			}
		];
		assignmentTypesStoreMock.removeType.mockResolvedValueOnce(false);

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await fireEvent.click(screen.getByRole('tab', { name: /Assignment Types/i }));
		await openRowAction('Charge of Quarters', 'Delete');
		const dialog = screen.getByRole('alertdialog', { name: 'Delete Assignment Type' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(assignmentTypesStoreMock.removeType).toHaveBeenCalledWith('cq'));
		expect(screen.getByRole('alertdialog', { name: 'Delete Assignment Type' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'More actions for Charge of Quarters' })).toBeTruthy();
	});

	it.each([
		['assignments', /Assignment Types/],
		['closures', /Holidays & closures/],
		['status', /Status Types/]
	])('opens on the %s section named in the link', (section, tab) => {
		pageMock.url = new URL(`http://localhost/org/org-1/calendar/settings?section=${section}`);

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		expect(screen.getByRole('tab', { name: tab }).getAttribute('aria-selected')).toBe('true');
	});

	it('opens on Status Types when the link names no known section', () => {
		pageMock.url = new URL('http://localhost/org/org-1/calendar/settings?section=nonsense');

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		expect(screen.getByRole('tab', { name: /Status Types/ }).getAttribute('aria-selected')).toBe('true');
	});

	it('switches settings sections as tabs and shows only the chosen panel', async () => {
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		const closuresTab = screen.getByRole('tab', { name: /Holidays & closures/ });
		await fireEvent.click(closuresTab);

		expect(closuresTab.getAttribute('aria-selected')).toBe('true');
		expect(screen.getByRole('tab', { name: /Status Types/ }).getAttribute('aria-selected')).toBe('false');
		const panel = screen.getByRole('tabpanel');
		expect(within(panel).getByLabelText('Year')).toBeTruthy();
	});

	it("names each row's actions by the row and edits the chosen row", async () => {
		assignmentTypesStoreMock.types = [
			{
				id: 'cq',
				name: 'Charge of Quarters',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#2563eb',
				poolRules: null,
				weekendMode: 'same',
				excusals: [],
				showOnCalendar: false,
				sortOrder: 0
			},
			{
				id: 'sd',
				name: 'Staff Duty',
				shortName: 'SD',
				assignTo: 'group',
				color: '#047857',
				poolRules: null,
				weekendMode: 'same',
				excusals: [],
				showOnCalendar: false,
				sortOrder: 0
			}
		];

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await fireEvent.click(screen.getByRole('tab', { name: /Assignment Types/ }));
		expect(screen.getByRole('button', { name: 'More actions for Charge of Quarters' })).toBeTruthy();
		await openRowAction('Staff Duty', 'Edit');
		const dialog = screen.getByRole('dialog', { name: 'Edit Assignment Type' });

		expect((within(dialog).getByLabelText('Full name') as HTMLInputElement).value).toBe('Staff Duty');
		expect((within(dialog).getByLabelText('Short code') as HTMLInputElement).value).toBe('SD');
		expect((within(dialog).getByLabelText('Color') as HTMLInputElement).value).toBe('#047857');
	});

	describe('the closure composer', () => {
		beforeEach(onOctober14);

		async function openComposer(name: string) {
			render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
			await fireEvent.click(screen.getByRole('tab', { name: /Holidays & closures/ }));
			await fireEvent.click(screen.getByRole('button', { name: 'New closure' }));
			const composer = screen.getByRole('form', { name: 'New closure' });
			await fireEvent.input(within(composer).getByLabelText('Name'), { target: { value: name } });
			return composer;
		}

		it('cannot add when every picked day already has a holiday or closure', async () => {
			specialDaysStoreMock.items = [{ id: 'taken', date: '2026-10-14', name: 'Stand-down', type: 'org-closure' }];
			const composer = await openComposer('Training holiday');

			const submit = within(composer).getByRole('button', { name: /^Add 0 days/ }) as HTMLButtonElement;
			expect(submit.disabled).toBe(true);
			await fireEvent.submit(composer);
			expect(specialDaysStoreMock.addClosureDays).not.toHaveBeenCalled();
		});

		it('keeps the draft open with the access reason when the save is refused', async () => {
			specialDaysStoreMock.addClosureDays.mockResolvedValueOnce({
				status: 'not-saved',
				message: 'This action requires Calendar configuration access'
			});
			const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
			const composer = await openComposer('Training holiday');

			await fireEvent.click(within(composer).getByRole('button', { name: /^Add 1 day/ }));

			await waitFor(() =>
				expect(errorToast).toHaveBeenCalledWith('This action requires Calendar configuration access')
			);
			expect(specialDaysStoreMock.addClosureDays).toHaveBeenCalledExactlyOnceWith({
				name: 'Training holiday',
				dates: ['2026-10-14']
			});
			const kept = screen.getByRole('form', { name: 'New closure' });
			expect((within(kept).getByLabelText('Name') as HTMLInputElement).value).toBe('Training holiday');
		});

		it('returns focus to New closure after Cancel', async () => {
			render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
			await fireEvent.click(screen.getByRole('tab', { name: /Holidays & closures/ }));
			const add = screen.getByRole('button', { name: 'New closure' });
			add.focus();
			await fireEvent.click(add);

			await fireEvent.click(
				within(screen.getByRole('form', { name: 'New closure' })).getByRole('button', { name: 'Cancel' })
			);

			await waitFor(() => expect(screen.queryByRole('form', { name: 'New closure' })).toBeNull());
			await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New closure' })));
		});

		it('describes the Last day control by the error when it falls before the First day', async () => {
			const composer = await openComposer('Training holiday');

			await pickDay(composer, 'Last day', 'Saturday, October 10, 2026');

			const lastDay = within(composer).getByRole('button', { name: 'Last day' });
			expect(lastDay.getAttribute('aria-invalid')).toBe('true');
			expect(lastDay.getAttribute('aria-describedby')?.split(' ')).toContain(within(composer).getByRole('alert').id);
		});
	});

	it('keeps delete closure confirmation open when deletion fails', async () => {
		onOctober14();
		specialDaysStoreMock.items = [
			{
				id: 'closure-1',
				date: '2026-12-15',
				name: 'Training Day',
				type: 'org-closure'
			}
		];
		specialDaysStoreMock.remove.mockResolvedValueOnce(false);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await fireEvent.click(screen.getByRole('tab', { name: /Holidays & closures/ }));
		await openRowAction('Training Day', 'Remove');
		const dialog = screen.getByRole('alertdialog', { name: 'Remove Special Day' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

		expect(screen.getByRole('alertdialog', { name: 'Remove Special Day' })).toBeTruthy();
		expect(errorToast).toHaveBeenCalledWith('Failed to delete closure');
	});

	it('keeps holiday reset confirmation open and reports a failed reset', async () => {
		specialDaysStoreMock.resetFederalHolidays.mockResolvedValueOnce('not-saved');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await fireEvent.click(screen.getByRole('tab', { name: /Holidays & closures/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
		const dialog = screen.getByRole('alertdialog', { name: 'Reset Federal Holidays' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));

		expect(specialDaysStoreMock.resetFederalHolidays).toHaveBeenCalledOnce();
		expect(screen.getByRole('alertdialog', { name: 'Reset Federal Holidays' })).toBeTruthy();
		expect(errorToast).toHaveBeenCalledWith('Failed to reset federal holidays');
	});

	it('reports when a saved holiday reset cannot refresh current days', async () => {
		specialDaysStoreMock.resetFederalHolidays.mockResolvedValueOnce('saved-unrefreshed');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await fireEvent.click(screen.getByRole('tab', { name: /Holidays & closures/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
		const dialog = screen.getByRole('alertdialog', { name: 'Reset Federal Holidays' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));

		expect(screen.queryByRole('alertdialog', { name: 'Reset Federal Holidays' })).toBeNull();
		expect(errorToast).toHaveBeenCalledWith(
			'Holiday reset saved, but Calendar could not refresh. Reload to see the latest days.'
		);
	});

	it.each([
		['unconfirmed', "We couldn't confirm the holiday reset. The list shows the saved days. Reset again if needed."],
		['unconfirmed-unrefreshed', "We couldn't confirm the holiday reset. Reload to see the saved days."]
	] as const)('closes the reset confirmation on an %s reset and says so', async (result, message) => {
		specialDaysStoreMock.resetFederalHolidays.mockResolvedValueOnce(result);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await fireEvent.click(screen.getByRole('tab', { name: /Holidays & closures/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
		const dialog = screen.getByRole('alertdialog', { name: 'Reset Federal Holidays' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));

		expect(screen.queryByRole('alertdialog', { name: 'Reset Federal Holidays' })).toBeNull();
		expect(errorToast).toHaveBeenCalledExactlyOnceWith(message);
	});

	it('does not show failure feedback for a reset superseded by an Organization change', async () => {
		specialDaysStoreMock.resetFederalHolidays.mockResolvedValueOnce('stale');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await fireEvent.click(screen.getByRole('tab', { name: /Holidays & closures/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
		const dialog = screen.getByRole('alertdialog', { name: 'Reset Federal Holidays' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));

		expect(screen.queryByRole('alertdialog', { name: 'Reset Federal Holidays' })).toBeNull();
		expect(errorToast).not.toHaveBeenCalled();
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

		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await fireEvent.click(screen.getByRole('tab', { name: /Holidays & closures/ }));

		const yearSelect = screen.getByLabelText('Year') as HTMLSelectElement;
		expect(yearSelect.value).toBe(String(new Date().getFullYear()));

		yearSelect.value = '2026';
		await fireEvent.change(yearSelect);

		expect(yearSelect.value).toBe('2026');
		expect(screen.getByText("New Year's Day")).toBeTruthy();
	});

	// happy-dom does not apply a disabled fieldset to its controls' :disabled state.
	const inDisabledGroup = (control: HTMLElement) => control.closest('fieldset[disabled]') !== null;

	const heldAddDialogs = [
		{
			section: /Assignment Types/i,
			dialogName: 'Add Assignment Type',
			draft: { 'Full name': 'Staff Duty', 'Short code': 'SD' },
			save: () => assignmentTypesStoreMock.addType,
			error: 'Failed to add assignment type'
		}
	];

	it.each(heldAddDialogs)(
		'holds $dialogName busy with its draft locked, ignores a repeat submit and keeps the draft on failure',
		async ({ section, dialogName, draft, save, error }) => {
			let settle!: (created: null) => void;
			save().mockReturnValueOnce(new Promise((resolve) => (settle = resolve)));
			const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
			render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
			if (section) await fireEvent.click(screen.getByRole('tab', { name: section }));
			await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
			const dialog = screen.getByRole('dialog', { name: dialogName });
			for (const [label, value] of Object.entries(draft)) {
				await fireEvent.input(within(dialog).getByLabelText(label), { target: { value } });
			}
			const submit = within(dialog).getByRole('button', { name: dialogName }) as HTMLButtonElement;
			submit.focus();

			await fireEvent.click(submit);
			await fireEvent.click(submit);

			expect(save()).toHaveBeenCalledTimes(1);
			expect(dialog.getAttribute('aria-busy')).toBe('true');
			expect(submit.disabled).toBe(true);
			expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
			for (const label of Object.keys(draft)) {
				expect(inDisabledGroup(within(dialog).getByLabelText(label))).toBe(true);
			}
			await waitFor(() => expect(document.activeElement).toBe(dialog));
			await fireEvent.keyDown(dialog, { key: 'Escape' });
			expect(screen.getByRole('dialog', { name: dialogName })).toBe(dialog);

			settle(null);

			await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
			expect(errorToast).toHaveBeenCalledWith(error);
			expect(screen.getByRole('dialog', { name: dialogName })).toBe(dialog);
			for (const [label, value] of Object.entries(draft)) {
				const control = within(dialog).getByLabelText(label) as HTMLInputElement;
				expect(control.value).toBe(value);
				expect(inDisabledGroup(control)).toBe(false);
			}
			expect(submit.disabled).toBe(false);
		}
	);

	it('holds a status save with its draft locked, ignores a repeat submit and keeps the draft on failure', async () => {
		let settle!: (created: null) => void;
		statusTypesStoreMock.add.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)));
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add new' }));
		const composer = () => screen.getByRole('form', { name: 'New status type' });
		const control = (name: string) =>
			within(composer()).getByRole('button', { name: new RegExp(name) }) as HTMLButtonElement;
		await fireEvent.input(within(composer()).getByLabelText('Name'), { target: { value: 'Detail' } });

		await fireEvent.click(control('Add status type'));
		await fireEvent.click(control('Add status type'));

		expect(statusTypesStoreMock.add).toHaveBeenCalledTimes(1);
		expect(control('Add status type').disabled).toBe(true);
		expect(control('Cancel').disabled).toBe(true);
		await fireEvent.keyDown(within(composer()).getByLabelText('Name'), { key: 'Escape' });
		expect(screen.queryByRole('alertdialog', { name: 'Discard changes?' })).toBeNull();

		settle(null);

		await waitFor(() => expect(control('Cancel').disabled).toBe(false));
		expect(errorToast).toHaveBeenCalledOnce();
		expect((within(composer()).getByLabelText('Name') as HTMLInputElement).value).toBe('Detail');
		expect(control('Add status type').disabled).toBe(false);
	});

	it('holds a closure save with its draft locked, ignores a repeat submit and keeps the draft on failure', async () => {
		onOctober14();
		let settle!: (result: { status: 'not-saved'; message: string }) => void;
		specialDaysStoreMock.addClosureDays.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)));
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });
		await fireEvent.click(screen.getByRole('tab', { name: /Holidays & closures/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'New closure' }));
		const composer = () => screen.getByRole('form', { name: 'New closure' });
		const control = (name: string | RegExp) => within(composer()).getByRole('button', { name }) as HTMLButtonElement;
		await fireEvent.input(within(composer()).getByLabelText('Name'), { target: { value: 'Block leave' } });
		await pickDay(composer(), 'Last day', 'Friday, October 16, 2026');

		await fireEvent.click(control(/Add 3 days/));
		await fireEvent.click(control(/Add 3 days/));

		expect(specialDaysStoreMock.addClosureDays).toHaveBeenCalledExactlyOnceWith({
			name: 'Block leave',
			dates: ['2026-10-14', '2026-10-15', '2026-10-16']
		});
		expect(control(/Add 3 days/).disabled).toBe(true);
		expect(control('Cancel').disabled).toBe(true);
		for (const field of [within(composer()).getByLabelText('Name'), control('First day'), control('Last day')]) {
			expect(inDisabledGroup(field)).toBe(true);
		}
		await fireEvent.keyDown(within(composer()).getByLabelText('Name'), { key: 'Escape' });
		expect(screen.queryByRole('alertdialog', { name: 'Discard changes?' })).toBeNull();

		settle({ status: 'not-saved', message: 'This action requires Calendar configuration access' });

		await waitFor(() => expect(control('Cancel').disabled).toBe(false));
		expect((within(composer()).getByLabelText('Name') as HTMLInputElement).value).toBe('Block leave');
		expect(control('First day').textContent).toContain('Oct 14, 2026');
		expect(control('Last day').textContent).toContain('Oct 16, 2026');
		expect(inDisabledGroup(control('Last day'))).toBe(false);
	});

	it('keeps a held status deletion busy and undismissable until it settles', async () => {
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'A',
				sortOrder: 4
			}
		];
		let settle!: (deleted: boolean) => void;
		statusTypesStoreMock.remove.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)));
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await openRowAction('Leave', 'Delete');
		const dialog = screen.getByRole('alertdialog', { name: 'Delete Status Type' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

		expect(dialog.getAttribute('aria-busy')).toBe('true');
		expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(screen.getByRole('alertdialog', { name: 'Delete Status Type' })).toBeTruthy();

		settle(true);

		await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Delete Status Type' })).toBeNull());
		expect(availabilityStoreMock.removeByStatusTypeLocal).toHaveBeenCalledWith('leave');
	});

	it('clears busy and keeps a held status deletion open when it rejects', async () => {
		statusTypesStoreMock.items = [
			{
				id: 'leave',
				name: 'Leave',
				color: '#48bb78',
				textColor: '#ffffff',
				shortLabel: null,
				rosterEffect: 'A',
				sortOrder: 5
			}
		];
		let fail!: (error: Error) => void;
		statusTypesStoreMock.remove.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarSettingsPage, { props: { org, rankCatalog: Promise.resolve([]) } });

		await openRowAction('Leave', 'Delete');
		const dialog = screen.getByRole('alertdialog', { name: 'Delete Status Type' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
		expect(dialog.getAttribute('aria-busy')).toBe('true');

		fail(new Error('Status type is in use'));

		await waitFor(() => {
			const retained = screen.getByRole('alertdialog', { name: 'Delete Status Type' });
			expect(retained.hasAttribute('aria-busy')).toBe(false);
			expect((within(retained).getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(false);
		});
		expect(errorToast).toHaveBeenCalledWith('Status type is in use');
		expect(availabilityStoreMock.removeByStatusTypeLocal).not.toHaveBeenCalled();
	});
});
