import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createInMemoryDataStore, createQueryPortsContext } from '$lib/server/adapters/inMemory';
import { loadLogsSettings } from './settingsLogs.server';

describe('admitted Logs source composition', () => {
	it('binds same-Organization source labels and exact emails while preserving masking and saved actor precedence', async () => {
		const ctx = createQueryPortsContext();
		const orgId = ctx.auth.orgId;
		const person = '11111111-1111-4111-8111-111111111111';
		const training = '22222222-2222-4222-8222-222222222222';
		const status = '33333333-3333-4333-8333-333333333333';
		const foreign = '44444444-4444-4444-8444-444444444444';
		const store = createInMemoryDataStore();
		store.seed('personnel', [
			{
				id: person,
				organization_id: orgId,
				rank: 'SPC',
				last_name: 'Able',
				first_name: 'Synthetic',
				archived_at: '2026-01-01'
			},
			{ id: foreign, organization_id: 'foreign-org', rank: 'SFC', last_name: 'Foreign', first_name: 'Person' }
		]);
		store.seed('training_types', [
			{ id: training, organization_id: orgId, name: 'Training Required' },
			{ id: foreign, organization_id: 'foreign-org', name: 'Foreign Training' }
		]);
		store.seed('status_types', [
			{ id: status, organization_id: orgId, name: 'Leave' },
			{ id: foreign, organization_id: 'foreign-org', name: 'Foreign Status' }
		]);
		store.seed('organization_memberships', [
			{
				id: 'membership',
				organization_id: orgId,
				user_id: 'actor-a',
				email: ' Owner@Example.test ',
				name: 'Wrong display name'
			},
			{ id: 'foreign-membership', organization_id: 'foreign-org', user_id: 'actor-b', email: 'foreign@example.test' }
		]);
		const base = {
			action: 'training_record.updated',
			resource_type: 'training_record',
			resource_id: training,
			timestamp: '2026-10-01T12:00:00Z'
		};
		const rows = [
			{
				...base,
				id: 'labeled',
				user_id: 'actor-a',
				details: {
					personnel_id: person,
					training_type_id: training,
					status_type_id: status,
					notes: '[redacted]',
					email: 's***@example.test'
				}
			},
			{ ...base, id: 'saved-actor', user_id: 'actor-a', details: { actor: '' } },
			{
				...base,
				id: 'unresolved',
				user_id: 'actor-b',
				details: {
					personnel_id: foreign,
					training_type_id: foreign,
					status_type_id: foreign,
					unknown_reference: foreign.toUpperCase(),
					subject_label: 'Saved subject'
				}
			}
		];
		const client = createClient('http://127.0.0.1:1', 'synthetic-anon-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (url, init) =>
					new URL(String(url)).pathname.includes('/rpc/')
						? Response.json([{ action: base.action }])
						: new Response(init?.method === 'HEAD' ? null : JSON.stringify(rows), {
								headers: { 'Content-Type': 'application/json', 'Content-Range': '0-2/3' }
							})
			}
		});
		const result = (await loadLogsSettings(ctx, store, client)).sections.logs.auditLogPage;
		expect(result.logs).toEqual([
			expect.objectContaining({
				id: 'labeled',
				userId: 'actor-a',
				resourceId: training,
				actor: ' Owner@Example.test ',
				details: {
					personnel: 'SPC Able Synthetic',
					training_type: 'Training Required',
					status_type: 'Leave',
					notes: '[redacted]',
					email: 's***@example.test'
				}
			}),
			expect.objectContaining({ id: 'saved-actor', actor: '', details: { actor: '' } }),
			expect.objectContaining({ id: 'unresolved', actor: null, details: { subject_label: 'Saved subject' } })
		]);
		expect(result.limit).toBe(100);
		expect(result.totalCount).toBe(3);
	});
});
