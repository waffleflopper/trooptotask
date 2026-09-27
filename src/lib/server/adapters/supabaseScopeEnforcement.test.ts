import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { createSupabaseScopeEnforcementAdapter } from './supabaseScopeEnforcement';

class FakeQuery {
	private filters: Array<[string, unknown]> = [];

	constructor(
		private rows: Record<string, unknown>[],
		private lookupError?: Error
	) {}

	select(_columns: string): this {
		return this;
	}

	eq(column: string, value: unknown): this {
		this.filters.push([column, value]);
		return this;
	}

	async in(column: string, values: string[]) {
		return { data: this.matches().filter((row) => values.includes(row[column] as string)), error: null };
	}

	async single() {
		return { data: this.matches()[0] ?? null, error: this.lookupError ?? null };
	}

	async maybeSingle() {
		return { data: this.matches()[0] ?? null, error: this.lookupError ?? null };
	}

	private matches(): Record<string, unknown>[] {
		return this.rows.filter((row) => this.filters.every(([column, value]) => row[column] === value));
	}
}

function fakeSupabase(rowsByTable: Record<string, Record<string, unknown>[]>, lookupError?: Error) {
	const from = vi.fn((table: string) => new FakeQuery(rowsByTable[table] ?? [], lookupError));
	return { supabase: { from } as unknown as SupabaseClient, from };
}

const groupScope: ScopeSet = { kind: 'groups', groupIds: ['group-a'] };

describe('createSupabaseScopeEnforcementAdapter', () => {
	it('allows only same-Organization Personnel in the actor Group', async () => {
		const { supabase } = fakeSupabase({
			personnel: [
				{ id: 'allowed', organization_id: 'org-1', group_id: 'group-a' },
				{ id: 'outside', organization_id: 'org-1', group_id: 'group-b' },
				{ id: 'unassigned', organization_id: 'org-1', group_id: null },
				{ id: 'foreign', organization_id: 'org-2', group_id: 'group-a' }
			]
		});
		const scope = createSupabaseScopeEnforcementAdapter({ supabase, orgId: 'org-1', scopeSet: groupScope });

		await expect(scope.requireGroupAccess('allowed')).resolves.toBeUndefined();
		for (const id of ['outside', 'unassigned', 'missing', 'foreign']) {
			await expect(scope.requireGroupAccess(id)).rejects.toMatchObject({ status: 403 });
		}
	});

	it('denies a batch containing a missing or out-of-scope Person', async () => {
		const { supabase } = fakeSupabase({
			personnel: [
				{ id: 'first', organization_id: 'org-1', group_id: 'group-a' },
				{ id: 'second', organization_id: 'org-1', group_id: 'group-a' },
				{ id: 'outside', organization_id: 'org-1', group_id: 'group-b' }
			]
		});
		const scope = createSupabaseScopeEnforcementAdapter({ supabase, orgId: 'org-1', scopeSet: groupScope });

		await expect(scope.requireGroupAccessBatch(['first', 'second'])).resolves.toBeUndefined();
		await expect(scope.requireGroupAccessBatch(['first', 'outside'])).rejects.toMatchObject({ status: 403 });
		await expect(scope.requireGroupAccessBatch(['first', 'missing'])).rejects.toMatchObject({ status: 403 });
	});

	it('skips provider reads for Organization scope and empty batches', async () => {
		const { supabase, from } = fakeSupabase({});
		const organization = createSupabaseScopeEnforcementAdapter({
			supabase,
			orgId: 'org-1',
			scopeSet: { kind: 'organization' }
		});
		const scoped = createSupabaseScopeEnforcementAdapter({ supabase, orgId: 'org-1', scopeSet: groupScope });

		await organization.requireGroupAccess('missing');
		await organization.requireGroupAccessBatch(['missing']);
		await scoped.requireGroupAccessBatch([]);
		expect(from).not.toHaveBeenCalled();
	});

	it('denies an empty Group scope without a provider read', async () => {
		const { supabase, from } = fakeSupabase({});
		const scope = createSupabaseScopeEnforcementAdapter({
			supabase,
			orgId: 'org-1',
			scopeSet: { kind: 'groups', groupIds: [] }
		});

		await expect(scope.requireGroupAccess('any')).rejects.toMatchObject({ status: 403 });
		await expect(scope.requireGroupAccessBatch(['any'])).rejects.toMatchObject({ status: 403 });
		expect(from).not.toHaveBeenCalled();
	});

	it('checks a record Person and preserves missing/unassigned record behavior', async () => {
		const { supabase } = fakeSupabase({
			training_records: [
				{ id: 'allowed-record', organization_id: 'org-1', personnel_id: 'allowed' },
				{ id: 'outside-record', organization_id: 'org-1', personnel_id: 'outside' },
				{ id: 'unassigned-record', organization_id: 'org-1', personnel_id: null },
				{ id: 'foreign-record', organization_id: 'org-2', personnel_id: 'allowed' }
			],
			personnel: [
				{ id: 'allowed', organization_id: 'org-1', group_id: 'group-a' },
				{ id: 'outside', organization_id: 'org-1', group_id: 'group-b' }
			]
		});
		const scope = createSupabaseScopeEnforcementAdapter({ supabase, orgId: 'org-1', scopeSet: groupScope });

		await expect(
			scope.requireGroupAccessByRecord('training_records', 'allowed-record', 'personnel_id')
		).resolves.toBeUndefined();
		await expect(
			scope.requireGroupAccessByRecord('training_records', 'outside-record', 'personnel_id')
		).rejects.toMatchObject({ status: 403 });
		for (const id of ['unassigned-record', 'missing', 'foreign-record']) {
			await expect(scope.requireGroupAccessByRecord('training_records', id, 'personnel_id')).resolves.toBeUndefined();
		}
	});

	it('propagates record lookup errors before reading the Person', async () => {
		const failure = new Error('scope lookup failed');
		const { supabase, from } = fakeSupabase({}, failure);
		const scope = createSupabaseScopeEnforcementAdapter({ supabase, orgId: 'org-1', scopeSet: groupScope });

		await expect(scope.requireGroupAccessByRecord('training_records', 'any', 'personnel_id')).rejects.toBe(failure);
		expect(from).toHaveBeenCalledTimes(1);
	});
});
