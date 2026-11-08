// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import AvailabilityModal from './AvailabilityModal.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import type { AvailabilityEditorRequest } from '$features/calendar/contexts/CalendarPageContext.svelte';
import type { AvailabilityOutcome } from '$features/calendar/availabilitySave';
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
	{
		id: 'leave',
		name: 'Leave',
		color: '#48bb78',
		textColor: '#ffffff',
		shortLabel: null,
		rosterEffect: 'A',
		sortOrder: 0,
		archivedAt: null
	},
	{
		id: 'tdy',
		name: 'TDY',
		color: '#9f7aea',
		textColor: '#ffffff',
		shortLabel: null,
		rosterEffect: 'A',
		sortOrder: 1,
		archivedAt: null
	}
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
		defaultStatusTypeId?: string;
		existingEntries?: AvailabilityEntry[];
		saving?: boolean;
		onSave?: (change: AvailabilityChange) => Promise<AvailabilityOutcome>;
	} = {}
) {
	const onSave = vi.fn(overrides.onSave ?? (async () => 'saved' as const));
	const onClose = vi.fn();
	const props = {
		request,
		statusTypes: overrides.statusTypes ?? statusTypes,
		defaultStatusTypeId: overrides.defaultStatusTypeId,
		existingEntries: overrides.existingEntries ?? [],
		saving: overrides.saving ?? false,
		onSave,
		onClose
	};
	const view = render(AvailabilityModal, { props });
	return { ...view, onSave, onClose, props };
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

	it('picks the first status once starter types arrive in an open dialog', async () => {
		const { onSave, rerender, props } = renderModal(onApril7, { statusTypes: [] });

		await rerender({ ...props, statusTypes });
		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));

		expect(onSave).toHaveBeenCalledExactlyOnceWith({
			kind: 'create',
			record: {
				personnelId: 'person-1',
				statusTypeId: statusTypes[0].id,
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
			rosterEffect: 'A',
			sortOrder,
			archivedAt: null
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

	describe('with an archived status', () => {
		const archivedLeave: StatusType = { ...statusTypes[0], archivedAt: '2030-01-02T03:04:05Z' };
		const listed = [archivedLeave, statusTypes[1]];
		const optionNames = async () => {
			await fireEvent.pointerDown(screen.getByRole('button', { name: 'Status Type' }));
			return within(screen.getByRole('listbox', { name: 'Status Type' }))
				.getAllByRole('option')
				.map((option) => option.textContent?.trim());
		};

		it('leaves it out of a new entry and starts on the first active status', async () => {
			const { onSave } = renderModal(onApril7, { statusTypes: listed });

			expect(await optionNames()).toEqual(['TDY']);
			await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
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

		it('keeps an entry on its archived status when only the note changes, and labels the choice', async () => {
			const { onSave } = renderModal(
				{ kind: 'edit', person, entry: existingEntry },
				{ statusTypes: listed, existingEntries: [existingEntry] }
			);

			expect(screen.getByRole('button', { name: 'Status Type' }).textContent).toContain('Leave (archived)');
			expect(await optionNames()).toEqual(['Leave (archived)', 'TDY']);
			await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
			await fireEvent.input(screen.getByLabelText('Note'), { target: { value: 'Block leave' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

			expect(onSave).toHaveBeenCalledExactlyOnceWith({
				kind: 'update',
				entry: existingEntry,
				changes: { statusTypeId: 'leave', startDate: '2026-04-07', endDate: '2026-04-07', note: 'Block leave' }
			});
		});

		it('has nothing to add and asks to choose when every status is archived', () => {
			renderModal(onApril7, { statusTypes: [archivedLeave] });

			expect(screen.queryByRole('button', { name: 'Add Status' })?.hasAttribute('disabled')).toBe(true);
			expect(screen.getByRole('button', { name: 'Status Type' }).textContent).toContain('Select status');
		});
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

	it('moves an entry to the days chosen in its date pickers', async () => {
		const { onSave } = renderModal(
			{ kind: 'edit', person, entry: existingEntry },
			{ existingEntries: [existingEntry] }
		);

		await fireEvent.click(screen.getByRole('button', { name: /Start Date/ }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Wednesday, April 8, 2026' }));
		await fireEvent.click(screen.getByRole('button', { name: /End Date/ }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Friday, April 10, 2026' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

		expect(onSave).toHaveBeenCalledExactlyOnceWith({
			kind: 'update',
			entry: existingEntry,
			changes: { statusTypeId: 'leave', startDate: '2026-04-08', endDate: '2026-04-10', note: null }
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

describe('AvailabilityModal — remembered status and Save and close', () => {
	const createdOn = (statusTypeId: string) => ({
		kind: 'create',
		record: {
			personnelId: 'person-1',
			statusTypeId,
			startDate: '2026-04-07',
			endDate: '2026-04-07',
			note: null
		}
	});

	it('starts a new entry on the remembered status', async () => {
		const { onSave } = renderModal(onApril7, { defaultStatusTypeId: 'tdy' });

		await fireEvent.click(screen.getByRole('button', { name: 'Save and close' }));

		expect(onSave).toHaveBeenCalledExactlyOnceWith(createdOn('tdy'));
	});

	it('saves and closes in one click', async () => {
		const { onSave, onClose } = renderModal(onApril7);

		await fireEvent.click(screen.getByRole('button', { name: 'Save and close' }));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(onSave).toHaveBeenCalledExactlyOnceWith(createdOn('leave'));
	});

	it('keeps the dialog open after Add Status and starts the next entry on the remembered status', async () => {
		let remember = async () => {};
		const { onSave, onClose, rerender, props } = renderModal(onApril7, {
			defaultStatusTypeId: 'leave',
			onSave: async () => {
				await remember();
				return 'saved';
			}
		});
		remember = () => rerender({ ...props, defaultStatusTypeId: 'tdy' });

		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));
		await waitFor(() => expect(screen.getAllByText('TDY').length).toBeGreaterThan(0));
		await fireEvent.click(screen.getByRole('button', { name: 'Add Status' }));

		expect(onClose).not.toHaveBeenCalled();
		expect(onSave.mock.calls.map(([change]) => change)).toEqual([createdOn('leave'), createdOn('tdy')]);
	});

	it.each(['not-saved', 'unconfirmed', 'stale', 'busy'] as const)(
		'stays open when Save and close ends %s',
		async (outcome) => {
			const { onSave, onClose } = renderModal(onApril7, { onSave: async () => outcome });

			await fireEvent.click(screen.getByRole('button', { name: 'Save and close' }));
			await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
			await Promise.resolve();

			expect(onClose).not.toHaveBeenCalled();
		}
	);

	it('does not close a dialog that was already replaced when the save settled', async () => {
		let settle!: (outcome: AvailabilityOutcome) => void;
		const { onSave, onClose, unmount } = renderModal(onApril7, {
			onSave: () => new Promise<AvailabilityOutcome>((resolve) => (settle = resolve))
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Save and close' }));
		await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
		unmount();
		settle('saved');
		await Promise.resolve();
		await Promise.resolve();

		expect(onClose).not.toHaveBeenCalled();
	});

	it('updates an entry and closes from Save and close in edit mode', async () => {
		const { onSave, onClose } = renderModal(
			{ kind: 'edit', person, entry: existingEntry },
			{ existingEntries: [existingEntry] }
		);

		await fireEvent.input(screen.getByLabelText('Note'), { target: { value: 'Block leave' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save and close' }));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(onSave).toHaveBeenCalledExactlyOnceWith({
			kind: 'update',
			entry: existingEntry,
			changes: { statusTypeId: 'leave', startDate: '2026-04-07', endDate: '2026-04-07', note: 'Block leave' }
		});
		expect(screen.getByRole('button', { name: 'Update Status' })).toBeTruthy();
	});
});

describe('AvailabilityModal — day counts', () => {
	it('counts every calendar day of a range that crosses the spring daylight-saving change', async () => {
		const originalTimezone = process.env.TZ;
		process.env.TZ = 'America/New_York';
		try {
			renderModal(
				{ kind: 'create', person, startDate: '2026-03-05', endDate: '2026-03-05' },
				{
					existingEntries: [
						{
							id: 'entry-1',
							personnelId: person.id,
							statusTypeId: 'leave',
							startDate: '2026-03-01',
							endDate: '2026-03-10',
							note: null
						}
					]
				}
			);

			expect(screen.getByText(/\(10\s+days\)/)).toBeTruthy();
			await fireEvent.click(screen.getByRole('button', { name: 'Edit status' }));
			expect(
				screen.getAllByText((_, element) => element?.textContent?.replace(/\s+/g, ' ').trim() === '10 days')
			).not.toHaveLength(0);
		} finally {
			if (originalTimezone === undefined) delete process.env.TZ;
			else process.env.TZ = originalTimezone;
		}
	});
});
