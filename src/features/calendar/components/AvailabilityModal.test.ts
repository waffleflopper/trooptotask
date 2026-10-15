// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import AvailabilityModal from './AvailabilityModal.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import type {
	AvailabilityEditorRequest,
	AvailabilityOutcome
} from '$features/calendar/contexts/CalendarPageContext.svelte';
import type { AvailabilityChange } from '$features/calendar/utils/availabilityMutation';

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
const statusTypes: StatusType[] = [
	{ id: 'leave', name: 'Leave', color: '#48bb78', textColor: '#ffffff', shortLabel: null, sortOrder: 0 },
	{ id: 'tdy', name: 'TDY', color: '#9f7aea', textColor: '#ffffff', shortLabel: null, sortOrder: 1 }
];
const existingEntry: AvailabilityEntry = {
	id: 'entry-1',
	personnelId: 'person-1',
	statusTypeId: 'leave',
	startDate: '2026-04-07',
	endDate: '2026-04-07',
	note: null
};
const onApril7: AvailabilityEditorRequest = {
	kind: 'create',
	person,
	startDate: '2026-04-07',
	endDate: '2026-04-07'
};

function renderModal(
	request: AvailabilityEditorRequest,
	overrides: {
		statusTypes?: StatusType[];
		existingEntries?: AvailabilityEntry[];
		saving?: boolean;
		onSave?: (change: AvailabilityChange) => Promise<AvailabilityOutcome>;
	} = {}
) {
	const onSave = vi.fn(overrides.onSave ?? (async () => 'saved' as const));
	const view = render(AvailabilityModal, {
		props: {
			request,
			statusTypes: overrides.statusTypes ?? statusTypes,
			existingEntries: overrides.existingEntries ?? [],
			saving: overrides.saving ?? false,
			onSave,
			onClose: vi.fn()
		}
	});
	return { ...view, onSave };
}

describe('AvailabilityModal', () => {
	it('adds the chosen status for the clicked day', async () => {
		const { onSave } = renderModal(onApril7);

		await fireEvent.pointerDown(screen.getByRole('button', { name: 'Status Type' }));
		const tdyOption = within(screen.getByRole('listbox', { name: 'Status Type' })).getByRole('option', { name: 'TDY' });
		await fireEvent.pointerDown(tdyOption);
		await fireEvent.pointerUp(tdyOption);
		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));

		expect(onSave).toHaveBeenCalledExactlyOnceWith({
			kind: 'create',
			record: {
				personnelId: 'person-1',
				statusTypeId: 'tdy',
				startDate: '2026-04-07',
				endDate: '2026-04-07',
				note: null
			}
		});
	});

	it('lists statuses in saved order, ties by id, whatever order they loaded in', async () => {
		const status = (id: string, name: string, sortOrder: number): StatusType => ({
			id,
			name,
			color: '#48bb78',
			textColor: '#ffffff',
			shortLabel: null,
			sortOrder
		});
		statusTypesStore.load(
			[status('c', 'School', 1), status('b', 'Sick', 1), status('d', 'Leave', 0), status('a', 'TDY', 2)],
			'org-a'
		);
		renderModal(onApril7, { statusTypes: statusTypesStore.items });

		await fireEvent.pointerDown(screen.getByRole('button', { name: 'Status Type' }));
		const options = within(screen.getByRole('listbox', { name: 'Status Type' })).getAllByRole('option');
		expect(options.map((option) => option.textContent?.trim())).toEqual(['Leave', 'Sick', 'School', 'TDY']);
	});

	it('starts from the range a quick add handed over, on the first status', async () => {
		const { onSave } = renderModal({ ...onApril7, endDate: '2026-04-09' });

		await fireEvent.input(screen.getByLabelText('Note'), { target: { value: 'JRTC prep' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));

		expect(onSave).toHaveBeenCalledExactlyOnceWith({
			kind: 'create',
			record: {
				personnelId: 'person-1',
				statusTypeId: 'leave',
				startDate: '2026-04-07',
				endDate: '2026-04-09',
				note: 'JRTC prep'
			}
		});
	});

	it('opens an entry from its bar ready to update it', async () => {
		const { onSave } = renderModal(
			{ kind: 'edit', person, entry: { ...existingEntry, endDate: '2026-04-10' } },
			{ existingEntries: [existingEntry] }
		);

		await fireEvent.input(screen.getByLabelText('Note'), { target: { value: 'Block leave' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

		expect(onSave).toHaveBeenCalledExactlyOnceWith({
			kind: 'update',
			entry: { ...existingEntry, endDate: '2026-04-10' },
			changes: { statusTypeId: 'leave', startDate: '2026-04-07', endDate: '2026-04-10', note: 'Block leave' }
		});
	});

	it('keeps a refused edit of the same entry ready to retry', async () => {
		const outcomes: AvailabilityOutcome[] = ['not-saved', 'saved'];
		const { onSave } = renderModal(
			{ kind: 'edit', person, entry: existingEntry },
			{ existingEntries: [existingEntry], onSave: async () => outcomes.shift()! }
		);

		await fireEvent.pointerDown(screen.getByRole('button', { name: 'Status Type' }));
		const tdyOption = within(screen.getByRole('listbox', { name: 'Status Type' })).getByRole('option', { name: 'TDY' });
		await fireEvent.pointerDown(tdyOption);
		await fireEvent.pointerUp(tdyOption);
		await fireEvent.input(screen.getByLabelText('Note'), { target: { value: 'Range day' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));
		await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

		const retry = {
			kind: 'update',
			entry: existingEntry,
			changes: { statusTypeId: 'tdy', startDate: '2026-04-07', endDate: '2026-04-07', note: 'Range day' }
		};
		expect(onSave.mock.calls).toEqual([[retry], [retry]]);
	});

	it('edits a listed entry of the day', async () => {
		const { onSave } = renderModal(onApril7, { existingEntries: [existingEntry] });

		await fireEvent.click(screen.getByRole('button', { name: 'Edit status' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

		expect(onSave).toHaveBeenCalledExactlyOnceWith({
			kind: 'update',
			entry: existingEntry,
			changes: { statusTypeId: 'leave', startDate: '2026-04-07', endDate: '2026-04-07', note: null }
		});
	});

	it('removes a listed entry only after confirmation', async () => {
		const { onSave } = renderModal(onApril7, { existingEntries: [existingEntry] });

		await fireEvent.click(screen.getByRole('button', { name: 'Remove status' }));
		expect(onSave).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		expect(onSave).toHaveBeenCalledExactlyOnceWith({ kind: 'remove', entry: existingEntry });
	});

	it('refuses another submission once a save could not be confirmed', async () => {
		const { onSave } = renderModal(onApril7, { onSave: async () => 'unconfirmed' });

		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));
		await screen.findByRole('alert');
		const add = screen.getByRole('button', { name: 'Add Status' });
		await fireEvent.click(add);

		expect(add).toHaveProperty('disabled', true);
		expect(onSave).toHaveBeenCalledTimes(1);
	});

	it('keeps the form when another change was still saving', async () => {
		const { onSave } = renderModal(onApril7, { onSave: async () => 'busy' });

		await fireEvent.input(screen.getByLabelText('Note'), { target: { value: 'JRTC prep' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));

		expect(screen.queryByRole('alert')).toBeNull();
		expect(onSave).toHaveBeenCalledTimes(2);
		expect(onSave.mock.calls[1]?.[0]).toEqual({
			kind: 'create',
			record: {
				personnelId: 'person-1',
				statusTypeId: 'leave',
				startDate: '2026-04-07',
				endDate: '2026-04-07',
				note: 'JRTC prep'
			}
		});
	});
});
