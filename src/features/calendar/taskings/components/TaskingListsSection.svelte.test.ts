// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventRead } from '../../events/eventModel';
import type { TaskingLists } from '../taskingListsModel';
import TaskingListsSection from './TaskingListsSection.svelte';

const refresh = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('$app/navigation', () => ({ invalidate: refresh, replaceState: vi.fn() }));

const TASKING = '00000000-0000-4000-8000-000000000101';
const LITTERS = '00000000-0000-4000-8000-000000000501';
const RADIOS = '00000000-0000-4000-8000-000000000502';
const CHECK = '00000000-0000-4000-8000-000000000601';

const lists: TaskingLists = {
	equipment: [
		{ id: LITTERS, name: 'Litters', quantity: 4, securedQuantity: 1 },
		{ id: RADIOS, name: 'Radios', quantity: 2, securedQuantity: 2 }
	],
	checklist: [{ id: CHECK, label: 'Confirm the range is booked', done: false, doneAt: null, doneBy: null }]
};

function open(
	canEdit: boolean,
	loaded: EventRead<TaskingLists> = { status: 'loaded', value: lists },
	returns: { returning: boolean; canReturn: boolean } = { returning: false, canReturn: false }
) {
	const onChanged = vi.fn();
	render(TaskingListsSection, {
		orgId: 'org-a',
		taskingId: TASKING,
		lists: Promise.resolve(loaded),
		canEdit,
		...returns,
		blocked: false,
		onChanged
	});
	return { onChanged };
}

async function choose(item: string, action: string) {
	await fireEvent.click(await screen.findByRole('button', { name: `Actions for ${item}` }));
	await fireEvent.click(await screen.findByRole('menuitem', { name: action }));
}

const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLButtonElement;

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
	it('shows which requirements are ready and gives a reader no controls', async () => {
		open(false);

		await screen.findByRole('region', { name: 'Equipment' });
		expect(checkbox('Litters').getAttribute('aria-checked')).toBe('false');
		expect(checkbox('Radios').getAttribute('aria-checked')).toBe('true');
		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLButtonElement).disabled)).toBe(true);
	});

	it('adds equipment under one id, so a retry after a failure cannot add it twice', async () => {
		let fail = true;
		const send = stubFetch((_url, init) =>
			fail
				? new Response('boom', { status: 500 })
				: Response.json({ ...JSON.parse(init.body as string).draft, id: JSON.parse(init.body as string).id })
		);
		const { onChanged } = open(true);

		await fireEvent.click(await screen.findByRole('button', { name: 'Add equipment' }));
		await fireEvent.input(screen.getByLabelText('Equipment', { selector: '#equipment-add-name' }), {
			target: { value: 'Stretchers' }
		});
		await fireEvent.input(screen.getByLabelText('Quantity', { selector: '#equipment-add-quantity' }), {
			target: { value: '3' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add to equipment' }));

		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		expect((screen.getByLabelText('Equipment', { selector: '#equipment-add-name' }) as HTMLInputElement).value).toBe(
			'Stretchers'
		);
		expect(onChanged).not.toHaveBeenCalled();

		fail = false;
		await fireEvent.click(screen.getByRole('button', { name: 'Add to equipment' }));
		await waitFor(() => expect(screen.getByText('Stretchers')).toBeTruthy());

		expect(body(send, 1).id).toBe(body(send, 0).id);
		expect(body(send, 1).draft).toEqual({ name: 'Stretchers', quantity: 3, securedQuantity: 0 });
		expect(screen.queryByRole('button', { name: 'Add to equipment' })).toBeNull();
		expect(onChanged).toHaveBeenCalledOnce();
	});

	it('refuses an entry without a name and sends nothing', async () => {
		const send = stubFetch(() => Response.json({}));
		open(true);

		await fireEvent.click(await screen.findByRole('button', { name: 'Add equipment' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add to equipment' }));

		expect(send).not.toHaveBeenCalled();
		expect(screen.getByLabelText('Equipment', { selector: '#equipment-add-name' }).getAttribute('aria-invalid')).toBe(
			'true'
		);
	});

	it('secures every unit in one press and shows the requirement ready', async () => {
		const send = stubFetch(() => Response.json({ id: LITTERS, name: 'Litters', quantity: 4, securedQuantity: 4 }));
		open(true);

		await fireEvent.click(await screen.findByRole('checkbox', { name: 'Litters' }));

		await waitFor(() => expect(checkbox('Litters').getAttribute('aria-checked')).toBe('true'));
		expect(send.mock.calls[0][0]).toBe(`/org/org-a/api/calendar-taskings/${TASKING}/equipment/${LITTERS}`);
		expect(body(send, 0)).toEqual({ securedQuantity: 4 });
	});

	it('refuses to secure more than the quantity from the edit form', async () => {
		const send = stubFetch(() => Response.json({}));
		open(true);

		await choose('Litters', 'Edit');
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

		await choose('Radios', 'Move up');

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

		await fireEvent.click(await screen.findByRole('button', { name: 'Add equipment' }));
		const name = screen.getByLabelText('Equipment', { selector: '#equipment-add-name' }) as HTMLInputElement;
		await fireEvent.input(name, { target: { value: 'Stretchers' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add to equipment' }));
		await fireEvent.input(name, { target: { value: 'Stretchers and straps' } });
		finish(Response.json({ id: LITTERS, name: 'Stretchers', quantity: 1, securedQuantity: 0 }));

		await waitFor(() => expect(screen.getByText('Stretchers')).toBeTruthy());
		expect(name.value).toBe('Stretchers and straps');
	});

	it('adds the next checklist item typed during a save under its own id', async () => {
		let finish: (response: Response) => void = () => {};
		const send = stubFetch((_url, init) => {
			const sent = JSON.parse(init.body as string);
			const saved = { id: sent.id, label: sent.label, done: false, doneAt: null, doneBy: null };
			return send.mock.calls.length === 1
				? (new Promise<Response>((resolve) => (finish = resolve)) as unknown as Response)
				: Response.json(saved);
		});
		open(true);

		await fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
		const entry = screen.getByLabelText('Checklist item', { selector: '#checklist-add-label' }) as HTMLInputElement;
		await fireEvent.input(entry, { target: { value: 'Book the range' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add to checklist' }));
		await fireEvent.input(entry, { target: { value: 'Draw the radios' } });
		finish(Response.json({ id: body(send, 0).id, label: 'Book the range', done: false, doneAt: null, doneBy: null }));
		await waitFor(() => expect(screen.getByText('Book the range')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'Add to checklist' }));

		await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
		expect(body(send, 1).label).toBe('Draw the radios');
		expect(body(send, 1).id).not.toBe(body(send, 0).id);
	});

	it('closes an open editor when the Tasking stops being editable, and does not bring it back on reopen', async () => {
		const { rerender } = render(TaskingListsSection, {
			orgId: 'org-a',
			taskingId: TASKING,
			lists: Promise.resolve({ status: 'loaded', value: lists } as const),
			canEdit: true,
			returning: false,
			canReturn: false,
			blocked: false,
			onChanged: vi.fn()
		});
		await choose('Litters', 'Edit');
		expect(screen.getByLabelText('Quantity', { selector: '[id^="equipment-quantity"]' })).toBeTruthy();

		await rerender({ canEdit: false });

		expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
		expect(screen.getByText('Litters')).toBeTruthy();

		await rerender({ canEdit: true });

		expect(screen.getByRole('button', { name: 'Actions for Litters' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
	});

	it('records returns on a Completed Tasking and leaves the rest of the list closed', async () => {
		const send = stubFetch(() =>
			Response.json({ id: LITTERS, name: 'Litters', quantity: 4, securedQuantity: 4, returnedQuantity: 4 })
		);
		open(false, { status: 'loaded', value: lists }, { returning: true, canReturn: true });

		await fireEvent.click(await screen.findByRole('checkbox', { name: 'Litters' }));

		await waitFor(() => expect(checkbox('Litters').getAttribute('aria-checked')).toBe('true'));
		expect(body(send, 0)).toEqual({ returnedQuantity: 4 });
		expect(screen.queryByRole('button', { name: 'Add equipment' })).toBeNull();
	});

	it('counts a partial return and refuses a count that is not a whole number', async () => {
		const send = stubFetch(() =>
			Response.json({ id: LITTERS, name: 'Litters', quantity: 4, securedQuantity: 4, returnedQuantity: 3 })
		);
		open(false, { status: 'loaded', value: lists }, { returning: true, canReturn: true });

		await choose('Litters', 'Count returned…');
		const count = screen.getByLabelText(/Returned of 4/);
		await fireEvent.input(count, { target: { value: '-1' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(send).not.toHaveBeenCalled();

		await fireEvent.input(count, { target: { value: '3' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(body(send, 0)).toEqual({ returnedQuantity: 3 }));
		await waitFor(() => expect(screen.queryByLabelText(/Returned of 4/)).toBeNull());
		expect(checkbox('Litters').getAttribute('aria-checked')).toBe('false');
	});
});
