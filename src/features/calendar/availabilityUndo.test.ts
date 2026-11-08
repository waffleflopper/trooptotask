import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { availabilityUndoAction } from './availabilityUndo';
import type { AvailabilityEntry } from '$features/calendar/contracts';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';

const entry = (id: string, overrides: Partial<AvailabilityEntry> = {}): AvailabilityEntry => ({
	id,
	personnelId: 'p1',
	statusTypeId: 'leave',
	startDate: '2026-11-10',
	endDate: '2026-11-12',
	note: null,
	...overrides
});

let current = true;
let undone = 0;
const scope = () => ({
	orgId: 'org1',
	isCurrent: () => current,
	onUndone: () => {
		undone += 1;
	}
});

const reply = (body: unknown, status = 200) => Response.json(body, { status });
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const ids = () => availabilityStore.items.map((item) => item.id);
const settle = () => vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	current = true;
	undone = 0;
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
	availabilityStore.load([entry('kept'), entry('added')], 'org1');
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('availabilityUndoAction', () => {
	it('takes back an add by sending only the wire fields of the added entry and drops it from the store', async () => {
		fetchMock.mockResolvedValueOnce(reply({ removedIds: ['added'], restoredIds: [], changedIds: [] }));
		const success = vi.spyOn(toastStore, 'success');

		availabilityUndoAction({ remove: [{ ...entry('added'), note: 'Block leave' }] }, scope()).onClick();
		await vi.waitFor(() => expect(success).toHaveBeenCalledTimes(1));

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/org/org1/api/availability/undo');
		expect(init.method).toBe('POST');
		expect(JSON.parse(String(init.body))).toEqual({
			remove: [
				{
					id: 'added',
					personnelId: 'p1',
					statusTypeId: 'leave',
					startDate: '2026-11-10',
					endDate: '2026-11-12',
					note: 'Block leave'
				}
			]
		});
		expect(ids()).toEqual(['kept']);
		expect(undone).toBe(1);
	});

	it('puts back only the removed entries the server restored and reports the ones that changed since', async () => {
		availabilityStore.load([entry('kept')], 'org1');
		fetchMock.mockResolvedValueOnce(reply({ removedIds: [], restoredIds: ['back'], changedIds: ['moved'] }));
		const success = vi.spyOn(toastStore, 'success');

		availabilityUndoAction({ restore: [entry('back'), entry('moved')] }, scope()).onClick();
		await vi.waitFor(() => expect(success).toHaveBeenCalledTimes(1));

		expect(ids()).toEqual(['kept', 'back']);
		expect(success.mock.calls[0][3]).toEqual(expect.any(String));
		expect(undone).toBe(1);
	});

	it('warns that nothing was undone, without touching the store, when every entry changed since', async () => {
		fetchMock.mockResolvedValueOnce(reply({ removedIds: [], restoredIds: [], changedIds: ['added'] }));
		const warning = vi.spyOn(toastStore, 'warning');
		const success = vi.spyOn(toastStore, 'success');

		availabilityUndoAction({ remove: [entry('added')] }, scope()).onClick();
		await vi.waitFor(() => expect(warning).toHaveBeenCalledTimes(1));

		expect(success).not.toHaveBeenCalled();
		expect(ids()).toEqual(['kept', 'added']);
		expect(undone).toBe(0);
	});

	it('leaves the store alone when the reply arrives after the page moved to another Organization', async () => {
		availabilityStore.load([entry('kept'), entry('added')], 'org2');
		fetchMock.mockResolvedValueOnce(reply({ removedIds: ['added'], restoredIds: [], changedIds: [] }));
		const success = vi.spyOn(toastStore, 'success');

		availabilityUndoAction({ remove: [entry('added')] }, scope()).onClick();
		await vi.waitFor(() => expect(success).toHaveBeenCalledTimes(1));

		expect(ids()).toEqual(['kept', 'added']);
	});

	it('shows the server reason when the request is refused', async () => {
		fetchMock.mockResolvedValueOnce(reply({ message: 'You cannot change these statuses.' }, 403));
		const error = vi.spyOn(toastStore, 'error');

		availabilityUndoAction({ remove: [entry('added')] }, scope()).onClick();
		await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));

		expect(error.mock.calls[0][3]).toBe('You cannot change these statuses.');
		expect(ids()).toEqual(['kept', 'added']);
	});

	it('does nothing when the caller has already moved on before the click', async () => {
		const action = availabilityUndoAction({ remove: [entry('added')] }, scope());
		current = false;
		const toasts = [vi.spyOn(toastStore, 'success'), vi.spyOn(toastStore, 'warning'), vi.spyOn(toastStore, 'error')];

		action.onClick();
		await flush();

		expect(fetchMock).not.toHaveBeenCalled();
		expect(toasts.map((toast) => toast.mock.calls.length)).toEqual([0, 0, 0]);
	});

	it('does nothing when the Organization ended before the click', async () => {
		const action = availabilityUndoAction({ remove: [entry('added')] }, scope());
		endOrganizationLifetime();
		const success = vi.spyOn(toastStore, 'success');

		action.onClick();
		await flush();

		expect(fetchMock).not.toHaveBeenCalled();
		expect(success).not.toHaveBeenCalled();
	});

	it.each(['reply', 'failure'] as const)(
		'writes nothing and stays silent when the caller moves on before the %s arrives',
		async (outcome) => {
			let settleFetch!: { resolve: (response: Response) => void; reject: (error: Error) => void };
			fetchMock.mockImplementationOnce(() => new Promise((resolve, reject) => (settleFetch = { resolve, reject })));
			const toasts = [vi.spyOn(toastStore, 'success'), vi.spyOn(toastStore, 'warning'), vi.spyOn(toastStore, 'error')];

			availabilityUndoAction({ remove: [entry('added')] }, scope()).onClick();
			await settle();
			current = false;
			if (outcome === 'reply') settleFetch.resolve(reply({ removedIds: ['added'], restoredIds: [], changedIds: [] }));
			else settleFetch.reject(new Error('offline'));
			await flush();

			expect(ids()).toEqual(['kept', 'added']);
			expect(undone).toBe(0);
			expect(toasts.map((toast) => toast.mock.calls.length)).toEqual([0, 0, 0]);
		}
	);

	it('writes nothing when the Organization ends while the request is in flight', async () => {
		let resolveFetch!: (response: Response) => void;
		fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveFetch = resolve)));
		const success = vi.spyOn(toastStore, 'success');

		availabilityUndoAction({ remove: [entry('added')] }, scope()).onClick();
		await settle();
		endOrganizationLifetime();
		resolveFetch(reply({ removedIds: ['added'], restoredIds: [], changedIds: [] }));
		await flush();

		expect(ids()).toEqual(['kept', 'added']);
		expect(success).not.toHaveBeenCalled();
	});

	it('sends more than one batch of entries in turns and applies what the earlier turns undid when a later one fails', async () => {
		const many = Array.from({ length: 501 }, (_, index) => entry(`bulk-${index}`));
		availabilityStore.load([entry('kept'), ...many], 'org1');
		fetchMock
			.mockResolvedValueOnce(
				reply({ removedIds: many.slice(0, 500).map((item) => item.id), restoredIds: [], changedIds: [] })
			)
			.mockResolvedValueOnce(reply({ message: 'Server unavailable' }, 503));
		const error = vi.spyOn(toastStore, 'error');

		availabilityUndoAction({ remove: many }, scope()).onClick();
		await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));

		expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)).remove.length)).toEqual([500, 1]);
		expect(ids()).toEqual(['kept', 'bulk-500']);
		expect(undone).toBe(1);
	});
});
