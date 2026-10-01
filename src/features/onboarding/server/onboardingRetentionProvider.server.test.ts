import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseOnboardingRetentionSource } from './onboardingRetentionProvider.server';

const cutoff = '2025-10-01T12:00:00.000Z';
const expired = '2025-10-01T11:59:59.999Z';

describe('Supabase Onboarding retention deletion', () => {
	it.each(['completed', 'cancelled'] as const)(
		'rechecks %s candidates using Organization, IDs, terminal status and a strict cutoff at the parent mutation',
		async (status) => {
			const timestamp = status === 'completed' ? 'completed_at' : 'cancelled_at';
			const otherStatus = status === 'completed' ? 'cancelled' : 'completed';
			let rows = [
				{ id: 'delete' },
				{ id: 'reopened', status: 'in_progress' },
				{ id: 'recent', [timestamp]: '2026-10-01T12:00:00.000Z' },
				{ id: 'boundary', [timestamp]: cutoff },
				{ id: 'null', [timestamp]: null },
				{ id: 'wrong-org', organization_id: 'org-b' },
				{ id: 'wrong-status', status: otherStatus },
				{ id: 'outside-batch' }
			].map((row) => ({ organization_id: 'org-a', status, completed_at: expired, cancelled_at: expired, ...row }));
			const witnesses = new Map(
				rows.map((row) => [row.id, { completed: true, notes: [{ text: 'Retained work', userId: 'author-1' }] }])
			);
			const client = createClient('http://127.0.0.1:9', 'synthetic-offline-only', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: {
					fetch: async (input, init) => {
						const url = new URL(String(input));
						expect(init?.method).toBe('DELETE');
						expect(url.pathname).toBe('/rest/v1/personnel_onboardings');
						expect(url.searchParams.get('select')).toBe('id');
						// Interpret the wire filters independently, so omitted/loosened
						// predicates delete protected rows and fail the stored-state check.
						const deleted = rows.filter((row) => {
							for (const [column, expression] of url.searchParams) {
								if (column === 'select') continue;
								const value = row[column as keyof typeof row];
								if (expression.startsWith('eq.')) {
									if (value !== expression.slice(3)) return false;
								} else if (expression.startsWith('in.(') && expression.endsWith(')')) {
									if (!expression.slice(4, -1).split(',').includes(String(value))) return false;
								} else if (expression.startsWith('lt.')) {
									if (typeof value !== 'string' || Date.parse(value) >= Date.parse(expression.slice(3))) return false;
								} else {
									throw new Error('Unsupported controlled PostgREST filter');
								}
							}
							return true;
						});
						const deletedIds = new Set(deleted.map((row) => row.id));
						rows = rows.filter((row) => !deletedIds.has(row.id));
						// Model the schema's existing cascade; actual FK/lock proof is separate.
						for (const id of deletedIds) witnesses.delete(id);
						return Response.json(deleted.map((row) => ({ id: row.id })));
					}
				}
			});
			const source = createSupabaseOnboardingRetentionSource(client);
			const deleted = await source.deleteExpiredBatch(
				'org-a',
				status,
				['delete', 'reopened', 'recent', 'boundary', 'null', 'wrong-org', 'wrong-status'],
				cutoff
			);

			expect(deleted).toBe(1);
			const expectedIds = ['reopened', 'recent', 'boundary', 'null', 'wrong-org', 'wrong-status', 'outside-batch'];
			expect(rows.map((row) => row.id)).toEqual(expectedIds);
			expect([...witnesses.keys()]).toEqual(expectedIds);
			expect(witnesses.get('reopened')).toEqual({
				completed: true,
				notes: [{ text: 'Retained work', userId: 'author-1' }]
			});
			await expect(
				source.deleteExpiredBatch(
					'org-a',
					status,
					['delete', 'reopened', 'recent', 'boundary', 'null', 'wrong-org', 'wrong-status'],
					cutoff
				)
			).resolves.toBe(0);
			expect(rows.map((row) => row.id)).toEqual(expectedIds);
		}
	);

	it('propagates a parent DELETE failure', async () => {
		const client = createClient('http://127.0.0.1:9', 'synthetic-offline-only', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					expect(init?.method).toBe('DELETE');
					expect(new URL(String(input)).pathname).toBe('/rest/v1/personnel_onboardings');
					return Response.json(
						{ code: 'P0001', message: 'parent delete unavailable', details: null, hint: null },
						{ status: 500 }
					);
				}
			}
		});
		await expect(
			createSupabaseOnboardingRetentionSource(client).deleteExpiredBatch('org-a', 'cancelled', ['fault-parent'], cutoff)
		).rejects.toThrow('parent delete unavailable');
	});

	it('returns zero for an empty candidate batch without issuing a mutation', async () => {
		const client = createClient('http://127.0.0.1:9', 'synthetic-offline-only', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async () => {
					throw new Error('No request is permitted for an empty batch');
				}
			}
		});
		await expect(
			createSupabaseOnboardingRetentionSource(client).deleteExpiredBatch('org-a', 'completed', [], cutoff)
		).resolves.toBe(0);
	});
});
