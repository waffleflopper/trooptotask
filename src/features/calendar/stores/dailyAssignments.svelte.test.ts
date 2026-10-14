import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dailyAssignmentsStore } from './dailyAssignments.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { settles } from '$lib/test-support/settles';
import { endOrganizationLifetime } from '$lib/stores/core';

function mockFetch(response: unknown, status = 200) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(response),
		text: () => Promise.resolve(typeof response === 'string' ? response : JSON.stringify(response))
	});
}

const guardType = {
	id: '1',
	name: 'Guard',
	shortName: 'GD',
	assignTo: 'personnel' as const,
	color: '#000',
	exemptPersonnelIds: [],
	showInDateHeader: false
};

describe('regression: delete type then add type flow', () => {
	it('should show new type after deleting old type and adding new one', async () => {
		vi.restoreAllMocks();

		// Setup: load store with one type
		const typeA = {
			id: 'type-a',
			name: 'Old Type',
			shortName: 'OT',
			assignTo: 'personnel' as const,
			color: '#000',
			exemptPersonnelIds: [],
			showInDateHeader: false
		};
		dailyAssignmentsStore.load([typeA], [], 'org-1');
		expect(dailyAssignmentsStore.types).toEqual([typeA]);

		// Step 1: Delete typeA
		vi.stubGlobal('fetch', mockFetch(typeA));
		const deleteResult = await dailyAssignmentsStore.removeType('type-a');
		expect(deleteResult).toBe(true);
		expect(dailyAssignmentsStore.types).toEqual([]);

		// Step 2: Add typeB
		const typeB = {
			id: 'type-b',
			name: 'New Type',
			shortName: 'NT',
			assignTo: 'personnel' as const,
			color: '#fff',
			exemptPersonnelIds: [],
			showInDateHeader: false
		};
		vi.stubGlobal('fetch', mockFetch(typeB));
		const addResult = await dailyAssignmentsStore.addType({
			name: 'New Type',
			shortName: 'NT',
			assignTo: 'personnel',
			color: '#fff',
			exemptPersonnelIds: [],
			showInDateHeader: false
		});
		expect(addResult).toEqual(typeB);

		// Step 3: Verify store has ONLY typeB, not typeA
		expect(dailyAssignmentsStore.types).toEqual([typeB]);
		expect(dailyAssignmentsStore.types).not.toContainEqual(typeA);
	});
});

describe('dailyAssignmentsStore - core primitives composition', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		dailyAssignmentsStore.load([], [], 'org-1');
	});

	describe('load', () => {
		it('should set types and assignments on load', () => {
			const assignment = { id: 'a1', date: '2026-03-20', assignmentTypeId: '1', assigneeId: 'p1' };
			dailyAssignmentsStore.load([guardType], [assignment], 'org-1');
			expect(dailyAssignmentsStore.types).toEqual([guardType]);
			expect(dailyAssignmentsStore.assignments).toEqual([assignment]);
		});

		it('should allow load when org changes during in-flight mutation', async () => {
			let resolveFetch!: (value: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValue(
					new Promise((resolve) => {
						resolveFetch = resolve;
					}).then(() => ({ ok: true, status: 200, json: () => Promise.resolve({}) }))
				)
			);

			dailyAssignmentsStore.addType({
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#fff',
				exemptPersonnelIds: [],
				showInDateHeader: false
			});

			// Different org — should go through
			dailyAssignmentsStore.load(
				[
					{
						id: '10',
						name: 'Other',
						shortName: 'OT',
						assignTo: 'group' as const,
						color: '#aaa',
						exemptPersonnelIds: [],
						showInDateHeader: false
					}
				],
				[],
				'org-2'
			);

			expect(dailyAssignmentsStore.types).toEqual([
				{
					id: '10',
					name: 'Other',
					shortName: 'OT',
					assignTo: 'group',
					color: '#aaa',
					exemptPersonnelIds: [],
					showInDateHeader: false
				}
			]);

			resolveFetch(undefined);
		});
	});

	describe('addType', () => {
		it('should optimistically add and reconcile with server response', async () => {
			const serverType = {
				id: 'server-1',
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel' as const,
				color: '#fff',
				exemptPersonnelIds: [],
				showInDateHeader: false
			};
			vi.stubGlobal('fetch', mockFetch(serverType));

			const result = await dailyAssignmentsStore.addType({
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#fff',
				exemptPersonnelIds: [],
				showInDateHeader: false
			});

			expect(result).toEqual(serverType);
			expect(dailyAssignmentsStore.types).toEqual([serverType]);
		});

		it('should rollback on failure', async () => {
			vi.stubGlobal('fetch', mockFetch(null, 500));

			await expect(
				dailyAssignmentsStore.addType({
					name: 'CQ',
					shortName: 'CQ',
					assignTo: 'personnel',
					color: '#fff',
					exemptPersonnelIds: [],
					showInDateHeader: false
				})
			).rejects.toThrow('POST assignment-types failed (500)');

			expect(dailyAssignmentsStore.types).toEqual([]);
		});

		it('should not clobber optimistic addType when load is called mid-flight', async () => {
			dailyAssignmentsStore.load([guardType], [], 'org-1');

			let resolveFetch!: (value: unknown) => void;
			const fetchPromise = new Promise((resolve) => {
				resolveFetch = resolve;
			});
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValue(
					fetchPromise.then(() => ({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								id: 'server-2',
								name: 'CQ',
								shortName: 'CQ',
								assignTo: 'personnel',
								color: '#fff',
								exemptPersonnelIds: [],
								showInDateHeader: false
							})
					}))
				)
			);

			const addPromise = dailyAssignmentsStore.addType({
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#fff',
				exemptPersonnelIds: [],
				showInDateHeader: false
			});

			expect(dailyAssignmentsStore.types.length).toBe(2);

			// Stale load arrives
			dailyAssignmentsStore.load([guardType], [], 'org-1');

			expect(dailyAssignmentsStore.types.length).toBe(2);
			expect(dailyAssignmentsStore.types.some((t) => t.name === 'CQ')).toBe(true);

			resolveFetch(undefined);
			await addPromise;
		});
	});

	describe('updateType', () => {
		it('should optimistically update and reconcile', async () => {
			dailyAssignmentsStore.load([guardType], [], 'org-1');
			const updated = { ...guardType, name: 'Guard Updated' };
			vi.stubGlobal('fetch', mockFetch(updated));

			const result = await dailyAssignmentsStore.updateType('1', { name: 'Guard Updated' });
			expect(result).toBe(true);
			expect(dailyAssignmentsStore.types[0].name).toBe('Guard Updated');
		});

		it('should rollback on failure', async () => {
			dailyAssignmentsStore.load([guardType], [], 'org-1');
			vi.stubGlobal('fetch', mockFetch(null, 500));
			const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

			const result = await dailyAssignmentsStore.updateType('1', { name: 'Failed' });
			expect(result).toBe(false);
			expect(dailyAssignmentsStore.types[0].name).toBe('Guard');
			expect(errorToast).toHaveBeenCalledOnce();
		});

		it('should return false for non-existent id', async () => {
			const result = await dailyAssignmentsStore.updateType('nonexistent', { name: 'X' });
			expect(result).toBe(false);
		});
	});

	describe('removeType', () => {
		it('should optimistically remove type and cascade assignments', async () => {
			const assignment = { id: 'a1', date: '2026-03-20', assignmentTypeId: '1', assigneeId: 'p1' };
			dailyAssignmentsStore.load([guardType], [assignment], 'org-1');

			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: true,
					status: 200,
					json: () => Promise.resolve({})
				})
			);

			const result = await dailyAssignmentsStore.removeType('1');
			expect(result).toBe(true);
			expect(dailyAssignmentsStore.types).toEqual([]);
			expect(dailyAssignmentsStore.assignments).toEqual([]);
		});

		it('should rollback type and assignments on failure', async () => {
			const assignment = { id: 'a1', date: '2026-03-20', assignmentTypeId: '1', assigneeId: 'p1' };
			dailyAssignmentsStore.load([guardType], [assignment], 'org-1');

			vi.stubGlobal('fetch', mockFetch(null, 500));

			const result = await dailyAssignmentsStore.removeType('1');
			expect(result).toBe(false);
			expect(dailyAssignmentsStore.types).toEqual([guardType]);
			expect(dailyAssignmentsStore.assignments).toEqual([assignment]);
		});

		it('should return false for non-existent id', async () => {
			const result = await dailyAssignmentsStore.removeType('nonexistent');
			expect(result).toBe(false);
		});
	});

	describe('setAssignment', () => {
		it('should optimistically set and reconcile', async () => {
			const serverAssignment = { id: 'sa1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p1' };
			vi.stubGlobal('fetch', mockFetch(serverAssignment));

			const result = await dailyAssignmentsStore.setAssignment('2026-03-20', 'type-1', 'p1');
			expect(result).toBe(true);
			expect(dailyAssignmentsStore.assignments).toEqual([serverAssignment]);
		});

		it('should not clobber optimistic setAssignment when load is called mid-flight', async () => {
			dailyAssignmentsStore.load([{ ...guardType, id: 'type-1' }], [], 'org-1');

			let resolveFetch!: (value: unknown) => void;
			const fetchPromise = new Promise((resolve) => {
				resolveFetch = resolve;
			});
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValue(
					fetchPromise.then(() => ({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								id: 'server-a1',
								date: '2026-03-17',
								assignmentTypeId: 'type-1',
								assigneeId: 'person-1'
							})
					}))
				)
			);

			const setPromise = dailyAssignmentsStore.setAssignment('2026-03-17', 'type-1', 'person-1');

			expect(dailyAssignmentsStore.assignments.length).toBe(1);

			// Stale load
			dailyAssignmentsStore.load([{ ...guardType, id: 'type-1' }], [], 'org-1');

			expect(dailyAssignmentsStore.assignments.length).toBe(1);

			resolveFetch(undefined);
			await setPromise;
		});

		it('should rollback on failure', async () => {
			vi.stubGlobal('fetch', mockFetch(null, 500));

			const result = await dailyAssignmentsStore.setAssignment('2026-03-20', 'type-1', 'p1');
			expect(result).toBe(false);
			expect(dailyAssignmentsStore.assignments).toEqual([]);
		});

		it('restores an occupied slot and shows a generic conflict after a rejected replacement', async () => {
			const existing = { id: 'hidden-slot', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-old' };
			dailyAssignmentsStore.load([], [existing], 'org-1');
			vi.stubGlobal(
				'fetch',
				mockFetch({ message: 'This assignment slot is unavailable. Refresh the Calendar and try again.' }, 409)
			);
			const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

			const result = await dailyAssignmentsStore.setAssignment('2026-03-20', 'type-1', 'p1');

			expect(result).toBe(false);
			expect(dailyAssignmentsStore.assignments).toEqual([existing]);
			expect(errorToast).toHaveBeenCalledWith(
				'This assignment slot is unavailable. Refresh the Calendar and try again.'
			);
		});
	});

	describe('removeAssignment', () => {
		it('should optimistically remove and confirm', async () => {
			const assignment = { id: 'a1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p1' };
			dailyAssignmentsStore.load([], [assignment], 'org-1');

			vi.stubGlobal('fetch', mockFetch({}));

			const result = await dailyAssignmentsStore.removeAssignment('2026-03-20', 'type-1');
			expect(result).toBe(true);
			expect(dailyAssignmentsStore.assignments).toEqual([]);
		});

		it('should rollback on failure', async () => {
			const assignment = { id: 'a1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p1' };
			dailyAssignmentsStore.load([], [assignment], 'org-1');

			vi.stubGlobal('fetch', mockFetch(null, 500));

			const result = await dailyAssignmentsStore.removeAssignment('2026-03-20', 'type-1');
			expect(result).toBe(false);
			expect(dailyAssignmentsStore.assignments).toEqual([assignment]);
		});

		it('should return false for non-existent assignment', async () => {
			const result = await dailyAssignmentsStore.removeAssignment('2026-03-20', 'type-1');
			expect(result).toBe(false);
		});
	});

	describe('query methods', () => {
		const assignments = [
			{ id: 'a1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p1' },
			{ id: 'a2', date: '2026-03-20', assignmentTypeId: 'type-2', assigneeId: 'p2' },
			{ id: 'a3', date: '2026-03-21', assignmentTypeId: 'type-1', assigneeId: 'p1' },
			{ id: 'a4', date: '2026-03-20', assignmentTypeId: 'type-3', assigneeId: 'group-alpha' }
		];

		beforeEach(() => {
			dailyAssignmentsStore.load([guardType], assignments, 'org-1');
		});

		it('getTypeById returns correct type', () => {
			expect(dailyAssignmentsStore.getTypeById('1')).toEqual(guardType);
			expect(dailyAssignmentsStore.getTypeById('nonexistent')).toBeUndefined();
		});

		it('getAssignmentsForDate returns correct assignments', () => {
			const result = dailyAssignmentsStore.getAssignmentsForDate('2026-03-20');
			expect(result.length).toBe(3);
		});

		it('getAssignmentForDate returns single assignment', () => {
			const result = dailyAssignmentsStore.getAssignmentForDate('2026-03-20', 'type-1');
			expect(result).toEqual(assignments[0]);
		});

		it('getAssignmentsForPersonnel returns correct assignments', () => {
			const result = dailyAssignmentsStore.getAssignmentsForPersonnel('p1');
			expect(result.length).toBe(2);
		});

		it('getAssignmentsForGroup returns correct assignments', () => {
			const result = dailyAssignmentsStore.getAssignmentsForGroup('group-alpha');
			expect(result.length).toBe(1);
		});

		it('getPersonnelAssignmentsForDate returns correct assignments', () => {
			const result = dailyAssignmentsStore.getPersonnelAssignmentsForDate('p1', '2026-03-20');
			expect(result.length).toBe(1);
			expect(result[0]).toEqual(assignments[0]);
		});
	});

	describe('showInDateHeader field', () => {
		it('loads a type with showInDateHeader: true and exposes it', () => {
			const featuredType = { ...guardType, id: 'f1', showInDateHeader: true };
			dailyAssignmentsStore.load([guardType, featuredType], [], 'org-1');
			const found = dailyAssignmentsStore.getTypeById('f1');
			expect(found?.showInDateHeader).toBe(true);
		});
	});

	describe('setDateHeader', () => {
		const staff = { ...guardType, id: 'staff', name: 'Staff', showInDateHeader: true };
		const group = { ...guardType, id: 'group', name: 'Group' };
		const retiring = { ...guardType, id: 'retiring', name: 'Retiring' };
		const headers = () =>
			Object.fromEntries(dailyAssignmentsStore.types.map((type) => [type.id, type.showInDateHeader]));
		const reply = (status: number, body: unknown) => ({
			ok: status >= 200 && status < 300,
			status,
			json: () => Promise.resolve(body),
			text: () => Promise.resolve(JSON.stringify(body))
		});

		beforeEach(() => {
			vi.restoreAllMocks();
			dailyAssignmentsStore.load([staff, group, retiring], [], 'org-1');
		});

		it('sends one command and shows only the chosen type as the header once saved', async () => {
			const fetchMock = vi.fn().mockResolvedValue(reply(200, { success: true }));
			vi.stubGlobal('fetch', fetchMock);
			const toast = vi.spyOn(toastStore, 'error');

			expect(await dailyAssignmentsStore.setDateHeader('group')).toEqual({ status: 'saved' });
			expect(headers()).toEqual({ staff: false, group: true, retiring: false });
			expect(fetchMock.mock.calls).toEqual([
				[
					'/org/org-1/api/assignment-types/date-header',
					{
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ assignmentTypeId: 'group' })
					}
				]
			]);
			expect(toast).not.toHaveBeenCalled();
		});

		it.each([400, 401, 403, 404, 409])('reports a %i as not saved and adopts one fresh read', async (status) => {
			const stored = [staff, retiring];
			const fetchMock = vi.fn((_url, options?: RequestInit) =>
				Promise.resolve(
					options ? reply(status, { message: 'That assignment type is no longer available.' }) : reply(200, stored)
				)
			);
			vi.stubGlobal('fetch', fetchMock);
			const toast = vi.spyOn(toastStore, 'error');

			expect(await dailyAssignmentsStore.setDateHeader('group')).toEqual({
				status: 'not-saved',
				message: 'That assignment type is no longer available.',
				showsSaved: true
			});
			expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
				'/org/org-1/api/assignment-types/date-header',
				'/org/org-1/api/assignment-types'
			]);
			expect(dailyAssignmentsStore.types).toEqual(stored);
			expect(toast).not.toHaveBeenCalled();
		});

		it.each([
			['a 408', () => Promise.resolve(reply(408, {}))],
			['a 500', () => Promise.resolve(reply(500, { message: 'Internal server error' }))],
			['the unconfirmed 503', () => Promise.resolve(reply(503, { message: 'unconfirmed' }))],
			['a rejected request', () => Promise.reject(new TypeError('Failed to fetch'))]
		])('reports %s as unconfirmed and shows the stored header from one fresh read', async (_label, answer) => {
			const stored = [{ ...staff, showInDateHeader: false }, group, { ...retiring, showInDateHeader: true }];
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) => (options ? answer() : Promise.resolve(reply(200, stored))))
			);

			expect(await dailyAssignmentsStore.setDateHeader('group')).toEqual({ status: 'unconfirmed', showsSaved: true });
			expect(headers()).toEqual({ staff: false, group: false, retiring: true });
		});

		it('reports a 409 with an unreadable body as not saved and still adopts one fresh read', async () => {
			const stored = [staff, retiring];
			const fetchMock = vi.fn((_url, options?: RequestInit) =>
				Promise.resolve(
					options
						? { ok: false, status: 409, text: () => Promise.reject(new TypeError('error body interrupted')) }
						: reply(200, stored)
				)
			);
			vi.stubGlobal('fetch', fetchMock);

			expect(await dailyAssignmentsStore.setDateHeader('group')).toEqual({
				status: 'not-saved',
				message: 'Failed to update the date header',
				showsSaved: true
			});
			expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
				'/org/org-1/api/assignment-types/date-header',
				'/org/org-1/api/assignment-types'
			]);
			expect(dailyAssignmentsStore.types).toEqual(stored);
		});

		it.each([
			['an object', { saved: true }],
			['a malformed type', [staff, {}]]
		])('keeps the shown types when the fresh read returns %s', async (_label, body) => {
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) => Promise.resolve(options ? reply(503, {}) : reply(200, body)))
			);

			expect(await dailyAssignmentsStore.setDateHeader('group')).toEqual({ status: 'unconfirmed', showsSaved: false });
			expect(dailyAssignmentsStore.types).toEqual([staff, group, retiring]);
		});

		it('adopts a valid empty catalog from the fresh read', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) =>
					Promise.resolve(options ? reply(404, { message: 'Not found' }) : reply(200, []))
				)
			);

			expect(await dailyAssignmentsStore.setDateHeader('group')).toEqual({
				status: 'not-saved',
				message: 'Not found',
				showsSaved: true
			});
			expect(dailyAssignmentsStore.types).toEqual([]);
		});

		it.each([
			[
				'a later saved choice as unconfirmed',
				{ staff: false, group: false, retiring: true },
				{ status: 'unconfirmed', showsSaved: true }
			],
			['this choice as saved', { staff: false, group: true, retiring: false }, { status: 'saved' }]
		])('reads again when a reload lands before a committed reply and reports %s', async (_label, stored, result) => {
			let respond!: (value: unknown) => void;
			const fetchMock = vi.fn((_url, options?: RequestInit) =>
				options
					? new Promise((resolve) => (respond = resolve))
					: Promise.resolve(
							reply(
								200,
								[staff, group, retiring].map((type) => ({
									...type,
									showInDateHeader: stored[type.id as keyof typeof stored]
								}))
							)
						)
			);
			vi.stubGlobal('fetch', fetchMock);
			const pending = dailyAssignmentsStore.setDateHeader('group');
			await vi.waitFor(() => expect(respond).toBeDefined());
			dailyAssignmentsStore.load(
				[{ ...staff, showInDateHeader: false }, group, { ...retiring, showInDateHeader: true }],
				[],
				'org-1'
			);
			respond(reply(200, { success: true }));

			expect(await pending).toEqual(result);
			expect(headers()).toEqual(stored);
			expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
				'/org/org-1/api/assignment-types/date-header',
				'/org/org-1/api/assignment-types'
			]);
		});

		it('keeps a newer reload when the read after a committed reply fails', async () => {
			let respond!: (value: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) =>
					options ? new Promise((resolve) => (respond = resolve)) : Promise.resolve(reply(500, {}))
				)
			);
			const pending = dailyAssignmentsStore.setDateHeader('group');
			await vi.waitFor(() => expect(respond).toBeDefined());
			dailyAssignmentsStore.load(
				[{ ...staff, showInDateHeader: false }, group, { ...retiring, showInDateHeader: true }],
				[],
				'org-1'
			);
			respond(reply(200, { success: true }));

			expect(await pending).toEqual({ status: 'unconfirmed', showsSaved: false });
			expect(headers()).toEqual({ staff: false, group: false, retiring: true });
		});

		it('keeps the shown header and says the read failed when the fresh read fails', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) =>
					options ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(reply(500, {}))
				)
			);

			expect(await dailyAssignmentsStore.setDateHeader('group')).toEqual({ status: 'unconfirmed', showsSaved: false });
			expect(headers()).toEqual({ staff: true, group: false, retiring: false });
		});

		it('keeps a same-Organization reload that lands during the fresh read', async () => {
			let respondRead!: (value: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) =>
					options ? Promise.resolve(reply(503, {})) : new Promise((resolve) => (respondRead = resolve))
				)
			);
			const pending = dailyAssignmentsStore.setDateHeader('group');
			await vi.waitFor(() => expect(respondRead).toBeDefined());
			const reloaded = [
				{ ...staff, showInDateHeader: false },
				{ ...group, showInDateHeader: true }
			];
			dailyAssignmentsStore.load(reloaded, [], 'org-1');
			respondRead(reply(200, [staff, group, retiring]));

			expect(await pending).toEqual({ status: 'unconfirmed', showsSaved: false });
			expect(dailyAssignmentsStore.types).toEqual(reloaded);
		});

		it('reports a choice answered after an Organization switch as stale without changing the new list', async () => {
			let respond!: (value: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn(() => new Promise((resolve) => (respond = resolve)))
			);
			const pending = dailyAssignmentsStore.setDateHeader('group');
			dailyAssignmentsStore.load([retiring], [], 'org-2');
			respond(reply(200, { success: true }));

			expect(await pending).toEqual({ status: 'stale' });
			expect(dailyAssignmentsStore.types).toEqual([retiring]);
		});

		it('never settles a choice answered after the Organization shell ends', async () => {
			let respond!: (value: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn(() => new Promise((resolve) => (respond = resolve)))
			);
			const pending = dailyAssignmentsStore.setDateHeader('group');
			endOrganizationLifetime();
			dailyAssignmentsStore.load([staff, group, retiring], [], 'org-1');
			respond(reply(200, { success: true }));

			expect(await settles(pending)).toBe(false);
			expect(headers()).toEqual({ staff: true, group: false, retiring: false });
		});

		it('reports type writes as busy until they settle', async () => {
			let respond!: (value: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn(() => new Promise((resolve) => (respond = resolve)))
			);
			expect(dailyAssignmentsStore.typesBusy).toBe(false);
			const pending = dailyAssignmentsStore.updateType('group', { name: 'Group Night' });
			expect(dailyAssignmentsStore.typesBusy).toBe(true);
			respond(reply(200, { ...group, name: 'Group Night' }));
			await pending;
			expect(dailyAssignmentsStore.typesBusy).toBe(false);
		});
	});

	describe('setAssignmentBatch', () => {
		it('should optimistically batch set and reconcile', async () => {
			const inserted = [
				{ id: 'sa1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p1' },
				{ id: 'sa2', date: '2026-03-20', assignmentTypeId: 'type-2', assigneeId: 'p2' }
			];
			vi.stubGlobal('fetch', mockFetch({ inserted }));

			const result = await dailyAssignmentsStore.setAssignmentBatch([
				{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p1' },
				{ date: '2026-03-20', assignmentTypeId: 'type-2', assigneeId: 'p2' }
			]);

			expect(result).toBe(true);
			expect(dailyAssignmentsStore.assignments).toEqual(inserted);
		});

		it('shows the replacement slots while a batch is in flight', async () => {
			const replaced = { id: 'a1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-old' };
			const cleared = { id: 'a2', date: '2026-03-21', assignmentTypeId: 'type-1', assigneeId: 'p-old' };
			const untouched = { id: 'a3', date: '2026-03-20', assignmentTypeId: 'type-2', assigneeId: 'p-other' };
			dailyAssignmentsStore.load([], [replaced, cleared, untouched], 'org-1');
			let respond!: (response: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn(() => new Promise((resolve) => (respond = resolve)))
			);

			const batch = dailyAssignmentsStore.setAssignmentBatch([
				{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-new' },
				{ date: '2026-03-21', assignmentTypeId: 'type-1', assigneeId: '' }
			]);

			expect(
				dailyAssignmentsStore.assignments.map(({ date, assignmentTypeId, assigneeId }) => [
					date,
					assignmentTypeId,
					assigneeId
				])
			).toEqual([
				['2026-03-20', 'type-2', 'p-other'],
				['2026-03-20', 'type-1', 'p-new']
			]);

			const saved = { id: 'a4', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-new' };
			respond({ ok: true, status: 200, json: () => Promise.resolve({ inserted: [saved] }) });
			await expect(batch).resolves.toBe(true);
			expect(dailyAssignmentsStore.assignments).toEqual([untouched, saved]);
		});

		it('should rollback batch on failure', async () => {
			const existing = { id: 'a1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-old' };
			dailyAssignmentsStore.load([], [existing], 'org-1');

			vi.stubGlobal('fetch', mockFetch(null, 500));

			const result = await dailyAssignmentsStore.setAssignmentBatch([
				{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-new' }
			]);

			expect(result).toBe(false);
			expect(dailyAssignmentsStore.assignments).toEqual([existing]);
		});

		it('clears an existing assignment through batch input with a blank assignee', async () => {
			const existing = { id: 'a1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-old' };
			dailyAssignmentsStore.load([], [existing], 'org-1');
			vi.stubGlobal('fetch', mockFetch({ inserted: [] }));

			const result = await dailyAssignmentsStore.setAssignmentBatch([
				{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: '   ' }
			]);

			expect(result).toBe(true);
			expect(dailyAssignmentsStore.assignments).toEqual([]);
			expect(fetch).toHaveBeenCalledWith(
				'/org/org-1/api/daily-assignments/batch',
				expect.objectContaining({
					body: JSON.stringify({
						records: [{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: '' }]
					})
				})
			);
		});

		it('rejects duplicate set records for one daily assignment slot before optimistic changes', async () => {
			const existing = { id: 'a1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-old' };
			dailyAssignmentsStore.load([], [existing], 'org-1');
			vi.stubGlobal('fetch', vi.fn());
			const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

			const result = await dailyAssignmentsStore.setAssignmentBatch([
				{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-new' },
				{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-other' }
			]);

			expect(result).toBe(false);
			expect(fetch).not.toHaveBeenCalled();
			expect(dailyAssignmentsStore.assignments).toEqual([existing]);
			expect(errorToast).toHaveBeenCalledWith('Duplicate daily assignment slot in batch: 2026-03-20 / type-1');
		});

		it('rejects duplicate clear records and mixed set clear records with the same invalid-batch rule', async () => {
			const existing = { id: 'a1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-old' };
			dailyAssignmentsStore.load([], [existing], 'org-1');
			vi.stubGlobal('fetch', vi.fn());

			await expect(
				dailyAssignmentsStore.setAssignmentBatch([
					{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: '' },
					{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: ' ' }
				])
			).resolves.toBe(false);
			expect(dailyAssignmentsStore.assignments).toEqual([existing]);

			await expect(
				dailyAssignmentsStore.setAssignmentBatch([
					{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-new' },
					{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: '' }
				])
			).resolves.toBe(false);
			expect(fetch).not.toHaveBeenCalled();
			expect(dailyAssignmentsStore.assignments).toEqual([existing]);
		});

		it('restores a batch slot and shows a generic conflict after a rejected replacement', async () => {
			const existing = { id: 'occupied-slot', date: '2026-03-21', assignmentTypeId: 'type-1', assigneeId: 'p-old' };
			dailyAssignmentsStore.load([], [existing], 'org-1');
			vi.stubGlobal(
				'fetch',
				mockFetch({ message: 'This assignment slot is unavailable. Refresh the Calendar and try again.' }, 409)
			);
			const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

			const result = await dailyAssignmentsStore.setAssignmentBatch([
				{ date: '2026-03-21', assignmentTypeId: 'type-1', assigneeId: 'p1' }
			]);

			expect(result).toBe(false);
			expect(dailyAssignmentsStore.assignments).toEqual([existing]);
			expect(errorToast).toHaveBeenCalledWith(
				'This assignment slot is unavailable. Refresh the Calendar and try again.'
			);
		});
	});
});

describe('dailyAssignmentsStore - responses that finish after an Organization switch', () => {
	const slot = { date: '2026-09-22', assignmentTypeId: 'type-a' };
	const heldRow = { id: 'held-a', ...slot, assigneeId: 'able' };
	const occupiedA = { id: 'occupied-a', ...slot, assigneeId: 'old' };
	const rowB = { id: 'row-b', date: '2026-09-22', assignmentTypeId: 'type-b', assigneeId: 'foreign' };
	const currentA = { id: 'current-a', ...slot, assigneeId: 'baker' };

	const mutations = {
		set: {
			start: () => dailyAssignmentsStore.setAssignment(slot.date, slot.assignmentTypeId, 'able'),
			body: heldRow
		},
		remove: {
			start: () => dailyAssignmentsStore.removeAssignment(slot.date, slot.assignmentTypeId),
			body: {}
		},
		batch: {
			start: () => dailyAssignmentsStore.setAssignmentBatch([{ ...slot, assigneeId: 'able' }]),
			body: { inserted: [heldRow] }
		}
	};
	const switches = {
		'A to B': { load: () => dailyAssignmentsStore.load([], [rowB], 'org-b'), current: [rowB] },
		'A to B to A': {
			load: () => {
				dailyAssignmentsStore.load([], [rowB], 'org-b');
				dailyAssignmentsStore.load([], [currentA], 'org-a');
			},
			current: [currentA]
		}
	};
	const outcomes = {
		success: (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) }),
		failure: () => ({
			ok: false,
			status: 503,
			json: () => Promise.resolve({ message: 'Synthetic request failure' }),
			text: () => Promise.resolve(JSON.stringify({ message: 'Synthetic request failure' }))
		})
	};

	beforeEach(() => {
		vi.restoreAllMocks();
		dailyAssignmentsStore.load([], [occupiedA], 'org-a');
	});

	for (const [mutationName, mutation] of Object.entries(mutations)) {
		for (const [switchName, organizationSwitch] of Object.entries(switches)) {
			for (const [outcomeName, respond] of Object.entries(outcomes)) {
				it(`${mutationName} ${outcomeName} after ${switchName} leaves the current rows and feedback alone`, async () => {
					let release!: (response: unknown) => void;
					vi.stubGlobal(
						'fetch',
						vi.fn(() => new Promise((resolve) => (release = resolve)))
					);
					const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

					const pending = mutation.start();
					organizationSwitch.load();
					release(respond(mutation.body));

					expect(await settles(pending)).toBe(false);
					expect(dailyAssignmentsStore.assignments).toEqual(organizationSwitch.current);
					expect(errorToast).not.toHaveBeenCalled();
				});
			}
		}
	}

	it('keeps an edit made after returning to A when the earlier A save finishes', async () => {
		const releases: ((response: unknown) => void)[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise((resolve) => releases.push(resolve)))
		);

		const stale = dailyAssignmentsStore.setAssignment(slot.date, slot.assignmentTypeId, 'able');
		switches['A to B to A'].load();
		const current = dailyAssignmentsStore.setAssignment(slot.date, slot.assignmentTypeId, 'charlie');
		releases[0](outcomes.success(heldRow));
		expect(await settles(stale)).toBe(false);

		expect(dailyAssignmentsStore.assignments.map((row) => row.assigneeId)).toEqual(['charlie']);

		const saved = { id: 'charlie-a', ...slot, assigneeId: 'charlie' };
		releases[1](outcomes.success(saved));
		await expect(current).resolves.toBe(true);
		expect(dailyAssignmentsStore.assignments).toEqual([saved]);
	});
});
