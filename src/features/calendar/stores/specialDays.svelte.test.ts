import { describe, it, expect, vi, beforeEach } from 'vitest';
import { specialDaysStore } from './specialDays.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';
import { settles } from '$lib/test-support/settles';

const mockDays = [
	{ id: '1', name: 'New Year', date: '2026-01-01', type: 'federal-holiday' as const },
	{ id: '2', name: 'Training Day', date: '2026-03-15', type: 'org-closure' as const },
	{ id: '3', name: 'Christmas', date: '2026-12-25', type: 'federal-holiday' as const }
];

function reply(status: number, body: unknown) {
	return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

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
			resolveReset({ ok: true, json: () => Promise.resolve([resetHoliday]) });

			expect(await pending).toBe('saved');
			expect(specialDaysStore.items).toEqual([mockDays[1], savedClosure, resetHoliday]);
		});

		describe('with a holiday add still pending when the reset response arrives', () => {
			const resetHoliday = {
				id: 'reset-holiday',
				name: 'Reset holiday',
				date: '2026-01-01',
				type: 'federal-holiday' as const
			};
			const replacedHoliday = {
				id: 'replaced-holiday',
				name: 'Replaced holiday',
				date: '2026-09-30',
				type: 'federal-holiday' as const
			};

			function stubPendingAddThenReset(readBody: () => Promise<unknown>) {
				let respondAdd!: (value: unknown) => void;
				let respondReset!: (value: unknown) => void;
				const requests: string[] = [];
				vi.stubGlobal(
					'fetch',
					vi.fn((_url, options?: RequestInit) => {
						if (!options) {
							requests.push('read');
							return Promise.resolve({ ok: true, status: 200, json: readBody });
						}
						const { action } = JSON.parse(options.body as string);
						requests.push(action === 'resetFederalHolidays' ? 'reset' : 'add');
						return new Promise((resolve) =>
							action === 'resetFederalHolidays' ? (respondReset = resolve) : (respondAdd = resolve)
						);
					})
				);
				return {
					requests,
					respondAdd: (value: unknown) => respondAdd(value),
					respondReset: (value: unknown) => respondReset(value)
				};
			}

			it('reads the saved days instead of showing a holiday the reset deleted', async () => {
				const server = stubPendingAddThenReset(() => Promise.resolve([mockDays[1], resetHoliday]));
				const add = specialDaysStore.add({
					name: replacedHoliday.name,
					date: replacedHoliday.date,
					type: replacedHoliday.type
				});
				const reset = specialDaysStore.resetFederalHolidays();
				server.respondReset(reply(200, [resetHoliday]));

				const settledBeforeAdd = await settles(reset);
				const requestsBeforeAdd = [...server.requests];
				server.respondAdd(reply(201, replacedHoliday));
				await add;

				expect(await reset).toBe('saved');
				expect(settledBeforeAdd).toBe(false);
				expect(requestsBeforeAdd).toEqual(['add', 'reset']);
				expect(server.requests).toEqual(['add', 'reset', 'read']);
				expect(specialDaysStore.items).toEqual([mockDays[1], resetHoliday]);
			});

			it('still applies the reset response when the pending add is refused', async () => {
				const server = stubPendingAddThenReset(() => Promise.resolve([mockDays[1], resetHoliday]));
				const add = specialDaysStore.add({
					name: replacedHoliday.name,
					date: replacedHoliday.date,
					type: replacedHoliday.type
				});
				const refused = expect(add).rejects.toThrow();
				const reset = specialDaysStore.resetFederalHolidays();
				server.respondReset(reply(200, [resetHoliday]));
				server.respondAdd(reply(409, { message: 'Not saved' }));
				await refused;

				expect(await reset).toBe('saved');
				expect(specialDaysStore.items).toEqual([mockDays[1], resetHoliday]);
			});

			it('keeps the shown days and says so when the saved days cannot be read', async () => {
				const server = stubPendingAddThenReset(() => Promise.reject(new TypeError('Failed to fetch')));
				const add = specialDaysStore.add({
					name: replacedHoliday.name,
					date: replacedHoliday.date,
					type: replacedHoliday.type
				});
				const reset = specialDaysStore.resetFederalHolidays();
				server.respondReset(reply(200, [resetHoliday]));
				server.respondAdd(reply(201, replacedHoliday));
				await add;

				expect(await reset).toBe('saved-unrefreshed');
			});
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
			resolveReset({ ok: true, json: () => Promise.resolve([resetHoliday]) });

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
			resolveReset({ ok: true, json: () => Promise.resolve([resetHoliday]) });
			await firstReadStarted;
			specialDaysStore.load([mockDays[1], resetHoliday, added, newerClosure], 'org-1');
			resolveFirstRead({ ok: true, json: () => Promise.resolve([mockDays[1], resetHoliday, added]) });

			expect(await pending).toBe('saved');
			expect(readCount).toBe(2);
			expect(specialDaysStore.items).toEqual([mockDays[1], resetHoliday, added, newerClosure]);
		});

		it.each([400, 401, 403, 404, 409])('reports a %i as not saved without a readback', async (status) => {
			const fetchMock = vi.fn().mockResolvedValue(reply(status, { message: 'Not saved' }));
			vi.stubGlobal('fetch', fetchMock);

			expect(await specialDaysStore.resetFederalHolidays()).toBe('not-saved');
			expect(fetchMock).toHaveBeenCalledOnce();
			expect(specialDaysStore.items).toEqual(mockDays);
		});

		it.each([
			['a 408', () => Promise.resolve(reply(408, {}))],
			['a 429', () => Promise.resolve(reply(429, {}))],
			['a 500', () => Promise.resolve(reply(500, {}))],
			['the unconfirmed 503', () => Promise.resolve(reply(503, { message: 'unconfirmed' }))],
			['a rejected request', () => Promise.reject(new TypeError('Failed to fetch'))],
			['a 200 without saved rows', () => Promise.resolve(reply(200, { saved: true }))],
			[
				'a 200 with an unreadable body',
				() => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('bad')) })
			]
		])('reports %s as unconfirmed and shows the saved days from one readback', async (_label, answer) => {
			const savedDays = [
				mockDays[1],
				{ id: 'stored', name: 'Stored holiday', date: '2026-07-03', type: 'federal-holiday' as const }
			];
			const fetchMock = vi.fn((_url, options?: RequestInit) =>
				options ? answer() : Promise.resolve(reply(200, savedDays))
			);
			vi.stubGlobal('fetch', fetchMock);

			expect(await specialDaysStore.resetFederalHolidays()).toBe('unconfirmed');
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(specialDaysStore.items).toEqual(savedDays);
		});

		it('keeps the shown days and says so when the readback after an unconfirmed reset fails', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) =>
					options ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(reply(500, {}))
				)
			);

			expect(await specialDaysStore.resetFederalHolidays()).toBe('unconfirmed-unrefreshed');
			expect(specialDaysStore.items).toEqual(mockDays);
		});

		it.each([
			['an object', { saved: true }],
			['a malformed day', [mockDays[1], { id: 'stored', date: '2026-07-03' }]]
		])('keeps the shown days when the readback after an unconfirmed reset returns %s', async (_label, body) => {
			const fetchMock = vi.fn((_url, options?: RequestInit) =>
				Promise.resolve(options ? reply(503, {}) : reply(200, body))
			);
			vi.stubGlobal('fetch', fetchMock);

			expect(await specialDaysStore.resetFederalHolidays()).toBe('unconfirmed-unrefreshed');
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(specialDaysStore.items).toEqual(mockDays);
		});

		it('reports a saved reset whose overlap refresh failed', async () => {
			let resolveReset!: (value: unknown) => void;
			const added = { id: 'added', name: 'Added', date: '2026-09-30', type: 'org-closure' as const };
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) => {
					if (!options) return Promise.resolve(reply(500, {}));
					if (JSON.parse(options.body as string).action === 'resetFederalHolidays')
						return new Promise((resolve) => (resolveReset = resolve));
					return Promise.resolve(reply(201, added));
				})
			);
			const pending = specialDaysStore.resetFederalHolidays();
			await specialDaysStore.add({ name: added.name, date: added.date, type: added.type });
			resolveReset(reply(200, [{ id: 'reset', name: 'Reset', date: '2026-01-01', type: 'federal-holiday' }]));

			expect(await pending).toBe('saved-unrefreshed');
			expect(specialDaysStore.items).toEqual([...mockDays, added]);
		});

		it('never settles an unconfirmed reset whose readback outlives the Organization shell', async () => {
			let respondRead!: (value: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn((_url, options?: RequestInit) =>
					options ? Promise.resolve(reply(503, {})) : new Promise((resolve) => (respondRead = resolve))
				)
			);
			const pending = specialDaysStore.resetFederalHolidays();
			await vi.waitFor(() => expect(respondRead).toBeDefined());
			endOrganizationLifetime();
			specialDaysStore.load(structuredClone(mockDays), 'org-1');
			respondRead(reply(200, []));

			expect(await settles(pending)).toBe(false);
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
			resolveReset({ ok: true, json: () => Promise.resolve([resetHoliday]) });

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
			resolveResponse({ ok: true, json: () => Promise.resolve([resetHoliday]) });

			expect(await pending).toBe('saved');
			expect(specialDaysStore.items).toEqual([mockDays[1], ...retainedClosures, resetHoliday]);
		});

		it.each(['an Organization switch', 'the Organization shell ending'] as const)(
			'does not wait on a closure save abandoned by %s',
			async (departure) => {
				let resolveReset!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
				let resolveAbandoned!: (value: unknown) => void;
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
						if (input.action === 'resetFederalHolidays') return new Promise((resolve) => (resolveReset = resolve));
						if (input.name === 'Abandoned closure') return new Promise((resolve) => (resolveAbandoned = resolve));
						return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(savedClosure) });
					})
				);

				void specialDaysStore.add({ name: 'Abandoned closure', date: '2026-09-27', type: 'org-closure' });
				if (departure === 'an Organization switch') {
					specialDaysStore.load([], 'org-2');
					specialDaysStore.load(structuredClone(mockDays), 'org-1');
				} else {
					endOrganizationLifetime();
					specialDaysStore.load(structuredClone(mockDays), 'org-1');
				}
				resolveAbandoned({ ok: true, status: 201, json: () => Promise.resolve({ id: 'abandoned' }) });
				const pending = specialDaysStore.resetFederalHolidays();
				await specialDaysStore.add({ name: savedClosure.name, date: savedClosure.date, type: savedClosure.type });
				resolveReset({ ok: true, json: () => Promise.resolve([resetHoliday]) });

				expect(await pending).toBe('saved');
				expect(specialDaysStore.items).toEqual([mockDays[1], savedClosure, resetHoliday]);
			}
		);

		it.each(['success', 'failure'] as const)(
			'drops a reset %s that arrives after the Organization shell ends',
			async (outcome) => {
				let respond!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
				vi.stubGlobal(
					'fetch',
					vi.fn(() => new Promise((resolve) => (respond = resolve)))
				);
				const pending = specialDaysStore.resetFederalHolidays();
				endOrganizationLifetime();
				specialDaysStore.load(structuredClone(mockDays), 'org-1');
				respond({
					ok: outcome === 'success',
					json: () => Promise.resolve([{ id: 'late', name: 'Late', date: '2026-07-04', type: 'federal-holiday' }])
				});

				expect(await settles(pending)).toBe(false);
				expect(specialDaysStore.items).toEqual(mockDays);
			}
		);

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
			resolveA({ ok: true, json: () => Promise.resolve([resetHoliday]) });

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
