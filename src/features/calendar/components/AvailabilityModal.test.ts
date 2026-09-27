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
		onUpdate?: (
			id: string,
			changes: Pick<AvailabilityEntry, 'statusTypeId' | 'startDate' | 'endDate' | 'note'>
		) => Promise<AvailabilityEntry | null>;
		onRemove?: (id: string) => Promise<boolean>;
		onReconcile?: (dates: string[], expectedOrgId: string) => Promise<AvailabilityEntry[] | null>;
	} = {}
) {
	return render(AvailabilityModal, {
		props: {
			orgId: 'org-a',
			person,
			date,
			statusTypes: overrides.statusTypes ?? [],
			existingEntries: overrides.existingEntries ?? [],
			onAdd: overrides.onAdd ?? vi.fn(async (data: Omit<AvailabilityEntry, 'id'>) => ({ id: 'saved-entry', ...data })),
			onUpdate:
				overrides.onUpdate ??
				vi.fn(
					async (id: string, changes: Pick<AvailabilityEntry, 'statusTypeId' | 'startDate' | 'endDate' | 'note'>) => ({
						id,
						personnelId: person.id,
						...changes
					})
				),
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
		expect(onReconcile).toHaveBeenCalledWith(['2026-04-07'], 'org-a');
		expect(screen.queryByText('Current Status')).toBeNull();
	});

	it('recognizes a saved addition after its response is lost', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const onReconcile = vi.fn().mockResolvedValue([{ ...existingEntry, id: 'saved-after-timeout' }]);
		renderModal(new Date(2026, 3, 7), {
			statusTypes,
			onAdd: vi.fn().mockRejectedValue(new Error('Response lost')),
			onReconcile
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));

		await waitFor(() => expect(successToast).toHaveBeenCalledWith('Leave added — Apr 7', 5000));
		expect(errorToast).not.toHaveBeenCalled();
		expect(onReconcile).toHaveBeenCalledWith(['2026-04-07'], 'org-a');
	});

	it('shows an unconfirmed state when both the write and refresh fail', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		renderModal(new Date(2026, 3, 7), {
			statusTypes,
			onAdd: vi.fn().mockRejectedValue(new Error('Response lost')),
			onReconcile: vi.fn().mockRejectedValue(new Error('Refresh unavailable'))
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Saved status could not be confirmed'));
		expect(screen.getByRole('button', { name: 'Add Status' })).toHaveProperty('disabled', true);
		expect(errorToast).toHaveBeenCalled();
		expect(successToast).not.toHaveBeenCalled();
	});

	it('keeps a stale-access warning inside the open modal without a global toast', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		renderModal(new Date(2026, 3, 7), {
			statusTypes,
			onAdd: vi.fn().mockRejectedValue(new Error('Response lost')),
			onReconcile: vi.fn().mockResolvedValue(null)
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Reload the calendar'));
		expect(screen.getByRole('button', { name: 'Add Status' })).toHaveProperty('disabled', true);
		expect(errorToast).not.toHaveBeenCalled();
		expect(successToast).not.toHaveBeenCalled();
	});

	it('does not publish old-scope feedback after the modal closes during reconciliation', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		let resolveReconcile!: (entries: AvailabilityEntry[] | null) => void;
		const onReconcile = vi.fn(() => new Promise<AvailabilityEntry[] | null>((resolve) => (resolveReconcile = resolve)));
		const { unmount } = renderModal(new Date(2026, 3, 7), {
			statusTypes,
			onAdd: vi.fn().mockRejectedValue(new Error('Response lost')),
			onReconcile
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));
		await waitFor(() => expect(onReconcile).toHaveBeenCalledOnce());
		unmount();
		resolveReconcile(null);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(errorToast).not.toHaveBeenCalled();
		expect(successToast).not.toHaveBeenCalled();
	});

	it('waits for the replacement write before announcing an edit', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		let resolveUpdate!: (entry: AvailabilityEntry) => void;
		const onUpdate = vi.fn(() => new Promise<AvailabilityEntry>((resolve) => (resolveUpdate = resolve)));
		const onAdd = vi.fn();
		const onRemove = vi.fn();
		renderModal(new Date(2026, 3, 7), {
			statusTypes,
			existingEntries: [existingEntry],
			onRemove,
			onUpdate,
			onAdd
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit status' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

		await waitFor(() =>
			expect(onUpdate).toHaveBeenCalledWith(existingEntry.id, {
				statusTypeId: 'leave',
				startDate: '2026-04-07',
				endDate: '2026-04-07',
				note: null
			})
		);
		expect(successToast).not.toHaveBeenCalled();
		resolveUpdate(existingEntry);
		await waitFor(() => expect(successToast).toHaveBeenCalledWith('Leave updated — Apr 7', 5000));
		expect(onAdd).not.toHaveBeenCalled();
		expect(onRemove).not.toHaveBeenCalled();
	});

	it('shows one saved status when the bound entries refresh before an edit returns', async () => {
		const savedEntry = { ...existingEntry, note: 'Saved edit' };
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		let resolveUpdate!: (entry: AvailabilityEntry) => void;
		const onUpdate = vi.fn(() => new Promise<AvailabilityEntry>((resolve) => (resolveUpdate = resolve)));
		const view = renderModal(new Date(2026, 3, 7), {
			statusTypes,
			existingEntries: [existingEntry],
			onUpdate
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit status' }));
		await fireEvent.input(screen.getByLabelText('Note'), { target: { value: savedEntry.note } });
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));
		await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce());
		await view.rerender({ existingEntries: [savedEntry] });
		resolveUpdate(savedEntry);

		await waitFor(() => expect(successToast).toHaveBeenCalledWith('Leave updated — Apr 7', 5000));
		expect(screen.getAllByRole('button', { name: 'Edit status' })).toHaveLength(1);
		expect(screen.getByText('Saved edit')).toBeTruthy();
	});

	it('does not publish edit feedback after closing while the single update is pending', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		let resolveUpdate!: (entry: AvailabilityEntry) => void;
		const onUpdate = vi.fn(() => new Promise<AvailabilityEntry>((resolve) => (resolveUpdate = resolve)));
		const onAdd = vi.fn();
		const onRemove = vi.fn();
		const { unmount } = renderModal(new Date(2026, 3, 7), {
			statusTypes,
			existingEntries: [existingEntry],
			onRemove,
			onUpdate,
			onAdd
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit status' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));
		await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce());
		unmount();
		resolveUpdate(existingEntry);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(onAdd).not.toHaveBeenCalled();
		expect(onRemove).not.toHaveBeenCalled();
		expect(successToast).not.toHaveBeenCalled();
		expect(errorToast).not.toHaveBeenCalled();
	});

	it('keeps the edit dialog open while saving the update', async () => {
		let resolveUpdate!: (entry: AvailabilityEntry) => void;
		const onUpdate = vi.fn(() => new Promise<AvailabilityEntry>((resolve) => (resolveUpdate = resolve)));
		renderModal(new Date(2026, 3, 7), {
			statusTypes,
			existingEntries: [existingEntry],
			onUpdate
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit status' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));
		await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce());
		expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Cancel Edit' })).toHaveProperty('disabled', true);
		await fireEvent.keyDown(document, { key: 'Escape' });
		expect(screen.getByRole('dialog', { name: 'Set Personnel Status' })).toBeTruthy();

		resolveUpdate(existingEntry);
	});

	it('restores the previous status when an edit fails', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const onReconcile = vi.fn().mockResolvedValue([existingEntry]);
		renderModal(new Date(2026, 3, 7), {
			statusTypes,
			existingEntries: [existingEntry],
			onUpdate: vi.fn().mockRejectedValue(new Error('Save failed')),
			onReconcile
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit status' }));
		await fireEvent.input(screen.getByLabelText('Note'), { target: { value: 'Changed' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

		await waitFor(() => expect(errorToast).toHaveBeenCalledWith(expect.stringContaining('Could not save status')));
		expect(successToast).not.toHaveBeenCalled();
		expect(onReconcile).toHaveBeenCalledWith(['2026-04-07'], 'org-a');
		expect(screen.getByRole('button', { name: 'Edit status' })).toBeTruthy();
	});

	it('confirms an edited row by its retained ID when the update response is lost', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const onReconcile = vi.fn().mockResolvedValue([{ ...existingEntry, note: 'Changed' }]);
		renderModal(new Date(2026, 3, 7), {
			statusTypes,
			existingEntries: [existingEntry],
			onUpdate: vi.fn().mockRejectedValue(new Error('Response lost')),
			onReconcile
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit status' }));
		await fireEvent.input(screen.getByLabelText('Note'), { target: { value: 'Changed' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

		await waitFor(() => expect(successToast).toHaveBeenCalledWith('Leave updated — Apr 7', 5000));
		expect(onReconcile).toHaveBeenCalledWith(['2026-04-07'], 'org-a');
		expect(errorToast).not.toHaveBeenCalled();
	});
});
