// @vitest-environment happy-dom
import type { ComponentProps } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { CalendarRangeData } from '$features/calendar/calendar.types';
import type { Personnel } from '$features/personnel/contracts';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import { toastStore } from '$lib/stores/toast.svelte';
import { StoreRequestError } from '$lib/stores/core';
import { CalendarRangeCoordinator } from '$features/calendar/contexts/CalendarRangeCoordinator.svelte';
import BulkStatusAdd from './BulkStatusAdd.svelte';

vi.mock('$lib/components/ui/date-picker', async () => ({
	DatePicker: (await import('../test-support/DatePickerInputStub.svelte')).default
}));

function person(id: string, lastName: string): Personnel {
	return {
		id,
		rank: 'SPC',
		lastName,
		firstName: 'Pat',
		mos: '68W',
		clinicRole: '',
		groupId: 'alpha',
		groupName: 'Alpha'
	};
}

const able = person('person-able', 'Able');
const baker = person('person-baker', 'Baker');
const cole = person('person-cole', 'Cole');
const roster = [{ group: 'Alpha', personnel: [able, baker, cole] }];

const statusTypes: StatusType[] = [
	{ id: 'leave', name: 'Leave', color: '#166534', textColor: '#ffffff', shortLabel: null, sortOrder: 0 },
	{ id: 'training', name: 'Training', color: '#2563eb', textColor: '#ffffff', shortLabel: null, sortOrder: 1 }
];

const START = '2026-09-22';
const END = '2026-09-24';

// Baker already has Training on the first day; Cole is already on Leave for the last two.
const entries: AvailabilityEntry[] = [
	{ id: 'e1', personnelId: baker.id, statusTypeId: 'training', startDate: START, endDate: START, note: null },
	{ id: 'e2', personnelId: cole.id, statusTypeId: 'leave', startDate: '2026-09-23', endDate: '2026-09-30', note: null }
];

function rangeData(range: { rangeStart: string; rangeEnd: string }): CalendarRangeData {
	return { ...range, availabilityEntries: [], specialDays: [], dailyAssignments: [] };
}

type Apply = ComponentProps<typeof BulkStatusAdd>['onApply'];

function renderAdd(
	options: {
		onApply?: Apply;
		onComplete?: () => void;
		loadRange?: NonNullable<ConstructorParameters<typeof CalendarRangeCoordinator>[0]>['loadRange'];
		loaded?: boolean;
	} = {}
) {
	const onApply = options.onApply ?? vi.fn<Apply>();
	const onComplete = options.onComplete ?? vi.fn<() => void>();
	const rangeCoordinator = new CalendarRangeCoordinator({
		loadRange: options.loadRange ?? (async (_orgId, range) => rangeData(range)),
		mergeRangeIntoStores: vi.fn()
	});
	if (options.loaded !== false) rangeCoordinator.includeBootstrap({ rangeStart: '2026-09-01', rangeEnd: '2026-10-31' });
	render(BulkStatusAdd, {
		props: {
			personnelByGroup: roster,
			statusTypes,
			availabilityEntries: entries,
			orgId: 'org-1',
			rangeCoordinator,
			onApply,
			onComplete
		}
	});
	return { onApply, onComplete, rangeCoordinator };
}

async function setDates(start: string, end: string) {
	await fireEvent.input(screen.getByLabelText('Start date'), { target: { value: start } });
	await fireEvent.input(screen.getByLabelText('End date'), { target: { value: end } });
}

const addButton = () => screen.getByRole('button', { name: /^Add to \d+ (person|people)$/ }) as HTMLButtonElement;
const addCount = () => Number(addButton().textContent?.match(/\d+/)?.[0]);
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLButtonElement;
const chip = (name: string) => screen.getByRole('radio', { name });

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it('locks the draft and roster while saving, then retries only the failed Person with the same criteria', async () => {
	vi.spyOn(toastStore, 'error').mockImplementation(() => 'error-toast');
	vi.spyOn(toastStore, 'success').mockImplementation(() => 'success-toast');
	let finishFirst!: (inserted: string[]) => void;
	const onApply = vi
		.fn<Apply>()
		.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
		.mockResolvedValueOnce([baker.id]);
	const { onComplete } = renderAdd({ onApply });
	await fireEvent.click(chip('Training'));
	await setDates('2026-10-05', '2026-10-07');
	await fireEvent.input(screen.getByLabelText('Note'), { target: { value: '  Retry without duplicates  ' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Select available' }));
	await waitFor(() => expect(addButton().disabled).toBe(false));
	await fireEvent.click(addButton());

	const locked = [
		chip('Leave'),
		chip('Training'),
		screen.getByLabelText('Start date'),
		screen.getByLabelText('End date'),
		screen.getByLabelText('Note'),
		checkbox('Select SPC Able, Pat'),
		checkbox('Select SPC Baker, Pat'),
		checkbox('Select Alpha group')
	] as HTMLButtonElement[];
	expect(locked.map((control) => control.disabled)).toEqual(locked.map(() => true));

	finishFirst([able.id, cole.id]);
	await waitFor(() => expect(addCount()).toBe(1));
	expect(onComplete).not.toHaveBeenCalled();
	expect(checkbox('Select SPC Able, Pat').getAttribute('aria-checked')).toBe('false');
	expect(checkbox('Select SPC Baker, Pat').getAttribute('aria-checked')).toBe('true');
	expect(chip('Training').getAttribute('aria-checked')).toBe('true');
	expect((screen.getByLabelText('Start date') as HTMLInputElement).value).toBe('2026-10-05');
	expect((screen.getByLabelText('End date') as HTMLInputElement).value).toBe('2026-10-07');
	expect((screen.getByLabelText('Note') as HTMLInputElement).value).toBe('  Retry without duplicates  ');

	await fireEvent.click(addButton());

	await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
	expect(onApply.mock.calls).toEqual([
		[[able.id, baker.id, cole.id], 'training', '2026-10-05', '2026-10-07', 'Retry without duplicates'],
		[[baker.id], 'training', '2026-10-05', '2026-10-07', 'Retry without duplicates']
	]);
});

it('keeps the draft and selection and shows the server reason when the batch is refused', async () => {
	const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'error-toast');
	const onApply = vi
		.fn()
		.mockRejectedValue(new StoreRequestError('End date must be on or after the start date', 400, true));
	const { onComplete } = renderAdd({ onApply });
	await setDates('2026-10-05', '2026-10-07');
	await fireEvent.click(checkbox('Select SPC Able, Pat'));
	await waitFor(() => expect(addButton().disabled).toBe(false));

	await fireEvent.click(addButton());

	await waitFor(() =>
		expect(errorToast).toHaveBeenCalledExactlyOnceWith('End date must be on or after the start date')
	);
	expect(addButton().disabled).toBe(false);
	expect(checkbox('Select SPC Able, Pat').getAttribute('aria-checked')).toBe('true');
	expect(onComplete).not.toHaveBeenCalled();
});

it.each(['Start date', 'End date'])('cannot add while %s is cleared', async (label) => {
	renderAdd();
	await fireEvent.click(checkbox('Select SPC Able, Pat'));

	await fireEvent.input(screen.getByLabelText(label), { target: { value: '' } });

	expect(screen.getByRole('alert')).toBeTruthy();
	expect(screen.queryByText(/Invalid Date/)).toBeNull();
	expect(addButton().disabled).toBe(true);
});

it('cannot add until the read of the chosen dates finishes', async () => {
	let finish!: (data: CalendarRangeData) => void;
	renderAdd({
		loaded: false,
		loadRange: (_orgId, range) =>
			new Promise((resolve) => {
				finish = () => resolve(rangeData(range));
			})
	});
	await setDates('2026-10-05', '2026-10-07');
	await fireEvent.click(checkbox('Select SPC Able, Pat'));

	expect(addButton().disabled).toBe(true);
	finish(rangeData({ rangeStart: '2026-10-05', rangeEnd: '2026-10-07' }));

	await waitFor(() => expect(addButton().disabled).toBe(false));
});

it('ignores the late reply for earlier dates when the dates changed while it was loading', async () => {
	const pending = new Map<string, () => void>();
	renderAdd({
		loaded: false,
		loadRange: (_orgId, range) =>
			new Promise((resolve) => {
				pending.set(range.rangeStart, () => resolve(rangeData(range)));
			})
	});
	await fireEvent.click(checkbox('Select SPC Able, Pat'));
	await setDates('2026-10-05', '2026-10-07');
	await waitFor(() => expect(pending.has('2026-10-05')).toBe(true));
	await setDates('2026-11-02', '2026-11-04');
	await waitFor(() => expect(pending.has('2026-11-02')).toBe(true));

	pending.get('2026-10-05')!();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(addButton().disabled).toBe(true);

	pending.get('2026-11-02')!();
	await waitFor(() => expect(addButton().disabled).toBe(false));
});

it('offers Retry when the read fails and re-enables adding once it succeeds', async () => {
	const loadRange = vi
		.fn<(orgId: string, range: { rangeStart: string; rangeEnd: string }) => Promise<CalendarRangeData>>()
		.mockRejectedValueOnce(new Error('offline'))
		.mockImplementation(async (_orgId, range) => rangeData(range));
	renderAdd({ loaded: false, loadRange });
	await fireEvent.click(checkbox('Select SPC Able, Pat'));

	const retry = await screen.findByRole('button', { name: 'Retry' });
	expect(addButton().disabled).toBe(true);

	await fireEvent.click(retry);

	await waitFor(() => expect(addButton().disabled).toBe(false));
	expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
});

it('adds exactly the available people when Select available is used, skipping both kinds of overlap', async () => {
	const onApply = vi.fn().mockResolvedValue([able.id]);
	renderAdd({ onApply });
	await setDates(START, END);

	await fireEvent.click(screen.getByRole('button', { name: 'Select available' }));
	await waitFor(() => expect(addButton().disabled).toBe(false));
	await fireEvent.click(addButton());

	await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
	expect(onApply.mock.calls[0].slice(0, 2)).toEqual([[able.id], 'leave']);
});

it('adds a person who overlaps another status when picked by hand', async () => {
	const onApply = vi.fn().mockResolvedValue([able.id, baker.id]);
	renderAdd({ onApply });
	await setDates(START, END);

	await fireEvent.click(checkbox('Select SPC Able, Pat'));
	await fireEvent.click(checkbox('Select SPC Baker, Pat'));
	await waitFor(() => expect(addButton().disabled).toBe(false));
	await fireEvent.click(addButton());

	await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
	expect(onApply.mock.calls[0].slice(0, 2)).toEqual([[able.id, baker.id], 'leave']);
});

it('drops a selected person from the batch when a status change makes them blocked, keeping the draft', async () => {
	const onApply = vi.fn().mockResolvedValue([able.id]);
	renderAdd({ onApply });
	await setDates(START, END);
	await fireEvent.click(chip('Training'));
	await fireEvent.input(screen.getByLabelText('Note'), { target: { value: 'Range week' } });
	await fireEvent.click(checkbox('Select SPC Able, Pat'));
	await fireEvent.click(checkbox('Select SPC Cole, Pat'));
	await waitFor(() => expect(addCount()).toBe(2));

	await fireEvent.click(chip('Leave'));
	await waitFor(() => expect(addCount()).toBe(1));
	await fireEvent.click(addButton());

	await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
	expect(onApply).toHaveBeenCalledWith([able.id], 'leave', START, END, 'Range week');
});

it('shows the overlap warning only for the people who would be added', async () => {
	renderAdd();
	await setDates(START, END);
	await fireEvent.click(checkbox('Select SPC Baker, Pat'));
	const summary = screen.getByRole('region', { name: 'Bulk add summary' });
	expect(within(summary).getByText(/Training/).textContent).toMatch(/\b1\b/);

	await fireEvent.click(checkbox('Select SPC Baker, Pat'));

	expect(within(summary).queryByText(/Training/)).toBeNull();
});
