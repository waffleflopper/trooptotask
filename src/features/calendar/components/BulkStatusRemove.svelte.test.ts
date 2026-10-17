// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { formatDate } from '$lib/utils/dates';
import type { Personnel } from '$features/personnel/contracts';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import { toastStore } from '$lib/stores/toast.svelte';
import BulkStatusRemove from './BulkStatusRemove.svelte';

vi.mock('$lib/components/ui/date-picker', async () => ({
	DatePicker: (await import('../test-support/DatePickerInputStub.svelte')).default
}));

const person: Personnel = {
	id: 'p1',
	rank: 'SGT',
	lastName: 'Able',
	firstName: 'Ann',
	mos: '11B',
	clinicRole: '',
	groupId: 'group-1',
	groupName: 'Alpha'
};

const leave: StatusType = {
	id: 'leave',
	name: 'Leave',
	color: '#48bb78',
	textColor: '#ffffff',
	shortLabel: null,
	sortOrder: 0
};

function availabilityEntry(overrides: Partial<AvailabilityEntry> = {}): AvailabilityEntry {
	const today = formatDate(new Date());
	return {
		id: 'availability-1',
		personnelId: person.id,
		statusTypeId: leave.id,
		startDate: today,
		endDate: today,
		note: null,
		...overrides
	};
}

function renderRemove(overrides: Partial<Parameters<typeof render>[1]['props']> = {}) {
	return render(BulkStatusRemove, {
		props: {
			personnelByGroup: [{ group: 'Alpha', personnel: [person] }],
			statusTypes: [leave],
			availabilityEntries: [],
			personnelList: [person],
			onRemove: vi.fn(),
			onComplete: vi.fn(),
			...overrides
		}
	});
}

function formatDateDisplay(dateStr: string): string {
	const date = new Date(dateStr + 'T00:00:00');
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function setDate(label: string, value: string) {
	await fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

async function selectPersonAndReview() {
	await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SGT Able, Ann' }));
	const reviewButton = screen.getByRole('button', { name: 'Review Matching Entries' }) as HTMLButtonElement;

	await waitFor(() => {
		expect(reviewButton.disabled).toBe(false);
	});
	await fireEvent.click(reviewButton);
}

describe('BulkStatusRemove', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('loads the selected date range before classifying matching entries', async () => {
		const today = formatDate(new Date());
		const loadAvailabilityRange = vi.fn().mockResolvedValue([availabilityEntry()]);

		renderRemove({ loadAvailabilityRange });

		await selectPersonAndReview();

		await waitFor(() => {
			expect(loadAvailabilityRange).toHaveBeenCalledWith({ rangeStart: today, rangeEnd: today });
		});
		await waitFor(() => {
			expect(screen.getByText(/exact match will be removed/)).toBeTruthy();
		});
		expect(screen.queryByText('No matching status entries were found for the selected criteria.')).toBeNull();
	});

	async function confirmRemoval() {
		await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm Removal' })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm Removal' }));
	}

	it('reports the count the server deleted when another session removed one of the matches', async () => {
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const onRemove = vi.fn().mockResolvedValue({ kind: 'removed', deleted: 1 });
		const onComplete = vi.fn();
		renderRemove({
			loadAvailabilityRange: vi
				.fn()
				.mockResolvedValue([availabilityEntry({ id: 'availability-1' }), availabilityEntry({ id: 'availability-2' })]),
			onRemove,
			onComplete
		});

		await selectPersonAndReview();
		await confirmRemoval();

		await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
		expect(onRemove).toHaveBeenCalledWith(['availability-1', 'availability-2']);
		expect(success.mock.calls[0][0]).toMatch(/^Removed 1 status entry/);
	});

	it('treats a removal that deleted nothing as complete and reports zero', async () => {
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const error = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const onComplete = vi.fn();
		renderRemove({
			loadAvailabilityRange: vi.fn().mockResolvedValue([availabilityEntry()]),
			onRemove: vi.fn().mockResolvedValue({ kind: 'removed', deleted: 0 }),
			onComplete
		});

		await selectPersonAndReview();
		await confirmRemoval();

		await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
		expect(success.mock.calls[0][0]).toMatch(/^Removed 0 status entries/);
		expect(error).not.toHaveBeenCalled();
	});

	it('reports a failed removal without completing so the review can be retried', async () => {
		const error = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const onComplete = vi.fn();
		renderRemove({
			loadAvailabilityRange: vi.fn().mockResolvedValue([availabilityEntry()]),
			onRemove: vi.fn().mockResolvedValue({ kind: 'failed' }),
			onComplete
		});

		await selectPersonAndReview();
		await confirmRemoval();

		await waitFor(() => expect(error).toHaveBeenCalled());
		expect(onComplete).not.toHaveBeenCalled();
		expect((screen.getByRole('button', { name: 'Confirm Removal' }) as HTMLButtonElement).disabled).toBe(false);
	});

	it('keeps the no-matches state hidden when selected range loading fails', async () => {
		const loadAvailabilityRange = vi.fn().mockRejectedValue(new Error('boom'));

		renderRemove({ loadAvailabilityRange });

		await selectPersonAndReview();

		await waitFor(() => {
			expect(screen.getByRole('alert')).toBeTruthy();
		});
		expect(screen.getByText('Unable to load status entries for the selected date range. Try again.')).toBeTruthy();
		expect(screen.queryByText('No matching status entries were found for the selected criteria.')).toBeNull();
		expect(screen.getByRole('button', { name: 'Review Matching Entries' })).toBeTruthy();
	});

	it('disables review while the selected range is loading', async () => {
		let resolveRange: ((entries: AvailabilityEntry[]) => void) | undefined;
		const loadAvailabilityRange = vi.fn(
			() =>
				new Promise<AvailabilityEntry[]>((resolve) => {
					resolveRange = resolve;
				})
		);

		renderRemove({ loadAvailabilityRange });

		await selectPersonAndReview();

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /Loading entries/ })).toBeTruthy();
		});
		expect((screen.getByRole('button', { name: /Loading entries/ }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.queryByText('No matching status entries were found for the selected criteria.')).toBeNull();

		resolveRange?.([availabilityEntry()]);

		await waitFor(() => {
			expect(screen.getByText(/exact match will be removed/)).toBeTruthy();
		});
	});

	it('reviews against the criteria captured before async range loading resolves', async () => {
		const today = formatDate(new Date());
		let resolveRange: ((entries: AvailabilityEntry[]) => void) | undefined;
		const loadAvailabilityRange = vi.fn(
			() =>
				new Promise<AvailabilityEntry[]>((resolve) => {
					resolveRange = resolve;
				})
		);

		renderRemove({ loadAvailabilityRange });

		await selectPersonAndReview();
		await setDate('Start Date', '2026-02-01');
		await setDate('End Date', '2026-02-01');

		resolveRange?.([availabilityEntry({ startDate: today, endDate: today })]);

		await waitFor(() => {
			expect(screen.getByText(/exact match will be removed/)).toBeTruthy();
		});
		expect(screen.getByText(formatDateDisplay(today))).toBeTruthy();
		expect(screen.queryByText(formatDateDisplay('2026-02-01'))).toBeNull();
	});

	it('blocks ranges longer than the calendar range endpoint supports', async () => {
		renderRemove();

		await setDate('Start Date', '2026-01-01');
		await setDate('End Date', '2027-01-02');
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SGT Able, Ann' }));

		expect(screen.getAllByText('Remove date range cannot exceed 366 days')).toHaveLength(2);
		expect((screen.getByRole('button', { name: 'Review Matching Entries' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it.each([
		['Start Date', 'Choose a start date'],
		['End Date', 'Choose an end date']
	])('guides instead of summarizing an Invalid Date when %s is cleared', async (label, guidance) => {
		renderRemove();
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SGT Able, Ann' }));

		await setDate(label, '');

		expect(screen.queryByText(/Invalid Date/)).toBeNull();
		expect(screen.getAllByText(guidance)).toHaveLength(2);
		expect((screen.getByRole('button', { name: 'Review Matching Entries' }) as HTMLButtonElement).disabled).toBe(true);
	});
});
