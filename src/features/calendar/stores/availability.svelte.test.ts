import { describe, it, expect, vi, beforeEach } from 'vitest';
import { availabilityStore } from './availability.svelte';
import { endOrganizationLifetime, rejectedRequestMessage } from '$lib/stores/core';
import { settles } from '$lib/test-support/settles';
import type { AvailabilityEntry } from '$features/calendar/contracts';

const mockEntries: AvailabilityEntry[] = [
	{ id: '1', personnelId: 'p1', statusTypeId: 'st1', startDate: '2026-03-01', endDate: '2026-03-05', note: null },
	{ id: '2', personnelId: 'p1', statusTypeId: 'st2', startDate: '2026-03-10', endDate: '2026-03-15', note: null },
	{ id: '3', personnelId: 'p2', statusTypeId: 'st1', startDate: '2026-03-01', endDate: '2026-03-03', note: null }
];

function mockFetch(response: unknown) {
	return vi.fn().mockResolvedValue({
		ok: true,
		status: 200,
		json: () => Promise.resolve(response)
	});
}

describe('availabilityStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		availabilityStore.load(structuredClone(mockEntries), 'org-1');
	});

	describe('addBatch', () => {
		function record(n: number): Omit<AvailabilityEntry, 'id'> {
			return { personnelId: `p${n}`, statusTypeId: 'st1', startDate: '2026-04-01', endDate: '2026-04-05', note: null };
		}

		it('should add multiple entries optimistically', async () => {
			const inserted: AvailabilityEntry[] = [{ id: '4', ...record(3) }];
			vi.stubGlobal('fetch', mockFetch({ inserted }));

			const result = await availabilityStore.addBatch([record(3)]);

			expect(result).toHaveLength(1);
			expect(availabilityStore.items).toHaveLength(4);
		});

		it('submits large batches in 500-record chunks', async () => {
			let idCounter = 0;
			const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
				const { records } = JSON.parse(init.body as string);
				const inserted = records.map((r: Omit<AvailabilityEntry, 'id'>) => ({ id: `new-${idCounter++}`, ...r }));
				return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ inserted }) });
			});
			vi.stubGlobal('fetch', fetchMock);

			const result = await availabilityStore.addBatch(Array.from({ length: 501 }, (_, i) => record(i)));

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(JSON.parse(fetchMock.mock.calls[0][1].body).records).toHaveLength(500);
			expect(JSON.parse(fetchMock.mock.calls[1][1].body).records).toHaveLength(1);
			expect(result).toHaveLength(501);
			expect(new Set(result.map((entry) => entry.id)).size).toBe(501);
		});

		it.each(['an Organization switch', 'the Organization shell ending'] as const)(
			'sends no later chunk after %s',
			async (departure) => {
				let release!: (response: unknown) => void;
				const fetchMock = vi.fn((_url: string, _init?: RequestInit) => new Promise((resolve) => (release = resolve)));
				vi.stubGlobal('fetch', fetchMock);

				const pending = availabilityStore.addBatch(Array.from({ length: 501 }, (_, i) => record(i)));
				if (departure === 'an Organization switch') availabilityStore.load([], 'org-2');
				else endOrganizationLifetime();
				release({ ok: true, status: 200, json: () => Promise.resolve({ inserted: [] }) });

				expect(await settles(pending)).toBe(false);
				expect(fetchMock).toHaveBeenCalledTimes(1);
				expect(fetchMock.mock.calls[0][0]).toBe('/org/org-1/api/availability/batch');
			}
		);

		it('keeps going past a failed chunk and returns the inserted entries', async () => {
			let call = 0;
			let idCounter = 0;
			const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
				call += 1;
				if (call === 1) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
				const { records } = JSON.parse(init.body as string);
				const inserted = records.map((r: Omit<AvailabilityEntry, 'id'>) => ({ id: `new-${idCounter++}`, ...r }));
				return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ inserted }) });
			});
			vi.stubGlobal('fetch', fetchMock);

			const result = await availabilityStore.addBatch(Array.from({ length: 501 }, (_, i) => record(i)));

			expect(result).toHaveLength(1);
		});

		it('rejects with the server reason and keeps the saved entries when every chunk fails', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(Response.json({ message: 'Note must be 200 characters or fewer' }, { status: 400 }))
			);

			const failure = await availabilityStore.addBatch([record(3)]).catch((error: unknown) => error);

			expect(rejectedRequestMessage(failure, 'fallback')).toBe('Note must be 200 characters or fewer');
			expect(availabilityStore.items).toHaveLength(3);
		});
	});

	describe('single writes', () => {
		it('reject with the server reason when an addition or edit is refused', async () => {
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockResolvedValueOnce(Response.json({ message: 'This status type was deleted.' }, { status: 404 }))
					.mockResolvedValueOnce(Response.json({ message: 'This status was changed elsewhere.' }, { status: 409 }))
			);

			const added = await availabilityStore
				.add({ personnelId: 'p2', statusTypeId: 'gone', startDate: '2026-03-20', endDate: '2026-03-20', note: null })
				.catch((error: unknown) => error);
			const updated = await availabilityStore.updateOrThrow('1', { note: 'Moved' }).catch((error: unknown) => error);

			expect(rejectedRequestMessage(added, 'fallback')).toBe('This status type was deleted.');
			expect(rejectedRequestMessage(updated, 'fallback')).toBe('This status was changed elsewhere.');
			expect(availabilityStore.items).toEqual(mockEntries);
		});
	});

	describe('removeBatch', () => {
		it('reports the server count when fewer entries were deleted than requested', async () => {
			vi.stubGlobal('fetch', mockFetch({ deleted: 1 }));

			const result = await availabilityStore.removeBatch(['1', '3']);

			expect(result).toEqual({ kind: 'removed', deleted: 1 });
			expect(availabilityStore.items).toHaveLength(1);
		});

		describe('chunking', () => {
			function loadEntries(count: number) {
				availabilityStore.load(
					Array.from({ length: count }, (_, i) => ({ ...mockEntries[0], id: `e${i}` })),
					'org-1'
				);
				return availabilityStore.items.map((entry) => entry.id);
			}

			function deleteRequests(fetchMock: ReturnType<typeof vi.fn>): string[][] {
				return fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string).ids);
			}

			function replyingWithCounts(failOnCall?: number) {
				let call = 0;
				return vi.fn().mockImplementation((_url: string, init: RequestInit) => {
					call++;
					if (call === failOnCall) {
						return Promise.resolve({
							ok: false,
							status: 500,
							json: () => Promise.resolve({ message: 'Server error' })
						});
					}
					const { ids } = JSON.parse(init.body as string);
					return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ deleted: ids.length }) });
				});
			}

			it('sends 500 IDs in one request', async () => {
				const ids = loadEntries(500);
				const fetchMock = replyingWithCounts();
				vi.stubGlobal('fetch', fetchMock);

				const result = await availabilityStore.removeBatch(ids);

				expect(result).toEqual({ kind: 'removed', deleted: 500 });
				expect(deleteRequests(fetchMock).map((chunk) => chunk.length)).toEqual([500]);
				expect(availabilityStore.items).toEqual([]);
			});

			it('sends 501 IDs as 500 then 1, in review order, and sums the deleted counts', async () => {
				const ids = loadEntries(501);
				const fetchMock = replyingWithCounts();
				vi.stubGlobal('fetch', fetchMock);

				const result = await availabilityStore.removeBatch(ids);

				const requests = deleteRequests(fetchMock);
				expect(requests.map((chunk) => chunk.length)).toEqual([500, 1]);
				expect(requests.flat()).toEqual(ids);
				expect(result).toEqual({ kind: 'removed', deleted: 501 });
				expect(availabilityStore.items).toEqual([]);
			});

			it('sends 1,001 IDs as three requests', async () => {
				const ids = loadEntries(1001);
				const fetchMock = replyingWithCounts();
				vi.stubGlobal('fetch', fetchMock);

				await availabilityStore.removeBatch(ids);

				expect(deleteRequests(fetchMock).map((chunk) => chunk.length)).toEqual([500, 500, 1]);
			});

			it('reports the server count when a chunk deletes fewer rows than it sent', async () => {
				const ids = loadEntries(501);
				let call = 0;
				vi.stubGlobal(
					'fetch',
					vi.fn().mockImplementation(() => {
						call++;
						return Promise.resolve({
							ok: true,
							status: 200,
							json: () => Promise.resolve({ deleted: call === 1 ? 498 : 0 })
						});
					})
				);

				expect(await availabilityStore.removeBatch(ids)).toEqual({ kind: 'removed', deleted: 498 });
				expect(availabilityStore.items).toEqual([]);
			});

			it('stops at the first failed chunk and keeps its entries and the unsent ones', async () => {
				const ids = loadEntries(1001);
				const fetchMock = replyingWithCounts(2);
				vi.stubGlobal('fetch', fetchMock);

				const result = await availabilityStore.removeBatch(ids);

				expect(deleteRequests(fetchMock).map((chunk) => chunk.length)).toEqual([500, 500]);
				expect(result).toEqual({ kind: 'partial', deleted: 500, completedIds: ids.slice(0, 500) });
				expect(availabilityStore.items.map((entry) => entry.id)).toEqual(ids.slice(500));
			});

			it.each(['an Organization switch', 'the Organization shell ending'] as const)(
				'sends no later chunk after %s',
				async (departure) => {
					const ids = loadEntries(501);
					let release!: (response: unknown) => void;
					const fetchMock = vi.fn((_url: string, _init?: RequestInit) => new Promise((resolve) => (release = resolve)));
					vi.stubGlobal('fetch', fetchMock);

					const pending = availabilityStore.removeBatch(ids);
					if (departure === 'an Organization switch') availabilityStore.load([], 'org-2');
					else endOrganizationLifetime();
					release({ ok: true, status: 200, json: () => Promise.resolve({ deleted: 500 }) });

					expect(await settles(pending)).toBe(false);
					expect(fetchMock).toHaveBeenCalledTimes(1);
					expect(fetchMock.mock.calls[0][0]).toBe('/org/org-1/api/availability/batch');
				}
			);
		});

		it('treats a server count of zero as a successful removal', async () => {
			vi.stubGlobal('fetch', mockFetch({ deleted: 0 }));

			expect(await availabilityStore.removeBatch(['1'])).toEqual({ kind: 'removed', deleted: 0 });
		});

		it('restores the rows when the server refuses the removal', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: false,
					status: 403,
					json: () => Promise.resolve({ message: 'Not allowed' })
				})
			);

			expect(await availabilityStore.removeBatch(['1', '3'])).toEqual({ kind: 'failed' });
			expect(availabilityStore.items).toEqual(mockEntries);
		});
	});

	describe('removeByStatusTypeLocal', () => {
		it('should remove entries for a status type locally', () => {
			availabilityStore.removeByStatusTypeLocal('st1');
			expect(availabilityStore.items).toHaveLength(1);
		});
	});

	describe('remove', () => {
		it('should return boolean', async () => {
			vi.stubGlobal('fetch', mockFetch({}));
			const result = await availabilityStore.remove('1');
			expect(result).toBe(true);
			expect(typeof result).toBe('boolean');
		});
	});

	describe('update', () => {
		it('keeps one edited entry when a range refresh lands before the reply', async () => {
			const edited = { ...mockEntries[0]!, note: 'Block leave' };
			let reply!: (response: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn(() => new Promise((resolve) => (reply = resolve)))
			);
			const saving = availabilityStore.update('1', { note: 'Block leave' });

			availabilityStore.load([edited, mockEntries[1]!, mockEntries[2]!], 'org-1');
			reply({ ok: true, status: 200, json: () => Promise.resolve(edited) });

			expect(await saving).toBe(true);
			expect(availabilityStore.items.filter((entry) => entry.id === '1')).toEqual([edited]);
		});
	});
});
