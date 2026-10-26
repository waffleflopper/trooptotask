// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventRead } from '../../events/eventModel';
import type { TaskingLists } from '../taskingListsModel';
import TaskingListsSection from './TaskingListsSection.svelte';

const refresh = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('$app/navigation', () => ({ invalidate: refresh }));

const TASKING = '00000000-0000-4000-8000-000000000101';
const LITTERS = '00000000-0000-4000-8000-000000000501';
const RADIOS = '00000000-0000-4000-8000-000000000502';
const CHECK = '00000000-0000-4000-8000-000000000601';
const MEMBER = '00000000-0000-4000-8000-000000000003';

const lists: TaskingLists = {
	equipment: [
		{ id: LITTERS, name: 'Litters', quantity: 4, securedQuantity: 1 },
		{ id: RADIOS, name: 'Radios', quantity: 2, securedQuantity: 2 }
	],
	checklist: [{ id: CHECK, label: 'Confirm the range is booked', done: false, doneAt: null, doneBy: null }]
};

function open(canEdit: boolean, loaded: EventRead<TaskingLists> = { status: 'loaded', value: lists }) {
	const onChanged = vi.fn();
	render(TaskingListsSection, {
		orgId: 'org-a',
		taskingId: TASKING,
		lists: Promise.resolve(loaded),
		members: { [MEMBER]: 'sgt.kim@example.mil' },
		canEdit,
		onChanged
	});
	return { onChanged };
}

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
	const send = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));
	vi.stubGlobal('fetch', send);
	return send;
}

const body = (send: ReturnType<typeof stubFetch>, call: number) =>
	JSON.parse((send.mock.calls[call] as unknown as [string, RequestInit])[1].body as string);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('Tasking equipment and checklist', () => {
	it('shows each requirement’s state and the ready count, and gives a reader no controls', async () => {
		open(false);

		const equipment = within(await screen.findByRole('region', { name: 'Equipment' }));
		expect(equipment.getByText('1 of 2 ready · 1 partial')).toBeTruthy();
		expect(equipment.getByText('Partial')).toBeTruthy();
		expect(equipment.getByText('Ready')).toBeTruthy();
		expect(screen.queryByRole('button')).toBeNull();
		expect((screen.getByRole('checkbox') as HTMLButtonElement).disabled).toBe(true);
	});

	it('adds equipment under one id, so a retry after a failure cannot add it twice', async () => {
		let fail = true;
		const send = stubFetch((_url, init) =>
			fail
				? new Response('boom', { status: 500 })
				: Response.json({ ...JSON.parse(init.body as string).draft, id: JSON.parse(init.body as string).id })
		);
		const { onChanged } = open(true);

		await fireEvent.input(await screen.findByLabelText('Add equipment'), { target: { value: 'Stretchers' } });
		await fireEvent.input(screen.getByLabelText('Quantity', { selector: '#equipment-add-quantity' }), {
			target: { value: '3' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add to equipment' }));

		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		expect((screen.getByLabelText('Add equipment') as HTMLInputElement).value).toBe('Stretchers');
		expect(onChanged).not.toHaveBeenCalled();

		fail = false;
		await fireEvent.click(screen.getByRole('button', { name: 'Add to equipment' }));
		await waitFor(() => expect(screen.getByText('Stretchers')).toBeTruthy());

		expect(body(send, 1).id).toBe(body(send, 0).id);
		expect(body(send, 1).draft).toEqual({ name: 'Stretchers', quantity: 3, securedQuantity: 0 });
		expect((screen.getByLabelText('Add equipment') as HTMLInputElement).value).toBe('');
		expect(onChanged).toHaveBeenCalledOnce();
	});

	it('refuses an entry without a name and sends nothing', async () => {
		const send = stubFetch(() => Response.json({}));
		open(true);

		await fireEvent.click(await screen.findByRole('button', { name: 'Add to equipment' }));

		expect(send).not.toHaveBeenCalled();
		expect(screen.getByLabelText('Add equipment').getAttribute('aria-invalid')).toBe('true');
	});

	it('secures every unit in one press and shows the requirement ready', async () => {
		const send = stubFetch(() => Response.json({ id: LITTERS, name: 'Litters', quantity: 4, securedQuantity: 4 }));
		open(true);

		await fireEvent.click(await screen.findByRole('button', { name: 'All secured: Litters' }));

		await waitFor(() => expect(screen.getByText('2 of 2 ready')).toBeTruthy());
		expect(send.mock.calls[0][0]).toBe(`/org/org-a/api/calendar-taskings/${TASKING}/equipment/${LITTERS}`);
		expect(body(send, 0)).toEqual({ securedQuantity: 4 });
	});

	it('refuses to secure more than the quantity from the edit form', async () => {
		const send = stubFetch(() => Response.json({}));
		open(true);

		await fireEvent.click(await screen.findByRole('button', { name: 'Edit Litters' }));
		await fireEvent.input(screen.getByLabelText('Secured'), { target: { value: '5' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(send).not.toHaveBeenCalled();
		expect(screen.getByLabelText('Secured').getAttribute('aria-invalid')).toBe('true');
	});

	it('moves an item and shows the order the server returns', async () => {
		const send = stubFetch(() =>
			Response.json({ equipment: [lists.equipment[1], lists.equipment[0]], checklist: lists.checklist })
		);
		open(true);

		await fireEvent.click(await screen.findByRole('button', { name: 'Move Radios up' }));

		await waitFor(() => expect(screen.getAllByRole('listitem')[0].textContent).toContain('Radios'));
		expect(send.mock.calls[0][1].method).toBe('PUT');
		expect(body(send, 0)).toEqual({ ids: [RADIOS, LITTERS] });
	});

	it('keeps a checklist item open when completing it fails', async () => {
		stubFetch(() => new Response('boom', { status: 500 }));
		open(true);

		const box = (await screen.findByRole('checkbox', { name: 'Confirm the range is booked' })) as HTMLButtonElement;
		await fireEvent.click(box);

		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		expect(box.getAttribute('aria-checked')).toBe('false');
		expect(screen.getByText('0 of 1 done')).toBeTruthy();
	});

	it('completes a checklist item and names who did it', async () => {
		stubFetch(() =>
			Response.json({
				id: CHECK,
				label: 'Confirm the range is booked',
				done: true,
				doneAt: '2026-10-25T12:00:00Z',
				doneBy: MEMBER
			})
		);
		open(true);

		await fireEvent.click(await screen.findByRole('checkbox', { name: 'Confirm the range is booked' }));

		await waitFor(() => expect(screen.getByText('1 of 1 done')).toBeTruthy());
		expect(screen.getByText(/sgt\.kim@example\.mil/)).toBeTruthy();
	});

	it('offers a retry instead of the lists when they cannot be loaded, and retrying reloads the Calendar data', async () => {
		open(false, { status: 'failed' });

		await fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

		await waitFor(() => expect(refresh).toHaveBeenCalledWith('app:calendar-events'));
		expect(screen.queryByRole('region', { name: 'Equipment' })).toBeNull();
		expect(screen.queryByRole('region', { name: 'Checklist' })).toBeNull();
	});

	it('keeps what was typed while an add was still saving', async () => {
		let finish: (response: Response) => void = () => {};
		stubFetch(() => new Promise<Response>((resolve) => (finish = resolve)) as unknown as Response);
		open(true);

		const name = (await screen.findByLabelText('Add equipment')) as HTMLInputElement;
		await fireEvent.input(name, { target: { value: 'Stretchers' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add to equipment' }));
		await fireEvent.input(name, { target: { value: 'Stretchers and straps' } });
		finish(Response.json({ id: LITTERS, name: 'Stretchers', quantity: 1, securedQuantity: 0 }));

		await waitFor(() => expect(screen.getByText('Stretchers')).toBeTruthy());
		expect(name.value).toBe('Stretchers and straps');
	});

	it('closes an open editor when the Tasking stops being editable', async () => {
		const { rerender } = render(TaskingListsSection, {
			orgId: 'org-a',
			taskingId: TASKING,
			lists: Promise.resolve({ status: 'loaded', value: lists } as const),
			members: {},
			canEdit: true,
			onChanged: vi.fn()
		});
		await fireEvent.click(await screen.findByRole('button', { name: 'Edit Litters' }));
		expect(screen.getByLabelText('Quantity', { selector: '[id^="equipment-quantity"]' })).toBeTruthy();

		await rerender({ canEdit: false });

		expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
		expect(screen.getByText('Litters')).toBeTruthy();
	});
});
