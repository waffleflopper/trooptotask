// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import CalendarPopover from './CalendarPopover.svelte';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import type { CalendarPopover as CalendarPopoverState } from '$features/calendar/contexts/CalendarPageContext.svelte';
import type { Personnel } from '$features/personnel/contracts';
import { buildAvailabilityTracks } from '$features/calendar/utils/availabilityTracks';

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
});

const okafor: Personnel = {
	id: 'okafor',
	firstName: 'Daniel',
	lastName: 'Okafor',
	rank: 'SGT',
	groupId: 'alpha',
	groupName: 'Alpha',
	clinicRole: '',
	mos: '68W'
};

const status = (id: string, name: string, sortOrder: number): StatusType => ({
	id,
	name,
	color: '#16a34a',
	textColor: '#ffffff',
	shortLabel: null,
	sortOrder
});
const STATUSES = [status('leave', 'Leave', 0), status('sick', 'Sick', 1), status('tdy', 'TDY', 2)];

const leave: AvailabilityEntry = {
	id: 'entry-leave',
	personnelId: 'okafor',
	statusTypeId: 'leave',
	startDate: '2026-10-20',
	endDate: '2026-10-23',
	note: 'Block leave'
};
const sick: AvailabilityEntry = { ...leave, id: 'entry-sick', statusTypeId: 'sick', note: null };

type PopoverWithoutAnchor = DistributiveOmit<Exclude<CalendarPopoverState, { kind: 'duty' }>, 'anchor'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function renderPopover(
	popover: PopoverWithoutAnchor,
	options: { canEdit?: boolean; statusTypes?: StatusType[]; anchorHasResizeGrips?: boolean } = {}
) {
	const anchor = document.createElement('button');
	document.body.append(anchor);
	const onSave = vi.fn();
	const onEdit = vi.fn();
	const onOpenEntry = vi.fn();
	const onClose = vi.fn(() => view.unmount());
	const props = {
		popover: { ...popover, anchor } as Exclude<CalendarPopoverState, { kind: 'duty' }>,
		statusTypes: options.statusTypes ?? STATUSES,
		spans: buildAvailabilityTracks([leave, sick], STATUSES).spans('okafor'),
		canEdit: options.canEdit ?? true,
		anchorHasResizeGrips: options.anchorHasResizeGrips ?? true,
		saving: false,
		onSave,
		onEdit,
		onOpenEntry,
		onClose
	};
	const view = render(CalendarPopover, { props });
	return { anchor, onSave, onEdit, onOpenEntry, onClose, rerender: view.rerender, props };
}

describe('CalendarPopover quick-add', () => {
	const quickAdd = { kind: 'quick-add', person: okafor, startDate: '2026-10-26', endDate: '2026-10-28' } as const;

	it('creates the second status in store order for the dragged days when 2 is pressed', async () => {
		const { onSave } = renderPopover(quickAdd);

		const dialog = await screen.findByRole('dialog', { name: 'Add status, Mon 26 – Wed 28 Oct' });
		await fireEvent.keyDown(dialog, { key: '2' });

		expect(onSave.mock.calls).toEqual([
			[
				{
					kind: 'create',
					record: {
						personnelId: 'okafor',
						statusTypeId: 'sick',
						startDate: '2026-10-26',
						endDate: '2026-10-28',
						note: null
					}
				}
			]
		]);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('keeps each shortcut on the status it named when the popover opened', async () => {
		const { onSave, rerender, props } = renderPopover(quickAdd);

		await rerender({ ...props, statusTypes: [STATUSES[2]!, STATUSES[0]!, STATUSES[1]!] });
		await fireEvent.keyDown(await screen.findByRole('dialog'), { key: '1' });

		expect(onSave.mock.calls[0]?.[0].record.statusTypeId).toBe('leave');
	});

	it('closes on Escape without saving and returns focus to the anchor', async () => {
		const { anchor, onSave, onClose } = renderPopover(quickAdd);

		await fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onSave).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(anchor);
	});

	it('hands the dragged days to the editor for a note or other dates', async () => {
		const { onEdit } = renderPopover(quickAdd);

		await fireEvent.click(await screen.findByRole('button', { name: 'Add a note or edit dates…' }));

		expect(onEdit).toHaveBeenCalledWith({
			kind: 'create',
			person: okafor,
			startDate: '2026-10-26',
			endDate: '2026-10-28'
		});
	});
});

describe('CalendarPopover entry', () => {
	const entry = { kind: 'entry', person: okafor, entryId: 'entry-leave' } as const;

	it('shows the entry and removes it only after the inline confirmation', async () => {
		const { onSave } = renderPopover(entry);

		const dialog = await screen.findByRole('dialog', { name: 'Leave, SGT Okafor' });
		expect(within(dialog).getByText('Tue 20 – Fri 23 Oct · 4 days')).toBeTruthy();
		expect(within(dialog).getByText('Block leave')).toBeTruthy();

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
		expect(onSave).not.toHaveBeenCalled();
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

		expect(onSave.mock.calls).toEqual([[{ kind: 'remove', entry: leave }]]);
	});

	it("returns focus to the person's row once the removed bar is gone", async () => {
		const row = document.createElement('div');
		row.dataset.personId = 'okafor';
		row.innerHTML = '<button>SGT Okafor</button>';
		document.body.append(row);
		renderPopover(entry);

		const dialog = await screen.findByRole('dialog', { name: 'Leave, SGT Okafor' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

		await waitFor(() => expect(document.activeElement?.textContent).toBe('SGT Okafor'));
	});

	it('mentions dragging the ends only when the opened bar carries grips', async () => {
		const { props, rerender } = renderPopover(entry, { anchorHasResizeGrips: true });
		const dialog = await screen.findByRole('dialog', { name: 'Leave, SGT Okafor' });
		expect(within(dialog).queryByText('Drag ends to resize')).not.toBeNull();

		await rerender({ ...props, anchorHasResizeGrips: false });

		expect(within(dialog).queryByText('Drag ends to resize')).toBeNull();
	});

	it('opens the editor on the entry from Edit details', async () => {
		const { onEdit } = renderPopover(entry);

		await fireEvent.click(await screen.findByRole('button', { name: 'Edit details' }));

		expect(onEdit).toHaveBeenCalledWith({ kind: 'edit', person: okafor, entry: leave });
	});

	it('shows a view-only member the entry without actions', async () => {
		renderPopover(entry, { canEdit: false });

		const dialog = await screen.findByRole('dialog', { name: 'Leave, SGT Okafor' });
		expect(within(dialog).getByText('Tue 20 – Fri 23 Oct · 4 days')).toBeTruthy();
		expect(within(dialog).queryByRole('button', { name: 'Edit details' })).toBeNull();
		expect(within(dialog).queryByRole('button', { name: 'Remove' })).toBeNull();
	});
});

describe('CalendarPopover overflow', () => {
	it('lists each hidden entry and opens the chosen one', async () => {
		const { onOpenEntry } = renderPopover({
			kind: 'overflow',
			person: okafor,
			entryIds: ['entry-leave', 'entry-sick']
		});

		const dialog = await screen.findByRole('dialog', { name: '2 more entries, SGT Okafor' });
		expect(
			within(dialog).getByRole('button', { name: 'Leave, 20 to 23 October 2026, 4 days, Block leave' })
		).toBeTruthy();
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Sick, 20 to 23 October 2026, 4 days' }));

		expect(onOpenEntry).toHaveBeenCalledWith('entry-sick');
	});
});
