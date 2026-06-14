// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { formatDate } from '$lib/utils/dates';
import type { AvailabilityEntry, Personnel, StatusType } from '$lib/types';
import BulkStatusRemove from './BulkStatusRemove.svelte';

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
	da6TreatmentReviewed: true
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
});
