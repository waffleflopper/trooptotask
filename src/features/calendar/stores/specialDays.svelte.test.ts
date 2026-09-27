import { describe, it, expect, vi, beforeEach } from 'vitest';
import { specialDaysStore } from './specialDays.svelte';

const mockDays = [
	{ id: '1', name: 'New Year', date: '2026-01-01', type: 'federal-holiday' as const },
	{ id: '2', name: 'Training Day', date: '2026-03-15', type: 'org-closure' as const },
	{ id: '3', name: 'Christmas', date: '2026-12-25', type: 'federal-holiday' as const }
];

function stubFetch(response: unknown, status = 200) {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(response) })
	);
}

describe('specialDaysStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		specialDaysStore.load(structuredClone(mockDays), 'org-1');
	});

	describe('items', () => {
		it('returns loaded items', () => {
			expect(specialDaysStore.items).toHaveLength(3);
			expect(specialDaysStore.items[0].name).toBe('New Year');
		});

		it('returns empty array when no items loaded', () => {
			specialDaysStore.load([], 'org-2');
			expect(specialDaysStore.items).toEqual([]);
		});
	});

	describe('load', () => {
		it('replaces existing items with new data', () => {
			specialDaysStore.load([mockDays[0]], 'org-2');
			expect(specialDaysStore.items).toHaveLength(1);
		});
	});

	describe('add', () => {
		it('adds item and returns the server-created record', async () => {
			const created = { id: 'new-1', name: 'July 4th', date: '2026-07-04', type: 'federal-holiday' };
			stubFetch(created);

			const result = await specialDaysStore.add({ name: 'July 4th', date: '2026-07-04', type: 'federal-holiday' });

			expect(result).not.toBeNull();
			expect(result!.id).toBe('new-1');
		});
	});

	describe('getById', () => {
		it('finds a special day by ID', () => {
			expect(specialDaysStore.getById('1')?.name).toBe('New Year');
		});

		it('returns undefined for non-existent ID', () => {
			expect(specialDaysStore.getById('nonexistent')).toBeUndefined();
		});
	});

	describe('getByDate', () => {
		it('should find a special day by date', () => {
			const result = specialDaysStore.getByDate(new Date(2026, 0, 1));
			expect(result).toEqual(mockDays[0]);
		});

		it('should return undefined for non-special date', () => {
			const result = specialDaysStore.getByDate(new Date(2026, 5, 15));
			expect(result).toBeUndefined();
		});
	});

	describe('isSpecialDay', () => {
		it('should return true for a special day', () => {
			expect(specialDaysStore.isSpecialDay(new Date(2026, 0, 1))).toBe(true);
		});

		it('should return false for a regular day', () => {
			expect(specialDaysStore.isSpecialDay(new Date(2026, 5, 15))).toBe(false);
		});
	});

	describe('getByYear', () => {
		it('should return all special days for a given year', () => {
			const result = specialDaysStore.getByYear(2026);
			expect(result).toHaveLength(3);
		});

		it('should return empty for year with no special days', () => {
			const result = specialDaysStore.getByYear(2025);
			expect(result).toHaveLength(0);
		});
	});

	describe('resetFederalHolidays', () => {
		it('replaces federal holidays while preserving saved closures', async () => {
			const newDays = [{ id: '10', name: 'Reset Day', date: '2026-07-04', type: 'federal-holiday' as const }];
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(newDays) }));

			const result = await specialDaysStore.resetFederalHolidays();

			expect(result).toBe('saved');
			expect(specialDaysStore.items).toEqual([mockDays[1], ...newDays]);
		});

		it('keeps a closure saved while the reset response is pending', async () => {
			let resolveReset!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			const resetHoliday = {
				id: 'reset-holiday',
				name: 'Reset holiday',
				date: '2026-01-01',
				type: 'federal-holiday' as const
			};
			const savedClosure = {
				id: 'saved-closure',
				name: 'Saved during reset',
				date: '2026-09-28',
				type: 'org-closure' as const
			};
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) => {
					if (!options) {
						return Promise.resolve({
							ok: true,
							json: () => Promise.resolve([mockDays[1], savedClosure, resetHoliday])
						});
					}
					const input = JSON.parse(options.body as string);
					if (input.action === 'resetFederalHolidays') {
						return new Promise((resolve) => (resolveReset = resolve));
					}
					return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(savedClosure) });
				})
			);
			const pending = specialDaysStore.resetFederalHolidays();
			await specialDaysStore.add({ name: savedClosure.name, date: savedClosure.date, type: savedClosure.type });
			resolveReset({ ok: true, json: () => Promise.resolve([mockDays[1], resetHoliday]) });

			expect(await pending).toBe('saved');
			expect(specialDaysStore.items).toEqual([mockDays[1], savedClosure, resetHoliday]);
		});

		it('refreshes federal rows after saved edits overlap the reset response', async () => {
			let resolveReset!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			const added = {
				id: 'later-federal',
				name: 'Later federal day',
				date: '2026-09-30',
				type: 'federal-holiday' as const
			};
			const resetHoliday = {
				id: 'reset-federal',
				name: 'Reset federal day',
				date: '2026-01-01',
				type: 'federal-holiday' as const
			};
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) => {
					if (!options) {
						return Promise.resolve({ ok: true, json: () => Promise.resolve([mockDays[1], resetHoliday, added]) });
					}
					if (options.method === 'DELETE') return Promise.resolve({ ok: true, status: 200 });
					const input = JSON.parse(options.body as string);
					if (input.action === 'resetFederalHolidays') {
						return new Promise((resolve) => (resolveReset = resolve));
					}
					return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(added) });
				})
			);
			const pending = specialDaysStore.resetFederalHolidays();
			await specialDaysStore.add({ name: added.name, date: added.date, type: added.type });
			await specialDaysStore.remove(mockDays[0].id);
			resolveReset({ ok: true, json: () => Promise.resolve([mockDays[0], mockDays[1], resetHoliday]) });

			expect(await pending).toBe('saved');
			expect(specialDaysStore.items).toEqual([mockDays[1], resetHoliday, added]);
		});

		it('retries a recovery read when newer Calendar data loads during that read', async () => {
			let resolveReset!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			let resolveFirstRead!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			let signalFirstRead!: () => void;
			const firstReadStarted = new Promise<void>((resolve) => (signalFirstRead = resolve));
			const resetHoliday = {
				id: 'reset-federal',
				name: 'Reset day',
				date: '2026-01-01',
				type: 'federal-holiday' as const
			};
			const added = { id: 'later-federal', name: 'Later day', date: '2026-09-30', type: 'federal-holiday' as const };
			const newerClosure = {
				id: 'newer-closure',
				name: 'Newer closure',
				date: '2026-10-01',
				type: 'org-closure' as const
			};
			let readCount = 0;
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) => {
					if (!options) {
						readCount++;
						if (readCount === 1) {
							signalFirstRead();
							return new Promise((resolve) => (resolveFirstRead = resolve));
						}
						return Promise.resolve({
							ok: true,
							json: () => Promise.resolve([mockDays[1], resetHoliday, added, newerClosure])
						});
					}
					const input = JSON.parse(options.body as string);
					if (input.action === 'resetFederalHolidays') return new Promise((resolve) => (resolveReset = resolve));
					return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(added) });
				})
			);
			const pending = specialDaysStore.resetFederalHolidays();
			await specialDaysStore.add({ name: added.name, date: added.date, type: added.type });
			resolveReset({ ok: true, json: () => Promise.resolve([mockDays[1], resetHoliday]) });
			await firstReadStarted;
			specialDaysStore.load([mockDays[1], resetHoliday, added, newerClosure], 'org-1');
			resolveFirstRead({ ok: true, json: () => Promise.resolve([mockDays[1], resetHoliday, added]) });

			expect(await pending).toBe('saved');
			expect(readCount).toBe(2);
			expect(specialDaysStore.items).toEqual([mockDays[1], resetHoliday, added, newerClosure]);
		});

		it('returns failure without changing items', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

			const result = await specialDaysStore.resetFederalHolidays();

			expect(result).toBe('failed');
			expect(specialDaysStore.items).toEqual(mockDays);
		});

		it('refreshes saved days when Calendar loads newer data during a pending reset', async () => {
			let resolveReset!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			const resetHoliday = {
				id: 'reset-holiday',
				name: 'Reset holiday',
				date: '2026-01-01',
				type: 'federal-holiday' as const
			};
			const laterHoliday = {
				id: 'later-holiday',
				name: 'Later holiday',
				date: '2026-09-30',
				type: 'federal-holiday' as const
			};
			const fetchMock = vi.fn((_url, options?: RequestInit) => {
				if (options) return new Promise((resolve) => (resolveReset = resolve));
				return Promise.resolve({ ok: true, json: () => Promise.resolve([mockDays[1], resetHoliday, laterHoliday]) });
			});
			vi.stubGlobal('fetch', fetchMock);
			const pending = specialDaysStore.resetFederalHolidays();
			specialDaysStore.load([mockDays[1], laterHoliday], 'org-1');
			resolveReset({ ok: true, json: () => Promise.resolve([mockDays[1], resetHoliday]) });

			expect(await pending).toBe('saved');
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(specialDaysStore.items).toEqual([mockDays[1], resetHoliday, laterHoliday]);
		});

		it('does not apply an earlier Organization reset after switching Organizations', async () => {
			let resolveResponse!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn(() => new Promise((resolve) => (resolveResponse = resolve)))
			);
			const pending = specialDaysStore.resetFederalHolidays();
			const newOrgDays = [
				{ id: 'org-2-day', name: 'New unit closure', date: '2026-09-28', type: 'org-closure' as const }
			];
			specialDaysStore.load(newOrgDays, 'org-2');
			resolveResponse({ ok: true, json: () => Promise.resolve(mockDays) });

			expect(await pending).toBe('stale');
			expect(specialDaysStore.items).toEqual(newOrgDays);
		});

		it('reconciles reset federal days after switching away and back while retaining unrelated closures', async () => {
			let resolveResponse!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			const retainedClosures = [
				{ id: 'fresh-a', name: 'Later saved closure', date: '2026-09-29', type: 'org-closure' as const },
				{ id: 'future-a', name: 'Future closure', date: '2032-09-29', type: 'org-closure' as const }
			];
			const resetHoliday = {
				id: 'reset-holiday',
				name: 'Reset holiday',
				date: '2026-01-01',
				type: 'federal-holiday' as const
			};
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) => {
					if (options) return new Promise((resolve) => (resolveResponse = resolve));
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve([mockDays[1], ...retainedClosures, resetHoliday])
					});
				})
			);
			const pending = specialDaysStore.resetFederalHolidays();
			specialDaysStore.load([], 'org-2');
			specialDaysStore.load([...mockDays, ...retainedClosures], 'org-1');
			resolveResponse({ ok: true, json: () => Promise.resolve([resetHoliday, mockDays[1]]) });

			expect(await pending).toBe('saved');
			expect(specialDaysStore.items).toEqual([mockDays[1], ...retainedClosures, resetHoliday]);
		});

		it('does not let an earlier reset response undo a newer reset', async () => {
			let resolveFirst!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			let resolveSecond!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
					.mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)))
			);
			const first = specialDaysStore.resetFederalHolidays();
			const second = specialDaysStore.resetFederalHolidays();
			const latest = [{ id: 'latest', name: 'Latest holiday', date: '2026-07-04', type: 'federal-holiday' as const }];
			resolveSecond({ ok: true, json: () => Promise.resolve(latest) });
			expect(await second).toBe('saved');
			resolveFirst({ ok: true, json: () => Promise.resolve(mockDays) });

			expect(await first).toBe('stale');
			expect(specialDaysStore.items).toEqual([mockDays[1], ...latest]);
		});

		it('does not let another Organization supersede a pending reset after returning', async () => {
			let resolveA!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			let resolveB!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			const resetHoliday = { id: 'reset-a', name: 'Reset A', date: '2026-01-01', type: 'federal-holiday' as const };
			let postCount = 0;
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) => {
					if (!options) return Promise.resolve({ ok: true, json: () => Promise.resolve([mockDays[1], resetHoliday]) });
					postCount++;
					return new Promise((resolve) => (postCount === 1 ? (resolveA = resolve) : (resolveB = resolve)));
				})
			);
			const pendingA = specialDaysStore.resetFederalHolidays();
			specialDaysStore.load([], 'org-2');
			const pendingB = specialDaysStore.resetFederalHolidays();
			specialDaysStore.load(mockDays, 'org-1');
			resolveA({ ok: true, json: () => Promise.resolve([resetHoliday, mockDays[1]]) });

			expect(await pendingA).toBe('saved');
			expect(specialDaysStore.items).toEqual([mockDays[1], resetHoliday]);

			resolveB({ ok: true, json: () => Promise.resolve([]) });
			expect(await pendingB).toBe('stale');
			expect(specialDaysStore.items).toEqual([mockDays[1], resetHoliday]);
		});
	});

	describe('remove', () => {
		it('should return boolean true on success', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) }));

			const result = await specialDaysStore.remove('1');

			expect(result).toBe(true);
			expect(typeof result).toBe('boolean');
		});
	});
});
