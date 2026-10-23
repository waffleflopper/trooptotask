import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reconcileAvailability, saveAvailabilityChange } from './availabilitySave';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { loadCalendarRange } from '$features/calendar/utils/calendarRangeLoader';
import type { AvailabilityChange } from '$features/calendar/utils/availabilityMutation';
import { buildRequestError, endOrganizationLifetime } from '$lib/stores/core';
import { settles } from '$lib/test-support/settles';
import { toastStore } from '$lib/stores/toast.svelte';

vi.mock('$features/calendar/utils/calendarRangeLoader', () => ({
	loadCalendarRange: vi.fn()
}));
vi.mock('$features/calendar/stores/availability.svelte', () => ({
	availabilityStore: {
		items: [],
		orgId: '',
		loading: false,
		load: vi.fn(),
		add: vi.fn(),
		updateOrThrow: vi.fn(),
		removeBool: vi.fn(),
		beginRead: () => ({ reconcile: (snapshot: unknown[]) => snapshot, close: () => {} })
	}
}));
vi.mock('$features/calendar/stores/statusTypes.svelte', () => ({
	statusTypesStore: { items: [], loading: false, load: vi.fn() }
}));

let current = true;
const scope = { orgId: 'org1', isCurrent: () => current };
const save = (change: AvailabilityChange) => saveAvailabilityChange(change, scope);

beforeEach(() => {
	current = true;
	vi.mocked(loadCalendarRange).mockReset();
	vi.mocked(availabilityStore.load).mockReset();
	vi.mocked(availabilityStore.add).mockReset();
	vi.mocked(availabilityStore.updateOrThrow).mockReset();
	vi.mocked(availabilityStore.removeBool).mockReset();
	vi.restoreAllMocks();
});

describe('saveAvailabilityChange', () => {
	const record = {
		personnelId: 'p1',
		statusTypeId: 'leave',
		startDate: '2026-04-07',
		endDate: '2026-04-08',
		note: null as string | null
	};
	const range = (availabilityEntries: (typeof record & { id: string })[]) => ({
		rangeStart: '2026-04-01',
		rangeEnd: '2026-04-30',
		availabilityEntries,
		specialDays: [],
		dailyAssignments: []
	});

	it('reports a create as saved when its reply is lost but the re-read holds the new row', async () => {
		vi.mocked(availabilityStore.add).mockRejectedValueOnce(new Error('POST availability failed'));
		vi.mocked(loadCalendarRange).mockResolvedValueOnce(range([{ id: 'saved-1', ...record }]));

		expect(await save({ kind: 'create', record })).toBe('saved');
		expect(loadCalendarRange).toHaveBeenCalledExactlyOnceWith('org1', {
			rangeStart: '2026-04-07',
			rangeEnd: '2026-04-07',
			collections: ['availability']
		});
	});

	it('reports a refused create as not saved when the re-read lacks it', async () => {
		vi.mocked(availabilityStore.add).mockRejectedValueOnce(new Error('POST availability failed'));
		vi.mocked(loadCalendarRange).mockResolvedValueOnce(range([]));

		expect(await save({ kind: 'create', record })).toBe('not-saved');
	});

	it('reports the write as unconfirmed when the re-read fails too', async () => {
		vi.mocked(availabilityStore.removeBool).mockResolvedValueOnce(false);
		vi.mocked(loadCalendarRange).mockRejectedValueOnce(new Error('Range unavailable'));

		expect(await save({ kind: 'remove', entry: { id: 'e1', ...record } })).toBe('unconfirmed');
	});

	const edit = {
		kind: 'update',
		entry: { id: 'entry-1', ...record },
		changes: { statusTypeId: 'leave', startDate: '2026-04-07', endDate: '2026-04-10', note: 'Block leave' }
	} as const;
	const edited = { id: 'entry-1', ...record, endDate: '2026-04-10', note: 'Block leave' };

	function held<T>() {
		let resolve!: (value: T) => void;
		const promise = new Promise<T>((settle) => (resolve = settle));
		return { promise, resolve };
	}
	const readOfApril7 = [
		'org1',
		{ rangeStart: '2026-04-07', rangeEnd: '2026-04-07', collections: ['availability'] }
	] as const;

	it('saves an edit as one update of the same entry and announces it only once the update lands', async () => {
		const success = vi.spyOn(toastStore, 'success');
		const update = held<boolean>();
		vi.mocked(availabilityStore.updateOrThrow).mockReturnValueOnce(update.promise);
		const pending = save(edit);

		expect(await settles(pending)).toBe(false);
		expect(success).not.toHaveBeenCalled();

		update.resolve(true);

		expect(await pending).toBe('saved');
		expect(success).toHaveBeenCalledTimes(1);
		expect(vi.mocked(availabilityStore.updateOrThrow).mock.calls).toEqual([['entry-1', edit.changes]]);
		expect(availabilityStore.add).not.toHaveBeenCalled();
		expect(availabilityStore.removeBool).not.toHaveBeenCalled();
	});

	it("recognizes a lost edit reply by the entry's own ID, not a look-alike, without writing again", async () => {
		const success = vi.spyOn(toastStore, 'success');
		const error = vi.spyOn(toastStore, 'error');
		const lookAlike = { ...edited, id: 'other-entry' };
		vi.mocked(availabilityStore.updateOrThrow).mockRejectedValue(new Error('PUT availability failed'));
		const unchanged = held<ReturnType<typeof range>>();
		vi.mocked(loadCalendarRange).mockReturnValueOnce(unchanged.promise);
		const refused = save(edit);

		await vi.waitFor(() => expect(loadCalendarRange).toHaveBeenCalledExactlyOnceWith(...readOfApril7));
		expect(await settles(refused)).toBe(false);
		expect(error).not.toHaveBeenCalled();

		unchanged.resolve(range([{ id: 'entry-1', ...record }, lookAlike]));

		expect(await refused).toBe('not-saved');
		expect(error).toHaveBeenCalledTimes(1);
		expect(success).not.toHaveBeenCalled();
		expect(availabilityStore.updateOrThrow).toHaveBeenCalledTimes(1);

		vi.mocked(loadCalendarRange).mockResolvedValueOnce(range([edited, lookAlike]));
		expect(await save(edit)).toBe('saved');
		expect(success).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledTimes(1);
		expect(vi.mocked(availabilityStore.updateOrThrow).mock.calls).toEqual([
			['entry-1', edit.changes],
			['entry-1', edit.changes]
		]);
		expect(availabilityStore.add).not.toHaveBeenCalled();
		expect(availabilityStore.removeBool).not.toHaveBeenCalled();
	});

	it.each([
		['edit', edit],
		['removal', { kind: 'remove', entry: { id: 'entry-1', ...record } }]
	] as const)('restores the saved row and reports a refused %s once the re-read lands', async (_, change) => {
		const success = vi.spyOn(toastStore, 'success');
		const error = vi.spyOn(toastStore, 'error');
		vi.mocked(availabilityStore.updateOrThrow).mockResolvedValueOnce(false);
		vi.mocked(availabilityStore.removeBool).mockResolvedValueOnce(false);
		const reread = held<ReturnType<typeof range>>();
		vi.mocked(loadCalendarRange).mockReturnValueOnce(reread.promise);
		const pending = save(change);

		await vi.waitFor(() => expect(loadCalendarRange).toHaveBeenCalledExactlyOnceWith(...readOfApril7));
		expect(await settles(pending)).toBe(false);
		expect(error).not.toHaveBeenCalled();
		expect(availabilityStore.load).not.toHaveBeenCalled();

		reread.resolve(range([{ id: 'entry-1', ...record }]));

		expect(await pending).toBe('not-saved');
		expect(availabilityStore.load).toHaveBeenCalledWith([{ id: 'entry-1', ...record }], 'org1');
		expect(error).toHaveBeenCalledTimes(1);
		expect(success).not.toHaveBeenCalled();
		expect(
			vi.mocked(availabilityStore.updateOrThrow).mock.calls.length +
				vi.mocked(availabilityStore.removeBool).mock.calls.length
		).toBe(1);
		expect(availabilityStore.add).not.toHaveBeenCalled();
	});

	it('reports a refused edit with the server reason at once, without a re-read, and keeps it retryable', async () => {
		const success = vi.spyOn(toastStore, 'success');
		const error = vi.spyOn(toastStore, 'error');
		vi.mocked(availabilityStore.updateOrThrow).mockRejectedValueOnce(
			await buildRequestError(
				Response.json({ message: 'This status type was deleted.' }, { status: 404 }),
				'PUT',
				'availability'
			)
		);

		expect(await save(edit)).toBe('not-saved');
		expect(error.mock.calls).toEqual([['This status type was deleted.']]);
		expect(loadCalendarRange).not.toHaveBeenCalled();
		expect(success).not.toHaveBeenCalled();

		vi.mocked(availabilityStore.updateOrThrow).mockResolvedValueOnce(true);
		expect(await save(edit)).toBe('saved');
	});

	it('re-reads after a server failure on an edit and keeps the generic message', async () => {
		const error = vi.spyOn(toastStore, 'error');
		vi.mocked(availabilityStore.updateOrThrow).mockRejectedValueOnce(
			await buildRequestError(Response.json({ message: 'relation missing' }, { status: 500 }), 'PUT', 'availability')
		);
		vi.mocked(loadCalendarRange).mockResolvedValueOnce(range([{ id: 'entry-1', ...record }]));

		expect(await save(edit)).toBe('not-saved');
		expect(loadCalendarRange).toHaveBeenCalledExactlyOnceWith(...readOfApril7);
		expect(error.mock.calls).toEqual([['Could not save status. Try again.']]);
	});

	it('stays silent when the Organization changes while a lost reply is being checked', async () => {
		const success = vi.spyOn(toastStore, 'success');
		const error = vi.spyOn(toastStore, 'error');
		let resolveRead!: (value: ReturnType<typeof range>) => void;
		vi.mocked(availabilityStore.add).mockRejectedValueOnce(new Error('POST availability failed'));
		vi.mocked(loadCalendarRange).mockImplementationOnce(() => new Promise((resolve) => (resolveRead = resolve)));
		const pending = save({ kind: 'create', record });
		await vi.waitFor(() => expect(loadCalendarRange).toHaveBeenCalled());

		current = false;
		resolveRead(range([{ id: 'saved-1', ...record }]));

		expect(await pending).toBe('stale');
		expect(success).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
		expect(availabilityStore.load).not.toHaveBeenCalled();
	});

	it('does not report an old Organization edit as saved after navigation', async () => {
		const success = vi.spyOn(toastStore, 'success');
		let resolveUpdate!: (saved: boolean) => void;
		vi.mocked(availabilityStore.updateOrThrow).mockImplementation(
			() => new Promise((resolve) => (resolveUpdate = resolve))
		);
		const pending = save({
			kind: 'update',
			entry: { id: 'entry-1', ...record },
			changes: { statusTypeId: 'leave', startDate: '2026-04-07', endDate: '2026-04-07', note: null }
		});
		current = false;
		resolveUpdate(true);

		expect(await pending).toBe('stale');
		expect(success).not.toHaveBeenCalled();
	});
});

describe('reconcileAvailability', () => {
	it('reads both the clicked date and replacement date after an uncertain edit', async () => {
		const savedEntry = {
			id: 'saved-2',
			personnelId: 'p1',
			statusTypeId: 'leave',
			startDate: '2026-04-09',
			endDate: '2026-04-09',
			note: null
		};
		vi.mocked(loadCalendarRange)
			.mockResolvedValueOnce({
				rangeStart: '2026-04-07',
				rangeEnd: '2026-04-07',
				availabilityEntries: [],
				specialDays: [],
				dailyAssignments: []
			})
			.mockResolvedValueOnce({
				rangeStart: '2026-04-09',
				rangeEnd: '2026-04-09',
				availabilityEntries: [savedEntry],
				specialDays: [],
				dailyAssignments: []
			});

		const saved = await reconcileAvailability(['2026-04-07', '2026-04-09'], scope);

		expect(loadCalendarRange).toHaveBeenCalledWith('org1', {
			rangeStart: '2026-04-07',
			rangeEnd: '2026-04-07',
			collections: ['availability']
		});
		expect(loadCalendarRange).toHaveBeenCalledWith('org1', {
			rangeStart: '2026-04-09',
			rangeEnd: '2026-04-09',
			collections: ['availability']
		});
		expect(saved).toEqual([savedEntry]);
	});

	it('does not reload availability for an old Organization after navigation', async () => {
		current = false;
		const result = await reconcileAvailability(['2026-04-07'], scope);

		expect(result).toBeNull();
		expect(loadCalendarRange).not.toHaveBeenCalled();
		expect(availabilityStore.load).not.toHaveBeenCalled();
	});

	it('does not apply a late response after switching Organizations', async () => {
		let resolveRange!: (value: Awaited<ReturnType<typeof loadCalendarRange>>) => void;
		vi.mocked(loadCalendarRange).mockImplementation(() => new Promise((resolve) => (resolveRange = resolve)));
		const pending = reconcileAvailability(['2026-04-07'], scope);
		current = false;
		resolveRange({
			rangeStart: '2026-04-07',
			rangeEnd: '2026-04-07',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: []
		});

		expect(await pending).toBeNull();
		expect(availabilityStore.load).not.toHaveBeenCalled();
	});

	it('treats a failed late range read as abandoned after an Organization switch', async () => {
		let rejectRange!: (error: Error) => void;
		vi.mocked(loadCalendarRange).mockImplementation(() => new Promise((_, reject) => (rejectRange = reject)));
		const pending = reconcileAvailability(['2026-04-07'], scope);
		current = false;
		rejectRange(new Error('Old range unavailable'));

		expect(await pending).toBeNull();
		expect(availabilityStore.load).not.toHaveBeenCalled();
	});

	it.each(['response', 'failure'] as const)(
		'drops a recovery %s that arrives after its Organization shell ends',
		async (outcome) => {
			let settle!: {
				resolve: (value: Awaited<ReturnType<typeof loadCalendarRange>>) => void;
				reject: (error: Error) => void;
			};
			vi.mocked(loadCalendarRange).mockImplementation(
				() => new Promise((resolve, reject) => (settle = { resolve, reject }))
			);
			const pending = reconcileAvailability(['2026-04-07'], scope);
			endOrganizationLifetime();
			if (outcome === 'response')
				settle.resolve({
					rangeStart: '2026-04-07',
					rangeEnd: '2026-04-07',
					availabilityEntries: [],
					specialDays: [],
					dailyAssignments: []
				});
			else settle.reject(new Error('Old range unavailable'));

			expect(await settles(pending)).toBe(false);
			expect(availabilityStore.load).not.toHaveBeenCalled();
		}
	);

	it('reports a failed range read while the same Organization is still open', async () => {
		vi.mocked(loadCalendarRange).mockRejectedValueOnce(new Error('Current range unavailable'));

		await expect(reconcileAvailability(['2026-04-07'], scope)).rejects.toThrow('Current range unavailable');
	});
});
