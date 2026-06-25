import { describe, expect, it, vi } from 'vitest';
import { createSupabaseBillingReconciliationStore } from '$lib/server/adapters/supabaseBillingReconciliation';

function createQueryStub(result: { data: Record<string, unknown>[] | null; error: { message: string } | null }) {
	const query = {
		select: vi.fn(() => query),
		or: vi.fn(() => query),
		eq: vi.fn(() => query),
		order: vi.fn(() => query),
		limit: vi.fn(() => query),
		gt: vi.fn(() => query),
		then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
			Promise.resolve(result).then(resolve, reject)
	};
	return query;
}

function createSupabaseStub(input: {
	organizations: { data: Record<string, unknown>[] | null; error: { message: string } | null };
	snapshots: { data: Record<string, unknown>[] | null; error: { message: string } | null };
}) {
	const organizationQuery = createQueryStub(input.organizations);
	const snapshotQuery = createQueryStub(input.snapshots);
	const from = vi.fn((table: string) => {
		if (table === 'organizations') return organizationQuery;
		if (table === 'organization_billing_snapshots') return snapshotQuery;
		throw new Error(`Unexpected table ${table}`);
	});

	return {
		supabase: { from },
		from,
		organizationQuery,
		snapshotQuery
	};
}

describe('supabase billing reconciliation adapter', () => {
	it('lists candidates from legacy organization mirrors and billing snapshots', async () => {
		const stub = createSupabaseStub({
			organizations: { data: [{ id: 'org-3' }, { id: 'org-1' }], error: null },
			snapshots: { data: [{ organization_id: 'org-2' }, { organization_id: 'org-1' }], error: null }
		});
		const store = createSupabaseBillingReconciliationStore(stub.supabase as never);

		await expect(store.listCandidates({ limit: 2, cursor: 'org-0' })).resolves.toEqual([
			{ orgId: 'org-1' },
			{ orgId: 'org-2' }
		]);

		expect(stub.from).toHaveBeenCalledWith('organizations');
		expect(stub.from).toHaveBeenCalledWith('organization_billing_snapshots');
		expect(stub.organizationQuery.gt).toHaveBeenCalledWith('id', 'org-0');
		expect(stub.snapshotQuery.gt).toHaveBeenCalledWith('organization_id', 'org-0');
	});

	it('ignores malformed candidate rows before merging', async () => {
		const stub = createSupabaseStub({
			organizations: { data: [{ id: 'org-3' }, { id: null }, { id: 123 }], error: null },
			snapshots: { data: [{ organization_id: 'org-2' }, { organization_id: undefined }], error: null }
		});
		const store = createSupabaseBillingReconciliationStore(stub.supabase as never);

		await expect(store.listCandidates({ limit: 10, cursor: null })).resolves.toEqual([
			{ orgId: 'org-2' },
			{ orgId: 'org-3' }
		]);
	});

	it('surfaces billing snapshot candidate query failures', async () => {
		const stub = createSupabaseStub({
			organizations: { data: [{ id: 'org-1' }], error: null },
			snapshots: { data: null, error: { message: 'snapshot query failed' } }
		});
		const store = createSupabaseBillingReconciliationStore(stub.supabase as never);

		await expect(store.listCandidates({ limit: 10, cursor: null })).rejects.toThrow(
			'Failed to list billing snapshot reconciliation candidates: snapshot query failed'
		);
	});
});
