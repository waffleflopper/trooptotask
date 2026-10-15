// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import CalendarAssignmentSettingsSection from './CalendarAssignmentSettingsSection.svelte';
import type { AssignmentType } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';

const { store, roster } = vi.hoisted(() => ({
	store: {
		types: [] as AssignmentType[],
		pendingLaneIds: null as string[] | null,
		typesBusy: false,
		typeWritesBusy: false,
		addType: vi.fn(),
		updateType: vi.fn(),
		removeType: vi.fn(),
		setCalendarLanes: vi.fn()
	},
	roster: { items: [] as Personnel[] }
}));

vi.mock('$features/calendar/stores/dailyAssignments.svelte', () => ({ dailyAssignmentsStore: store }));
vi.mock('$features/personnel', () => ({ rosterStore: roster }));

function type(id: string, name: string, overrides: Partial<AssignmentType> = {}): AssignmentType {
	return {
		id,
		name,
		shortName: name.slice(0, 2).toUpperCase(),
		assignTo: 'personnel',
		color: '#b91c1c',
		exemptPersonnelIds: [],
		showOnCalendar: false,
		sortOrder: 0,
		...overrides
	};
}

function person(id: string, rank: string, lastName: string, firstName: string): Personnel {
	return { id, rank, lastName, firstName, mos: '', clinicRole: '', groupId: null, groupName: '' };
}

const lane = (id: string, name: string, sortOrder: number) => type(id, name, { showOnCalendar: true, sortOrder });

function renderSection(searchQuery = '') {
	return render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery } });
}

const ON_CALENDAR = /^On the calendar/;

function listNames(name: string | RegExp) {
	const list = screen.queryByRole('list', { name });
	if (!list) return [];
	return within(list)
		.getAllByRole('switch')
		.map((toggle) => toggle.getAttribute('aria-label')?.replace(/^Show (.*) on the calendar$/, '$1'));
}

async function openRowMenu(typeName: string, action: 'Edit' | 'Delete') {
	await fireEvent.keyDown(screen.getByRole('button', { name: `More actions for ${typeName}` }), { key: 'Enter' });
	await fireEvent.click(await screen.findByRole('menuitem', { name: action }));
}

beforeEach(() => {
	store.types = [
		lane('cq', 'Charge of Quarters', 1),
		type('runner', 'Runner'),
		lane('sd', 'Staff Duty', 0),
		type('gate', 'Gate Guard'),
		type('old', 'Old Duty', { archivedAt: '2026-01-01T00:00:00.000Z' })
	];
	store.pendingLaneIds = null;
	store.typesBusy = false;
	store.typeWritesBusy = false;
	store.addType.mockReset();
	store.updateType.mockReset().mockResolvedValue(true);
	store.removeType.mockReset().mockResolvedValue(true);
	store.setCalendarLanes.mockReset().mockResolvedValue({ status: 'saved' });
	roster.items = [person('p-pike', 'SGT', 'Pike', 'Dana'), person('p-kim', 'SPC', 'Kim', 'Jae-won')];
});

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
});

describe('CalendarAssignmentSettingsSection', () => {
	it('lists lanes in calendar order and planner-only types by name, without archived types', () => {
		renderSection();

		expect(listNames(ON_CALENDAR)).toEqual(['Staff Duty', 'Charge of Quarters']);
		expect(listNames('Duty planner only')).toEqual(['Gate Guard', 'Runner']);
		expect(screen.queryByText('Old Duty')).toBeNull();
		expect(screen.queryByText('Each lane adds about 26px above the roster.')).toBeNull();
	});

	it('appends a type when switched on and removes only that type when switched off', async () => {
		renderSection();
		await fireEvent.click(screen.getByRole('switch', { name: 'Show Gate Guard on the calendar' }));
		expect(store.setCalendarLanes).toHaveBeenLastCalledWith(['sd', 'cq', 'gate']);
		cleanup();

		store.types = [lane('sd', 'Staff Duty', 0), lane('cq', 'Charge of Quarters', 1), lane('gate', 'Gate Guard', 2)];
		renderSection();
		await fireEvent.click(screen.getByRole('switch', { name: 'Show Staff Duty on the calendar' }));
		expect(store.setCalendarLanes).toHaveBeenLastCalledWith(['cq', 'gate']);
	});

	it('moves a lane with the keyboard and announces its new position', async () => {
		renderSection();

		await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Staff Duty' }), { key: 'ArrowDown' });

		expect(store.setCalendarLanes).toHaveBeenCalledWith(['cq', 'sd']);
		await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Staff Duty.*2 of 2/));
	});

	it('shows the pending lane order while a save is in flight', () => {
		store.pendingLaneIds = ['cq', 'sd'];
		renderSection();

		expect(listNames(ON_CALENDAR)).toEqual(['Charge of Quarters', 'Staff Duty']);
		expect(
			(screen.getByRole('switch', { name: 'Show Gate Guard on the calendar' }) as HTMLButtonElement).disabled
		).toBe(false);
	});

	it('notes the height cost once there are more than three lanes', () => {
		store.types = [lane('a', 'Alpha', 0), lane('b', 'Bravo', 1), lane('c', 'Charlie', 2), lane('d', 'Delta', 3)];
		renderSection();

		expect(screen.getByText('Each lane adds about 26px above the roster.')).toBeTruthy();
	});

	it('hides grips while searching because a filtered list cannot express positions', () => {
		renderSection('staff');

		expect(screen.queryByRole('button', { name: /^Reorder / })).toBeNull();
		expect(screen.getByText('Clear search to reorder.')).toBeTruthy();
		expect(listNames(ON_CALENDAR)).toEqual(['Staff Duty']);
		expect(listNames('Duty planner only')).toEqual([]);
	});

	it('turns the lane on only after the edited details save', async () => {
		let detailsSaved!: (saved: boolean) => void;
		store.updateType.mockImplementation(() => new Promise((resolve) => (detailsSaved = resolve)));
		renderSection();

		await openRowMenu('Runner', 'Edit');
		const dialog = await screen.findByRole('dialog', { name: 'Edit Assignment Type' });
		await fireEvent.input(within(dialog).getByLabelText('Full name'), { target: { value: 'Runner (Day)' } });
		await fireEvent.click(within(dialog).getByRole('switch', { name: 'Show on the calendar' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

		await waitFor(() =>
			expect(store.updateType).toHaveBeenCalledWith('runner', expect.objectContaining({ name: 'Runner (Day)' }))
		);
		expect(store.setCalendarLanes).not.toHaveBeenCalled();
		detailsSaved(true);

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(store.setCalendarLanes).toHaveBeenCalledWith(['sd', 'cq', 'runner']);
	});

	it('leaves the lane and the draft alone when the details fail to save', async () => {
		store.updateType.mockResolvedValue(false);
		renderSection();

		await openRowMenu('Runner', 'Edit');
		const dialog = await screen.findByRole('dialog', { name: 'Edit Assignment Type' });
		await fireEvent.input(within(dialog).getByLabelText('Full name'), { target: { value: 'Runner (Day)' } });
		await fireEvent.click(within(dialog).getByRole('switch', { name: 'Show on the calendar' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

		await waitFor(() => expect(store.updateType).toHaveBeenCalled());
		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		expect(store.setCalendarLanes).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog', { name: 'Edit Assignment Type' })).toBe(dialog);
		expect((within(dialog).getByLabelText('Full name') as HTMLInputElement).value).toBe('Runner (Day)');
		expect(within(dialog).getByRole('switch', { name: 'Show on the calendar' }).getAttribute('aria-checked')).toBe(
			'true'
		);
	});

	it('keeps an added type open for retry when its lane is not saved, then shows it once', async () => {
		store.addType.mockImplementation(async (data: Omit<AssignmentType, 'id'>) => {
			const created = { ...data, id: 'new' };
			store.types = [...store.types, created];
			return created;
		});
		store.setCalendarLanes.mockResolvedValueOnce({ status: 'not-saved', message: 'Failed', showsSaved: true });
		const view = renderSection();

		view.component.openAddDialog();
		const dialog = await screen.findByRole('dialog', { name: 'Add Assignment Type' });
		await fireEvent.input(within(dialog).getByLabelText('Full name'), { target: { value: 'Fire Guard' } });
		await fireEvent.input(within(dialog).getByLabelText('Short code'), { target: { value: 'fg' } });
		await fireEvent.click(within(dialog).getByRole('switch', { name: 'Show on the calendar' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add Assignment Type' }));

		await within(dialog).findByRole('alert');
		expect(store.setCalendarLanes).toHaveBeenLastCalledWith(['sd', 'cq', 'new']);
		expect(screen.getByRole('dialog', { name: 'Edit Assignment Type' })).toBe(dialog);
		expect((within(dialog).getByLabelText('Full name') as HTMLInputElement).value).toBe('Fire Guard');

		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(store.setCalendarLanes).toHaveBeenLastCalledWith(['sd', 'cq', 'new']);
		expect(store.addType).toHaveBeenCalledTimes(1);
		expect(store.types.filter((candidate) => candidate.name === 'Fire Guard').map((candidate) => candidate.id)).toEqual(
			['new']
		);
	});

	it('does not say the calendar setting was not saved when the outcome is unknown', async () => {
		store.setCalendarLanes.mockResolvedValue({ status: 'unconfirmed', showsSaved: true });
		renderSection();

		await openRowMenu('Runner', 'Edit');
		const dialog = await screen.findByRole('dialog', { name: 'Edit Assignment Type' });
		await fireEvent.click(within(dialog).getByRole('switch', { name: 'Show on the calendar' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

		const alert = await within(dialog).findByRole('alert');
		expect(alert.textContent).not.toMatch(/not saved/);
		expect(alert.textContent).toMatch(/confirm/);
	});

	it('adds and removes exempt people, keeping an unknown person until removed', async () => {
		store.types = [type('sd', 'Staff Duty', { exemptPersonnelIds: ['p-gone'] })];
		renderSection();

		await openRowMenu('Staff Duty', 'Edit');
		const dialog = await screen.findByRole('dialog', { name: 'Edit Assignment Type' });
		expect(within(dialog).getByRole('button', { name: 'Remove Unknown person' })).toBeTruthy();
		const input = within(dialog).getByRole('combobox', { name: 'Exempt from this duty' });
		input.focus();
		await screen.findByRole('listbox');
		await fireEvent.click(screen.getByRole('option', { name: 'SGT Pike, Dana' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Unknown person' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

		await waitFor(() =>
			expect(store.updateType).toHaveBeenCalledWith('sd', expect.objectContaining({ exemptPersonnelIds: ['p-pike'] }))
		);
		expect(store.setCalendarLanes).not.toHaveBeenCalled();
	});
});
