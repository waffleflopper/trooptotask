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
		it('should replace all items with server response', async () => {
			const newDays = [{ id: '10', name: 'Reset Day', date: '2026-07-04', type: 'federal_holiday' }];
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(newDays) }));

			const result = await specialDaysStore.resetFederalHolidays();

			expect(result).toBe('saved');
			expect(specialDaysStore.items).toEqual(newDays);
		});

		it('should return false on failure without changing items', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

			const result = await specialDaysStore.resetFederalHolidays();

			expect(result).toBe('failed');
			expect(specialDaysStore.items).toEqual(mockDays);
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
			vi.stubGlobal(
				'fetch',
				vi.fn(() => new Promise((resolve) => (resolveResponse = resolve)))
			);
			const pending = specialDaysStore.resetFederalHolidays();
			specialDaysStore.load([], 'org-2');
			const retainedClosures = [
				{ id: 'fresh-a', name: 'Later saved closure', date: '2026-09-29', type: 'org-closure' as const },
				{ id: 'future-a', name: 'Future closure', date: '2032-09-29', type: 'org-closure' as const }
			];
			specialDaysStore.load([...mockDays, ...retainedClosures], 'org-1');
			const resetHoliday = {
				id: 'reset-holiday',
				name: 'Reset holiday',
				date: '2026-01-01',
				type: 'federal-holiday' as const
			};
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
			expect(specialDaysStore.items).toEqual(latest);
		});

		it('does not let another Organization supersede a pending reset after returning', async () => {
			let resolveA!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			let resolveB!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockImplementationOnce(() => new Promise((resolve) => (resolveA = resolve)))
					.mockImplementationOnce(() => new Promise((resolve) => (resolveB = resolve)))
			);
			const pendingA = specialDaysStore.resetFederalHolidays();
			specialDaysStore.load([], 'org-2');
			const pendingB = specialDaysStore.resetFederalHolidays();
			specialDaysStore.load(mockDays, 'org-1');
			const resetHoliday = { id: 'reset-a', name: 'Reset A', date: '2026-01-01', type: 'federal-holiday' as const };
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
