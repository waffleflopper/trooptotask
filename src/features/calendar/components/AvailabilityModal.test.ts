// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
		onAdd?: (data: Omit<AvailabilityEntry, 'id'>) => Promise<AvailabilityEntry | null>;
		onRemove?: (id: string) => Promise<boolean>;
		onReconcile?: (date: string) => Promise<AvailabilityEntry[] | null>;
	} = {}
) {
	return render(AvailabilityModal, {
		props: {
			person,
			date,
			statusTypes: overrides.statusTypes ?? [],
			existingEntries: overrides.existingEntries ?? [],
			onAdd: overrides.onAdd ?? vi.fn().mockResolvedValue(null),
			onRemove: overrides.onRemove ?? vi.fn().mockResolvedValue(true),
			onReconcile: overrides.onReconcile ?? vi.fn().mockResolvedValue(overrides.existingEntries ?? []),
			onClose: vi.fn()
		}
	});
}

describe('AvailabilityModal — status type select', () => {
	const statusTypes: StatusType[] = [
		{ id: 'leave', name: 'Leave', color: '#48bb78', textColor: '#ffffff' },
		{ id: 'tdy', name: 'TDY', color: '#9f7aea', textColor: '#ffffff' }
	];

	it('selects a status type before adding status', async () => {
		const onAdd = vi.fn().mockResolvedValue({
			id: 'saved-entry',
			personnelId: person.id,
			statusTypeId: 'tdy',
			startDate: '2026-04-07',
			endDate: '2026-04-07',
			note: null
		});
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

describe('AvailabilityModal — saved status feedback', () => {
	const statusTypes: StatusType[] = [{ id: 'leave', name: 'Leave', color: '#48bb78', textColor: '#ffffff' }];
	const existingEntry: AvailabilityEntry = {
		id: 'entry-1',
		personnelId: 'person-1',
		statusTypeId: 'leave',
		startDate: '2026-04-07',
		endDate: '2026-04-07',
		note: null
	};

	it('keeps the optimistic addition but waits for persistence before announcing success', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		let resolveAdd!: (entry: AvailabilityEntry) => void;
		const onAdd = vi.fn(() => new Promise<AvailabilityEntry>((resolve) => (resolveAdd = resolve)));
		renderModal(new Date(2026, 3, 7), { statusTypes, onAdd });

		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));

		expect(onAdd).toHaveBeenCalledOnce();
		expect(screen.getByText('Current Status')).toBeTruthy();
		expect(successToast).not.toHaveBeenCalled();
		resolveAdd(existingEntry);
		await waitFor(() => expect(successToast).toHaveBeenCalledWith('Leave added — Apr 7', 5000));
	});

	it('restores the displayed entry and reports an error when removal is rejected', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		let resolveRemove!: (removed: boolean) => void;
		const onRemove = vi.fn(() => new Promise<boolean>((resolve) => (resolveRemove = resolve)));
		renderModal(new Date(2026, 3, 7), { statusTypes, existingEntries: [existingEntry], onRemove });

		await fireEvent.click(screen.getByRole('button', { name: 'Remove status' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		expect(onRemove).toHaveBeenCalledWith(existingEntry.id);
		expect(successToast).not.toHaveBeenCalled();
		resolveRemove(false);
		await waitFor(() => expect(errorToast).toHaveBeenCalled());
		expect(screen.getByRole('button', { name: 'Remove status' })).toBeTruthy();
	});

	it('removes an optimistic addition when the saved write fails', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const onReconcile = vi.fn().mockResolvedValue([]);
		renderModal(new Date(2026, 3, 7), {
			statusTypes,
			onAdd: vi.fn().mockRejectedValue(new Error('Save failed')),
			onReconcile
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));

		await waitFor(() => expect(errorToast).toHaveBeenCalled());
		expect(successToast).not.toHaveBeenCalled();
		expect(onReconcile).toHaveBeenCalledWith('2026-04-07');
		expect(screen.queryByText('Current Status')).toBeNull();
	});

	it('waits for the replacement write before announcing an edit', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		let resolveAdd!: (entry: AvailabilityEntry) => void;
		const onAdd = vi.fn(() => new Promise<AvailabilityEntry>((resolve) => (resolveAdd = resolve)));
		renderModal(new Date(2026, 3, 7), {
			statusTypes,
			existingEntries: [existingEntry],
			onRemove: vi.fn().mockResolvedValue(true),
			onAdd
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit status' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

		await waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
		expect(successToast).not.toHaveBeenCalled();
		resolveAdd({ ...existingEntry, id: 'entry-2' });
		await waitFor(() => expect(successToast).toHaveBeenCalledWith('Leave updated — Apr 7', 5000));
	});

	it('shows the persisted deletion when an edit fails after removing its old entry', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const onReconcile = vi.fn().mockResolvedValue([]);
		renderModal(new Date(2026, 3, 7), {
			statusTypes,
			existingEntries: [existingEntry],
			onRemove: vi.fn().mockResolvedValue(true),
			onAdd: vi.fn().mockRejectedValue(new Error('Save failed')),
			onReconcile
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit status' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

		await waitFor(() => expect(errorToast).toHaveBeenCalledWith(expect.stringContaining('replacement')));
		expect(successToast).not.toHaveBeenCalled();
		expect(onReconcile).toHaveBeenCalledWith('2026-04-07');
		expect(screen.queryByRole('button', { name: 'Edit status' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Add Status' })).toBeTruthy();
	});
});
