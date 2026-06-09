import { describe, expect, it, vi } from 'vitest';
import { createSupabasePlatformMembershipAdministrationStore } from './supabasePlatformMembershipAdministration';

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
		order: track('order'),
		range: (...args: unknown[]) => {
			calls.push({ method: 'range', args });
			return resolved;
		},
		update: track('update'),
		maybeSingle: () => {
			calls.push({ method: 'maybeSingle', args: [] });
			return resolved;
		}
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
	const store = createSupabasePlatformMembershipAdministrationStore({ from } as never);
	return { store, from, builders };
}

describe('createSupabasePlatformMembershipAdministrationStore', () => {
	it('lists organization members through a paginated scoped query', async () => {
		const { store, from, builders } = createStoreWithResults({
			data: [{ user_id: 'member-1', email: 'member@example.com', role: 'member' }],
			error: null
		});

		await expect(store.listMembers('org-1')).resolves.toEqual([
			{ userId: 'member-1', email: 'member@example.com', role: 'member' }
		]);
		expect(from).toHaveBeenCalledWith('organization_memberships');
		expect(builders[0].calls).toEqual([
			{ method: 'select', args: ['user_id, role, email'] },
			{ method: 'eq', args: ['organization_id', 'org-1'] },
			{ method: 'order', args: ['role'] },
			{ method: 'range', args: [0, 999] }
		]);
	});

	it('reads membership rows and updates roles through scoped membership queries', async () => {
		const { store, from, builders } = createStoreWithResults(
			{
				data: { organization_id: 'org-1', user_id: 'member-1', role: 'member' },
				error: null
			},
			{ data: { user_id: 'member-1' }, error: null }
		);

		await expect(store.getMembership({ orgId: 'org-1', userId: 'member-1' })).resolves.toEqual({
			orgId: 'org-1',
			userId: 'member-1',
			role: 'member'
		});
		await expect(store.setMembershipRole({ orgId: 'org-1', userId: 'member-1', role: 'admin' })).resolves.toBe(
			undefined
		);

		expect(from).toHaveBeenNthCalledWith(1, 'organization_memberships');
		expect(from).toHaveBeenNthCalledWith(2, 'organization_memberships');
		expect(builders[1].calls).toEqual([
			{ method: 'update', args: [{ role: 'admin' }] },
			{ method: 'eq', args: ['organization_id', 'org-1'] },
			{ method: 'eq', args: ['user_id', 'member-1'] },
			{ method: 'select', args: ['user_id'] },
			{ method: 'maybeSingle', args: [] }
		]);
	});

	it('surfaces provider errors while reading memberships', async () => {
		const { store } = createStoreWithResults({ data: null, error: { message: 'database offline', code: 'XX000' } });

		await expect(store.getMembership({ orgId: 'org-1', userId: 'member-1' })).rejects.toThrow(
			'table organization_memberships membership fetch failed: database offline (XX000)'
		);
	});

	it('treats a missing scoped update row as a failed role change', async () => {
		const { store } = createStoreWithResults({ data: null, error: null });

		await expect(store.setMembershipRole({ orgId: 'org-1', userId: 'missing-1', role: 'admin' })).rejects.toThrow(
			'table organization_memberships role update failed: missing row'
		);
	});
});
