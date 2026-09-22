// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import AvailabilityModal from './AvailabilityModal.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { AvailabilityEntry, Personnel, StatusType } from '$lib/types';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const person: Personnel = {
	id: 'person-1',
	firstName: 'Alex',
	lastName: 'Smith',
	rank: 'SGT',
	groupId: 'group-1',
	groupName: 'Alpha',
	clinicRole: '',
	mos: '11B'
};

function renderModal(
	date: Date,
	overrides: {
		statusTypes?: StatusType[];
		existingEntries?: AvailabilityEntry[];
		onAdd?: (data: Omit<AvailabilityEntry, 'id'>) => void;
		onRemove?: (id: string) => void;
	} = {}
) {
	return render(AvailabilityModal, {
		props: {
			person,
			date,
			statusTypes: overrides.statusTypes ?? [],
			existingEntries: overrides.existingEntries ?? [],
			onAdd: overrides.onAdd ?? vi.fn(),
			onRemove: overrides.onRemove ?? vi.fn(),
			onClose: vi.fn()
		}
	});
}

describe('AvailabilityModal — status type select', () => {
	const statusTypes: StatusType[] = [
		{ id: 'leave', name: 'Leave', color: '#48bb78', textColor: '#ffffff', da6TreatmentReviewed: true },
		{ id: 'tdy', name: 'TDY', color: '#9f7aea', textColor: '#ffffff', da6TreatmentReviewed: true }
	];

	it('selects a status type before adding status', async () => {
		const onAdd = vi.fn();
		renderModal(new Date(2026, 3, 7), { statusTypes, onAdd });

		await fireEvent.pointerDown(screen.getByRole('button', { name: /Status Type/i }));
		const tdyOption = screen.getByRole('option', { name: 'TDY' });
		await fireEvent.pointerDown(tdyOption);
		await fireEvent.pointerUp(tdyOption);
		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));

		expect(onAdd).toHaveBeenCalledWith({
			personnelId: 'person-1',
			statusTypeId: 'tdy',
			startDate: '2026-04-07',
			endDate: '2026-04-07',
			note: null
		});
	});
});

describe('AvailabilityModal — edit status feedback', () => {
	const statusTypes: StatusType[] = [
		{ id: 'leave', name: 'Leave', color: '#48bb78', textColor: '#ffffff', da6TreatmentReviewed: true }
	];

	it('shows an updated toast after editing an existing status entry', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const existingEntries: AvailabilityEntry[] = [
			{
				id: 'entry-1',
				personnelId: 'person-1',
				statusTypeId: 'leave',
				startDate: '2026-04-07',
				endDate: '2026-04-07',
				note: null
			}
		];

		renderModal(new Date(2026, 3, 7), { statusTypes, existingEntries });

		await fireEvent.click(screen.getByRole('button', { name: 'Edit status' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

		expect(successToast).toHaveBeenCalledWith('Leave updated — Apr 7', 5000);
	});
});
