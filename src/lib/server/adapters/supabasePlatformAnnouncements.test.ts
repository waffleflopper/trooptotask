import { describe, expect, it, vi } from 'vitest';
import { createSupabasePlatformAnnouncementsStore } from './supabasePlatformAnnouncements';

const ANNOUNCEMENT_ID = '11111111-1111-1111-1111-111111111111';
const PROVIDER_ERROR = { message: 'database offline', code: 'XX000' };

type SupabaseResult<T = unknown> = {
	data: T | null;
	error: unknown;
};

type Call = {
	method: string;
	args: unknown[];
};

function createThenableQueryBuilder(result: SupabaseResult) {
	const calls: Call[] = [];
	const resolved = Promise.resolve(result);
	const builder: Record<string, unknown> = {
		select: track('select'),
		eq: track('eq'),
		maybeSingle: () => {
			calls.push({ method: 'maybeSingle', args: [] });
			return resolved;
		},
		update: track('update'),
		then: resolved.then.bind(resolved)
	};

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	return { builder, calls };
}

function createStoreWithResults(...results: SupabaseResult[]) {
	const builders = results.map((result) => createThenableQueryBuilder(result));
	let nextBuilder = 0;
	const from = vi.fn(() => builders[nextBuilder++]?.builder);
	const store = createSupabasePlatformAnnouncementsStore({ from } as never);
	return { store, from, builders };
}

describe('createSupabasePlatformAnnouncementsStore', () => {
	it('returns the toggled announcement state when the row exists', async () => {
		const { store, from } = createStoreWithResults(
			{ data: { id: ANNOUNCEMENT_ID, is_active: false }, error: null },
			{ data: { id: ANNOUNCEMENT_ID }, error: null }
		);

		const result = await store.toggleAnnouncementActive({ id: ANNOUNCEMENT_ID, updatedBy: 'admin-1' });

		expect(result).toEqual({ id: ANNOUNCEMENT_ID, isActive: true });
		expect(from).toHaveBeenCalledTimes(2);
	});

	it('returns null when a toggle target disappears before the update returns', async () => {
		const { store, from } = createStoreWithResults(
			{ data: { id: ANNOUNCEMENT_ID, is_active: false }, error: null },
			{ data: null, error: null }
		);

		const result = await store.toggleAnnouncementActive({ id: ANNOUNCEMENT_ID, updatedBy: 'admin-1' });

		expect(result).toBeNull();
		expect(from).toHaveBeenCalledTimes(2);
	});

	it('returns null when a toggle target is missing', async () => {
		const { store, from } = createStoreWithResults({ data: null, error: null });

		const result = await store.toggleAnnouncementActive({ id: ANNOUNCEMENT_ID, updatedBy: 'admin-1' });

		expect(result).toBeNull();
		expect(from).toHaveBeenCalledTimes(1);
	});

	it('surfaces provider errors while fetching a toggle target', async () => {
		const { store, from } = createStoreWithResults({ data: null, error: PROVIDER_ERROR });

		await expect(store.toggleAnnouncementActive({ id: ANNOUNCEMENT_ID, updatedBy: 'admin-1' })).rejects.toThrow(
			'table platform_announcements toggle fetch failed: database offline (XX000)'
		);
		expect(from).toHaveBeenCalledTimes(1);
	});
});
