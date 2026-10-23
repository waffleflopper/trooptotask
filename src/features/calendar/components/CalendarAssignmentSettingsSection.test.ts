// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import CalendarAssignmentSettingsSection from './CalendarAssignmentSettingsSection.svelte';
import type { AssignmentType } from '$features/calendar/contracts';
import { BUILT_IN_RANK_CATALOG, type Personnel, type RankCatalogEntry } from '$features/personnel/contracts';
import { buildRequestError } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';

const { store, roster } = vi.hoisted(() => ({
	store: {
		types: [] as AssignmentType[],
		pendingLaneIds: null as string[] | null,
		typesBusy: false,
		typeWritesBusy: false,
		addType: vi.fn(),
		updateType: vi.fn(),
		removeType: vi.fn(),
		setCalendarLanes: vi.fn(),
		saveRosterSettings: vi.fn()
	},
	roster: { items: [] as Personnel[] }
}));

vi.mock('$features/calendar/stores/dailyAssignments.svelte', () => ({ dailyAssignmentsStore: store }));
vi.mock('$features/personnel', () => ({ rosterStore: roster, groupsStore: { items: [] } }));
// The row reads its own status over the network; StartingNumbersRow.test.ts covers it.
vi.mock('./StartingNumbersRow.svelte', async () => ({
	default: (await import('$lib/test-stubs/VisibleStub.svelte')).default
}));

function type(id: string, name: string, overrides: Partial<AssignmentType> = {}): AssignmentType {
	return {
		id,
		name,
		shortName: name.slice(0, 2).toUpperCase(),
		assignTo: 'personnel',
		color: '#b91c1c',
		poolRules: null,
		weekendMode: 'same',
		excusals: [],
		showOnCalendar: false,
		sortOrder: 0,
		...overrides
	};
}

function person(id: string, rank: string, lastName: string, firstName: string): Personnel {
	return { id, rank, lastName, firstName, mos: '', clinicRole: '', groupId: null, groupName: '' };
}

const lane = (id: string, name: string, sortOrder: number) => type(id, name, { showOnCalendar: true, sortOrder });

function renderSection(
	searchQuery = '',
	rankCatalog: Promise<readonly RankCatalogEntry[]> = Promise.resolve(BUILT_IN_RANK_CATALOG)
) {
	return render(CalendarAssignmentSettingsSection, { props: { canMutate: true, searchQuery, rankCatalog } });
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
	store.saveRosterSettings.mockReset().mockImplementation(async (id: string) => store.types.find((t) => t.id === id));
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
			expect(store.updateType).toHaveBeenCalledWith(
				'runner',
				expect.objectContaining({ name: 'Runner (Day)' }),
				expect.any(String)
			)
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

	it('shows one message with the server reason when an edit is refused, keeping the dialog open', async () => {
		store.updateType.mockRejectedValue(
			await buildRequestError(
				Response.json({ message: 'Name must be 100 characters or fewer' }, { status: 400 }),
				'PUT',
				'assignment-types'
			)
		);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		renderSection();

		await openRowMenu('Staff Duty', 'Edit');
		const dialog = await screen.findByRole('dialog', { name: 'Edit Assignment Type' });
		await fireEvent.input(within(dialog).getByLabelText('Full name'), { target: { value: 'Staff Duty Officer' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		expect(errorToast.mock.calls).toEqual([['Name must be 100 characters or fewer']]);
		expect(screen.getByRole('dialog', { name: 'Edit Assignment Type' })).toBe(dialog);
		errorToast.mockRestore();
	});

	it('shows one message when a delete fails and keeps the type', async () => {
		store.removeType.mockResolvedValue(false);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		renderSection();

		await openRowMenu('Runner', 'Delete');
		await fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(errorToast).toHaveBeenCalled());
		expect(errorToast.mock.calls).toEqual([['Failed to delete assignment type']]);
		expect(listNames('Duty planner only')).toEqual(['Gate Guard', 'Runner']);
		errorToast.mockRestore();
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
		store.setCalendarLanes.mockClear().mockImplementation(async (ids: string[]) => {
			store.types = store.types.map((candidate) => {
				const rank = ids.indexOf(candidate.id);
				return { ...candidate, showOnCalendar: rank >= 0, sortOrder: Math.max(rank, 0) };
			});
			return { status: 'saved' };
		});
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(store.setCalendarLanes).toHaveBeenCalledTimes(1);
		expect(store.setCalendarLanes).toHaveBeenCalledWith(['sd', 'cq', 'new']);
		const shownIds = store.types
			.filter((candidate) => candidate.showOnCalendar)
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((candidate) => candidate.id);
		expect(shownIds.filter((id) => id === 'new')).toEqual(['new']);
		expect(store.addType).toHaveBeenCalledTimes(1);
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
		expect(alert.textContent).toMatch(/(couldn't|could not|can't|cannot|unable)\b[^.]*\bconfirm/i);
		expect(screen.getByRole('dialog', { name: 'Edit Assignment Type' })).toBe(dialog);
	});

	it('keeps an excusal out until it has a reason, and saves it without starting a new form', async () => {
		renderSection();
		await openRowMenu('Runner', 'Edit');
		const dialog = await screen.findByRole('dialog', { name: 'Edit Assignment Type' });

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Excuse someone' }));
		const excuse = await screen.findByRole('dialog', { name: 'Excuse someone' });
		await fireEvent.click(within(excuse).getByRole('button', { name: 'Person to excuse' }));
		await fireEvent.click(await screen.findByRole('option', { name: 'SGT Pike, Dana' }));
		await fireEvent.click(within(excuse).getByRole('button', { name: 'Excuse' }));
		expect(within(excuse).getByLabelText('Reason').getAttribute('aria-invalid')).toBe('true');
		expect(within(dialog).queryByRole('button', { name: 'Reinstate SGT Pike' })).toBeNull();

		await fireEvent.input(within(excuse).getByLabelText('Reason'), { target: { value: '  First sergeant ' } });
		await fireEvent.click(within(excuse).getByRole('button', { name: 'Excuse' }));
		expect(within(dialog).getByRole('button', { name: 'Reinstate SGT Pike' })).toBeTruthy();
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

		await waitFor(() =>
			expect(store.saveRosterSettings).toHaveBeenCalledWith(
				'runner',
				expect.objectContaining({ poolRules: null, excusals: [{ personId: 'p-pike', reason: 'First sergeant' }] })
			)
		);
		expect(screen.queryByRole('alertdialog')).toBeNull();
	});

	it('counts the people a rank range matches, minus anyone excused', async () => {
		roster.items = [
			person('p-pike', 'SGT', 'Pike', 'Dana'),
			person('p-kim', 'SPC', 'Kim', 'Jae-won'),
			person('p-ruiz', 'PFC', 'Ruiz', 'Ana'),
			person('p-ward', 'SSG', 'Ward', 'Lee')
		];
		store.types = [
			type('runner', 'Runner', { excusals: [{ personId: 'p-kim', reason: 'Profile', startsOn: '2026-01-01' }] })
		];
		renderSection();
		await openRowMenu('Runner', 'Edit');
		const dialog = await screen.findByRole('dialog', { name: 'Edit Assignment Type' });

		await fireEvent.click(await within(dialog).findByRole('radio', { name: 'Only people who match' }));
		await fireEvent.change(within(dialog).getByRole('combobox', { name: 'From rank' }), { target: { value: 'SGT' } });
		await fireEvent.change(within(dialog).getByRole('combobox', { name: 'Through rank' }), {
			target: { value: 'PFC' }
		});

		expect(within(dialog).getByRole('status').textContent).toMatch(/^\s*2\s+people on this roster/);
	});

	describe('a rule change on a saved roster', () => {
		beforeEach(() => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date(2026, 9, 17, 12));
		});
		afterEach(() => vi.useRealTimers());

		it('asks before starting a new DA 6 the day after Save is pressed, and saves only once confirmed', async () => {
			renderSection();
			await openRowMenu('Runner', 'Edit');
			const dialog = await screen.findByRole('dialog', { name: 'Edit Assignment Type' });

			await fireEvent.click(within(dialog).getByRole('radio', { name: 'Separate count' }));
			vi.setSystemTime(new Date(2026, 9, 18, 0, 5));
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
			const confirm = await screen.findByRole('alertdialog', { name: 'Start a new DA 6?' });
			expect(confirm.textContent).toContain('19 Oct');
			expect(store.saveRosterSettings).not.toHaveBeenCalled();

			await fireEvent.click(within(confirm).getByRole('button', { name: 'Save changes' }));
			await waitFor(() =>
				expect(store.saveRosterSettings).toHaveBeenCalledWith(
					'runner',
					expect.objectContaining({ weekendMode: 'separate', today: '2026-10-18' })
				)
			);
		});

		it('closes the DA 6 on the day Save is pressed when the type becomes a Group assignment', async () => {
			renderSection();
			await openRowMenu('Runner', 'Edit');
			const dialog = await screen.findByRole('dialog', { name: 'Edit Assignment Type' });

			await fireEvent.click(within(dialog).getByRole('radio', { name: 'Group' }));
			vi.setSystemTime(new Date(2026, 9, 18, 0, 5));
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

			await waitFor(() =>
				expect(store.updateType).toHaveBeenCalledWith(
					'runner',
					expect.objectContaining({ assignTo: 'group' }),
					'2026-10-18'
				)
			);
		});
	});

	describe('while the rank catalog', () => {
		async function openRunner(rankCatalog: Promise<readonly RankCatalogEntry[]>) {
			renderSection('', rankCatalog);
			await openRowMenu('Runner', 'Edit');
			return screen.findByRole('dialog', { name: 'Edit Assignment Type' });
		}

		it('loads, holds the rules editor behind a placeholder', async () => {
			const dialog = await openRunner(new Promise<readonly RankCatalogEntry[]>(() => {}));

			expect(within(dialog).getByRole('status')).toBeTruthy();
			expect(within(dialog).queryByRole('radio', { name: 'Only people who match' })).toBeNull();
			expect(within(dialog).getByRole('button', { name: 'Excuse someone' })).toBeTruthy();
		});

		it('fails, explains it, locks roster rules and weekends, and still saves an excusal', async () => {
			const dialog = await openRunner(Promise.reject(new Error('rank catalog unavailable')));

			expect((await within(dialog).findByRole('alert')).textContent?.replace(/\s+/g, ' ')).toContain(
				"roster rules, weekends and switching to Group can't change right now. Excusals still save."
			);
			expect((within(dialog).getByRole('radio', { name: 'Group' }) as HTMLButtonElement).disabled).toBe(true);
			expect(within(dialog).queryByRole('radio', { name: 'Only people who match' })).toBeNull();
			for (const name of ['Same count', 'Separate count', 'No duty'])
				expect((within(dialog).getByRole('radio', { name }) as HTMLButtonElement).disabled).toBe(true);

			await fireEvent.click(within(dialog).getByRole('button', { name: 'Excuse someone' }));
			const excuse = await screen.findByRole('dialog', { name: 'Excuse someone' });
			await fireEvent.click(within(excuse).getByRole('button', { name: 'Person to excuse' }));
			await fireEvent.click(await screen.findByRole('option', { name: 'SGT Pike, Dana' }));
			await fireEvent.input(within(excuse).getByLabelText('Reason'), { target: { value: 'First sergeant' } });
			await fireEvent.click(within(excuse).getByRole('button', { name: 'Excuse' }));
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

			await waitFor(() =>
				expect(store.saveRosterSettings).toHaveBeenCalledWith(
					'runner',
					expect.objectContaining({
						poolRules: null,
						weekendMode: 'same',
						excusals: [{ personId: 'p-pike', reason: 'First sergeant' }]
					})
				)
			);
			expect(screen.queryByRole('alertdialog')).toBeNull();
		});
	});

	it('leaves the Group choice open for a new type while the rank catalog failed', async () => {
		const view = renderSection('', Promise.reject(new Error('rank catalog unavailable')));
		view.component.openAddDialog();
		const dialog = await screen.findByRole('dialog', { name: 'Add Assignment Type' });

		await within(dialog).findByRole('alert');
		expect((within(dialog).getByRole('radio', { name: 'Group' }) as HTMLButtonElement).disabled).toBe(false);
	});

	it('shows no duty roster for a group assignment', async () => {
		store.types = [type('bay', 'Bay Cleanup', { assignTo: 'group' })];
		renderSection();
		await openRowMenu('Bay Cleanup', 'Edit');
		const dialog = await screen.findByRole('dialog', { name: 'Edit Assignment Type' });

		expect(within(dialog).queryByRole('region', { name: 'Duty roster' })).toBeNull();
		expect(within(dialog).queryByRole('button', { name: 'Excuse someone' })).toBeNull();
	});
});
