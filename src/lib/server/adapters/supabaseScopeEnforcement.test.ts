import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseScopeEnforcementAdapter } from './supabaseScopeEnforcement';
import { createSupabaseGroupResolver, enforceGroupAccess, enforceGroupAccessBatch } from '$lib/server/groupAccess';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('$lib/server/groupAccess', () => ({
	createSupabaseGroupResolver: vi.fn(() => ({ resolver: true })),
	enforceGroupAccess: vi.fn().mockResolvedValue(undefined),
	enforceGroupAccessBatch: vi.fn().mockResolvedValue(undefined)
}));

function makeRecordSupabase(record: Record<string, unknown> | null, error: unknown = null): SupabaseClient {
	const maybeSingle = vi.fn().mockResolvedValue({ data: record, error });
	const eqOrganization = vi.fn(() => ({ maybeSingle }));
	const eqId = vi.fn(() => ({ eq: eqOrganization }));
	const select = vi.fn(() => ({ eq: eqId }));
	const from = vi.fn(() => ({ select }));
	return { from } as unknown as SupabaseClient;
}

describe('createSupabaseScopeEnforcementAdapter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('enforces direct group access through the shared group resolver', async () => {
		const supabase = makeRecordSupabase(null);
		const scope = createSupabaseScopeEnforcementAdapter({
			supabase,
			orgId: 'org-1',
			scopeSet: { kind: 'groups', groupIds: ['group-1'] }
		});

		await scope.requireGroupAccess('person-1');

		expect(createSupabaseGroupResolver).toHaveBeenCalledWith(supabase);
		expect(enforceGroupAccess).toHaveBeenCalledWith(
			{ resolver: true },
			{ kind: 'groups', groupIds: ['group-1'] },
			'person-1'
		);
	});

	it('enforces batched group access through the shared group resolver', async () => {
		const supabase = makeRecordSupabase(null);
		const scope = createSupabaseScopeEnforcementAdapter({
			supabase,
			orgId: 'org-1',
			scopeSet: { kind: 'groups', groupIds: ['group-1'] }
		});

		await scope.requireGroupAccessBatch(['person-1', 'person-2']);

		expect(createSupabaseGroupResolver).toHaveBeenCalledWith(supabase);
		expect(enforceGroupAccessBatch).toHaveBeenCalledWith(
			{ resolver: true },
			{ kind: 'groups', groupIds: ['group-1'] },
			['person-1', 'person-2']
		);
	});

	it('skips empty batch enforcement without querying', async () => {
		const supabase = makeRecordSupabase(null);
		const scope = createSupabaseScopeEnforcementAdapter({
			supabase,
			orgId: 'org-1',
			scopeSet: { kind: 'groups', groupIds: ['group-1'] }
		});

		await scope.requireGroupAccessBatch([]);

		expect(createSupabaseGroupResolver).not.toHaveBeenCalled();
		expect(enforceGroupAccessBatch).not.toHaveBeenCalled();
	});

	it('enforces record-derived group access for grouped scopes', async () => {
		const supabase = makeRecordSupabase({ personnel_id: 'person-1' });
		const scope = createSupabaseScopeEnforcementAdapter({
			supabase,
			orgId: 'org-1',
			scopeSet: { kind: 'groups', groupIds: ['group-1'] }
		});

		await scope.requireGroupAccessByRecord('training_records', 'record-1', 'personnel_id');

		expect(supabase.from).toHaveBeenCalledWith('training_records');
		expect(enforceGroupAccess).toHaveBeenCalledWith(
			{ resolver: true },
			{ kind: 'groups', groupIds: ['group-1'] },
			'person-1'
		);
	});

	it('silently allows record-derived access when the record is not found', async () => {
		const supabase = makeRecordSupabase(null);
		const scope = createSupabaseScopeEnforcementAdapter({
			supabase,
			orgId: 'org-1',
			scopeSet: { kind: 'groups', groupIds: ['group-1'] }
		});

		await expect(
			scope.requireGroupAccessByRecord('training_records', 'missing', 'personnel_id')
		).resolves.toBeUndefined();

		expect(enforceGroupAccess).not.toHaveBeenCalled();
	});

	it('fails closed when record-derived group access lookup errors', async () => {
		const queryError = new Error('scope lookup failed');
		const supabase = makeRecordSupabase(null, queryError);
		const scope = createSupabaseScopeEnforcementAdapter({
			supabase,
			orgId: 'org-1',
			scopeSet: { kind: 'groups', groupIds: ['group-1'] }
		});

		await expect(scope.requireGroupAccessByRecord('training_records', 'record-1', 'personnel_id')).rejects.toBe(
			queryError
		);

		expect(enforceGroupAccess).not.toHaveBeenCalled();
	});

	it('silently allows record-derived access when the personnel column is null', async () => {
		const supabase = makeRecordSupabase({ personnel_id: null });
		const scope = createSupabaseScopeEnforcementAdapter({
			supabase,
			orgId: 'org-1',
			scopeSet: { kind: 'groups', groupIds: ['group-1'] }
		});

		await expect(
			scope.requireGroupAccessByRecord('training_records', 'record-1', 'personnel_id')
		).resolves.toBeUndefined();

		expect(enforceGroupAccess).not.toHaveBeenCalled();
	});

	it('skips record lookups for organization scope', async () => {
		const supabase = makeRecordSupabase({ personnel_id: 'person-1' });
		const scope = createSupabaseScopeEnforcementAdapter({
			supabase,
			orgId: 'org-1',
			scopeSet: { kind: 'organization' }
		});

		await scope.requireGroupAccessByRecord('training_records', 'record-1', 'personnel_id');

		expect(supabase.from).not.toHaveBeenCalled();
		expect(enforceGroupAccess).not.toHaveBeenCalled();
	});
});
