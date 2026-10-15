import { describe, it, expect, vi, beforeEach } from 'vitest';
import { statusTypesStore } from './statusTypes.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { settles } from '$lib/test-support/settles';
import { endOrganizationLifetime } from '$lib/stores/core';
import type { StatusType } from '$features/calendar/contracts';

const mockTypes: StatusType[] = [
	{ id: '1', name: 'Leave', color: '#22c55e', textColor: '#ffffff', shortLabel: null, sortOrder: 0 },
	{ id: '2', name: 'TDY', color: '#3b82f6', textColor: '#ffffff', shortLabel: null, sortOrder: 1 }
];

function stubFetch(response: unknown, status = 200) {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(response) })
	);
}

describe('statusTypesStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		statusTypesStore.load(structuredClone(mockTypes), 'org-1');
	});

	describe('items', () => {
		it('returns loaded items', () => {
			expect(statusTypesStore.items).toHaveLength(2);
			expect(statusTypesStore.items[0].name).toBe('Leave');
		});

		it('returns empty array when no items loaded', () => {
			statusTypesStore.load([], 'org-2');
			expect(statusTypesStore.items).toEqual([]);
		});
	});

	describe('load', () => {
		it('replaces existing items with new data', () => {
			statusTypesStore.load([mockTypes[1]], 'org-2');
			expect(statusTypesStore.items).toHaveLength(1);
			expect(statusTypesStore.items[0].name).toBe('TDY');
		});
	});

	describe('getById', () => {
		it('finds a status type by ID', () => {
			const result = statusTypesStore.getById('1');
			expect(result).toEqual(mockTypes[0]);
		});

		it('returns undefined for non-existent ID', () => {
			const result = statusTypesStore.getById('nonexistent');
			expect(result).toBeUndefined();
		});
	});

	describe('add', () => {
		it('sends the edited fields without a position and lists the created type in its saved place', async () => {
			const created = {
				id: 'new-1',
				name: 'CQ',
				color: '#ff0000',
				textColor: '#ffffff',
				shortLabel: 'CQ',
				sortOrder: 2
			};
			const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(created) });
			vi.stubGlobal('fetch', fetchMock);

			const result = await statusTypesStore.add({
				name: 'CQ',
				color: '#ff0000',
				textColor: '#ffffff',
				shortLabel: 'CQ'
			});

			expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
				name: 'CQ',
				color: '#ff0000',
				textColor: '#ffffff',
				shortLabel: 'CQ'
			});
			expect(result).toEqual(created);
			expect(statusTypesStore.items.map((type) => type.id)).toEqual(['1', '2', 'new-1']);
		});
	});

	describe('update', () => {
		it('updates an existing item and returns true', async () => {
			stubFetch({ ...mockTypes[0], name: 'Annual Leave' });

			const result = await statusTypesStore.update('1', { name: 'Annual Leave' });

			expect(result).toBe(true);
		});
	});

	describe('remove', () => {
		it('returns boolean true on success (removeBool)', async () => {
			stubFetch({});

			const result = await statusTypesStore.remove('1');

			expect(result).toBe(true);
			expect(typeof result).toBe('boolean');
		});
	});

	describe('setOrder', () => {
		const leave = mockTypes[0];
		const tdy = mockTypes[1];
		const sick: StatusType = {
			id: '3',
			name: 'Sick',
			color: '#dc2626',
			textColor: '#ffffff',
			shortLabel: 'SK',
			sortOrder: 2
		};
		const ids = () => statusTypesStore.items.map((type) => type.id);
		const orderRequest = (statusTypeIds: string[], expectedStatusTypeIds: string[]) => [
			'/org/org-1/api/status-types/order',
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ statusTypeIds, expectedStatusTypeIds })
			}
		];
		const reply = (status: number, body: unknown) => ({
			ok: status >= 200 && status < 300,
			status,
			json: () => Promise.resolve(body),
			text: () => Promise.resolve(JSON.stringify(body))
		});
		const requests = (fetchMock: ReturnType<typeof vi.fn>) =>
			fetchMock.mock.calls.map(([url, options]) => [(options as RequestInit | undefined)?.method ?? 'GET', url]);
		const saved = (order: string[]) =>
			order.map((id, position) => ({ ...[leave, tdy, sick].find((type) => type.id === id)!, sortOrder: position }));

		beforeEach(() => {
			statusTypesStore.load([leave, tdy, sick], 'org-1');
		});

		it('sends the order with the order it replaces and lists the types in it once saved', async () => {
			const fetchMock = vi.fn().mockResolvedValue(reply(200, { success: true }));
			vi.stubGlobal('fetch', fetchMock);
			const toast = vi.spyOn(toastStore, 'error');

			expect(await statusTypesStore.setOrder(['3', '1', '2'])).toEqual({ status: 'saved' });

			expect(fetchMock.mock.calls).toEqual([orderRequest(['3', '1', '2'], ['1', '2', '3'])]);
			expect(statusTypesStore.items.map((type) => [type.id, type.sortOrder])).toEqual([
				['3', 0],
				['1', 1],
				['2', 2]
			]);
			expect(statusTypesStore.pendingOrder).toBeNull();
			expect(toast).not.toHaveBeenCalled();
		});

		it('keeps a type another editor created in its saved place when a snapshot replays the saved order', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { success: true })));
			const read = statusTypesStore.beginRead();
			expect(await statusTypesStore.setOrder(['3', '1', '2'])).toEqual({ status: 'saved' });
			const quarters: StatusType = { ...leave, id: '4', name: 'Quarters', sortOrder: 3 };

			statusTypesStore.load(read.reconcile([leave, tdy, sick, quarters], () => true), 'org-1');

			expect(statusTypesStore.items.map((type) => [type.id, type.sortOrder])).toEqual([
				['3', 0],
				['1', 1],
				['2', 2],
				['4', 3]
			]);
		});

		it('folds moves made during a save into one follow-up that expects the order just saved', async () => {
			const replies: Array<(value: unknown) => void> = [];
			const fetchMock = vi.fn(() => new Promise((resolve) => replies.push(resolve)));
			vi.stubGlobal('fetch', fetchMock);

			const first = statusTypesStore.setOrder(['2', '1', '3']);
			const second = statusTypesStore.setOrder(['2', '3', '1']);
			const third = statusTypesStore.setOrder(['3', '2', '1']);
			expect(statusTypesStore.pendingOrder).toEqual(['3', '2', '1']);
			expect(ids()).toEqual(['1', '2', '3']);
			replies[0](reply(200, { success: true }));
			await vi.waitFor(() => expect(replies).toHaveLength(2));
			expect(ids()).toEqual(['2', '1', '3']);
			replies[1](reply(200, { success: true }));

			expect(await Promise.all([first, second, third])).toEqual([
				{ status: 'saved' },
				{ status: 'saved' },
				{ status: 'saved' }
			]);
			expect(fetchMock.mock.calls).toEqual([
				orderRequest(['2', '1', '3'], ['1', '2', '3']),
				orderRequest(['3', '2', '1'], ['2', '1', '3'])
			]);
			expect(ids()).toEqual(['3', '2', '1']);
		});

		it.each([400, 403, 409])('reports a %i as not saved and adopts one fresh read', async (status) => {
			const fetchMock = vi.fn((_url, options?: RequestInit) =>
				Promise.resolve(
					options ? reply(status, { message: 'Calendar change was not saved.' }) : reply(200, saved(['2', '3', '1']))
				)
			);
			vi.stubGlobal('fetch', fetchMock);
			const toast = vi.spyOn(toastStore, 'error');

			expect(await statusTypesStore.setOrder(['3', '1', '2'])).toEqual({
				status: 'not-saved',
				message: 'Calendar change was not saved.',
				showsSaved: true
			});
			expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
				'/org/org-1/api/status-types/order',
				'/org/org-1/api/status-types'
			]);
			expect(ids()).toEqual(['2', '3', '1']);
			expect(toast).toHaveBeenCalledWith('Calendar change was not saved.');
		});

		it.each([
			['a 500', () => Promise.resolve(reply(500, { message: 'Internal server error' }))],
			['the unconfirmed 503', () => Promise.resolve(reply(503, { message: 'unconfirmed' }))],
			['a rejected request', () => Promise.reject(new TypeError('Failed to fetch'))]
		])('reports %s as unconfirmed and shows the order from one fresh read without retrying', async (_label, answer) => {
			const fetchMock = vi.fn((_url, options?: RequestInit) =>
				options ? answer() : Promise.resolve(reply(200, saved(['2', '3', '1'])))
			);
			vi.stubGlobal('fetch', fetchMock);

			expect(await statusTypesStore.setOrder(['3', '1', '2'])).toEqual({ status: 'unconfirmed', showsSaved: true });
			expect(ids()).toEqual(['2', '3', '1']);
			expect(requests(fetchMock)).toEqual([
				['PUT', '/org/org-1/api/status-types/order'],
				['GET', '/org/org-1/api/status-types']
			]);
		});

		it('sends no move made during a save whose write failed', async () => {
			let answer!: (value: unknown) => void;
			const fetchMock = vi.fn((_url, options?: RequestInit) =>
				options
					? new Promise((resolve) => (answer = resolve))
					: Promise.resolve(reply(200, saved(['1', '2', '3'])))
			);
			vi.stubGlobal('fetch', fetchMock);

			const first = statusTypesStore.setOrder(['2', '1', '3']);
			const second = statusTypesStore.setOrder(['2', '3', '1']);
			answer(reply(500, { message: 'Internal server error' }));

			expect(await Promise.all([first, second])).toEqual([
				{ status: 'unconfirmed', showsSaved: true },
				{ status: 'unconfirmed', showsSaved: true }
			]);
			expect(requests(fetchMock)).toEqual([
				['PUT', '/org/org-1/api/status-types/order'],
				['GET', '/org/org-1/api/status-types']
			]);
			expect(ids()).toEqual(['1', '2', '3']);
		});

		it('keeps a newer load over a fresh read that answers after it', async () => {
			let answerRead!: (value: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) =>
					options
						? Promise.resolve(reply(409, { message: 'Changed.' }))
						: new Promise((resolve) => (answerRead = resolve))
				)
			);
			const toast = vi.spyOn(toastStore, 'error');

			const pending = statusTypesStore.setOrder(['3', '1', '2']);
			await vi.waitFor(() => expect(answerRead).toBeDefined());
			statusTypesStore.load(saved(['2', '1', '3']), 'org-1');
			answerRead(reply(200, saved(['3', '2', '1'])));

			expect(await pending).toEqual({ status: 'not-saved', message: 'Changed.', showsSaved: false });
			expect(ids()).toEqual(['2', '1', '3']);
			expect(toast).toHaveBeenCalledOnce();
		});

		it('keeps the shown order and says so when the fresh read also fails', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) =>
					Promise.resolve(options ? reply(409, { message: 'Changed.' }) : reply(500, {}))
				)
			);
			const toast = vi.spyOn(toastStore, 'error');

			expect(await statusTypesStore.setOrder(['3', '1', '2'])).toEqual({
				status: 'not-saved',
				message: 'Changed.',
				showsSaved: false
			});
			expect(ids()).toEqual(['1', '2', '3']);
			expect(toast).toHaveBeenCalledOnce();
		});

		it('refuses create, edit and delete until an order save settles', async () => {
			let respond!: (value: unknown) => void;
			const fetchMock = vi.fn(() => new Promise((resolve) => (respond = resolve)));
			vi.stubGlobal('fetch', fetchMock);
			const pending = statusTypesStore.setOrder(['2', '1', '3']);

			expect(statusTypesStore.orderBusy).toBe(true);
			expect(await statusTypesStore.add({ name: 'CQ', color: '#000', textColor: '#fff', shortLabel: null })).toBeNull();
			expect(await statusTypesStore.update('1', { name: 'Annual Leave' })).toBe(false);
			expect(await statusTypesStore.remove('3')).toBe(false);
			expect(fetchMock).toHaveBeenCalledOnce();

			respond(reply(200, { success: true }));
			expect(await pending).toEqual({ status: 'saved' });
			expect(statusTypesStore.orderBusy).toBe(false);
			expect(statusTypesStore.items.map((type) => type.name)).toEqual(['TDY', 'Leave', 'Sick']);
		});

		it('refuses an order change while an edit is saving', async () => {
			let respond!: (value: unknown) => void;
			const fetchMock = vi.fn(() => new Promise((resolve) => (respond = resolve)));
			vi.stubGlobal('fetch', fetchMock);
			const editing = statusTypesStore.update('1', { name: 'Annual Leave' });

			expect(await statusTypesStore.setOrder(['2', '1', '3'])).toEqual({ status: 'busy' });
			respond(reply(200, { ...leave, name: 'Annual Leave' }));
			expect(await editing).toBe(true);
			expect(fetchMock).toHaveBeenCalledOnce();
			expect(ids()).toEqual(['1', '2', '3']);
		});

		it('reports a save answered after an Organization switch as stale without changing the new list', async () => {
			let respond!: (value: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn(() => new Promise((resolve) => (respond = resolve)))
			);
			const pending = statusTypesStore.setOrder(['2', '1', '3']);
			statusTypesStore.load([sick], 'org-2');
			respond(reply(200, { success: true }));

			expect(await pending).toEqual({ status: 'stale' });
			expect(statusTypesStore.items).toEqual([sick]);
		});

		it('never settles a save answered after the Organization shell ends', async () => {
			let respond!: (value: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn(() => new Promise((resolve) => (respond = resolve)))
			);
			const pending = statusTypesStore.setOrder(['2', '1', '3']);
			const toast = vi.spyOn(toastStore, 'error');
			endOrganizationLifetime();
			statusTypesStore.load([leave, tdy, sick], 'org-1');
			respond(reply(200, { success: true }));

			expect(await settles(pending)).toBe(false);
			expect(ids()).toEqual(['1', '2', '3']);
			expect(toast).not.toHaveBeenCalled();
		});

		it('adopts the saved order when a reload lands during the save', async () => {
			let respond!: (value: unknown) => void;
			const fetchMock = vi.fn((_url, options?: RequestInit) =>
				options ? new Promise((resolve) => (respond = resolve)) : Promise.resolve(reply(200, saved(['2', '1', '3'])))
			);
			vi.stubGlobal('fetch', fetchMock);
			const pending = statusTypesStore.setOrder(['2', '1', '3']);
			statusTypesStore.load([leave, tdy, sick], 'org-1');
			respond(reply(200, { success: true }));

			expect(await pending).toEqual({ status: 'saved' });
			expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
				'/org/org-1/api/status-types/order',
				'/org/org-1/api/status-types'
			]);
			expect(ids()).toEqual(['2', '1', '3']);
		});

		it('reports an acknowledged save as unconfirmed when the read after a reload shows another order', async () => {
			let respond!: (value: unknown) => void;
			const fetchMock = vi.fn((_url, options?: RequestInit) =>
				options ? new Promise((resolve) => (respond = resolve)) : Promise.resolve(reply(200, saved(['3', '2', '1'])))
			);
			vi.stubGlobal('fetch', fetchMock);
			const pending = statusTypesStore.setOrder(['2', '1', '3']);
			statusTypesStore.load([leave, tdy, sick], 'org-1');
			respond(reply(200, { success: true }));

			expect(await pending).toEqual({ status: 'unconfirmed', showsSaved: true });
			expect(ids()).toEqual(['3', '2', '1']);
		});
	});
});
