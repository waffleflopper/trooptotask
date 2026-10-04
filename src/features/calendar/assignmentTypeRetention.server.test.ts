import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseAssignmentTypeRetention } from './assignmentTypeRetention.server';

const cutoff = '2025-10-01T12:00:00.000Z';
const expired = '2025-10-01T11:59:59.999Z';

function provider(failure?: 'page' | 'rpc' | 'count') {
	const expiredIds = Array.from({ length: 1001 }, (_, index) => `expired-${String(index).padStart(4, '0')}`);
	let rows = [
		...expiredIds.map((id) => ({ id, organization_id: 'org-a', archived_at: expired })),
		{ id: 'same-history', organization_id: 'org-a', archived_at: expired },
		{ id: 'foreign-history', organization_id: 'org-a', archived_at: expired },
		{ id: 'boundary', organization_id: 'org-a', archived_at: cutoff },
		{ id: 'recent', organization_id: 'org-a', archived_at: '2026-10-01T12:00:00.000Z' },
		{ id: 'active', organization_id: 'org-a', archived_at: null },
		{ id: 'foreign', organization_id: 'org-b', archived_at: expired }
	];
	const original = structuredClone(rows);
	const references = [
		{ id: 'person-assignment', organization_id: 'org-a', assignment_type_id: 'same-history' },
		{ id: 'historical-assignment', organization_id: 'org-b', assignment_type_id: 'foreign-history' }
	];
	const client = createClient('http://127.0.0.1:9', 'synthetic-offline-only', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				if (url.pathname === '/rest/v1/assignment_types' && (!init?.method || init.method === 'GET')) {
					const from = Number(url.searchParams.get('offset') ?? 0);
					if (failure === 'page' && from >= 1000)
						return Response.json({ code: '42501', message: 'type discovery unavailable' }, { status: 403 });
					const selected = rows
						.filter((row) => {
							for (const [column, expression] of url.searchParams) {
								const value = row[column as keyof typeof row];
								if (expression.startsWith('eq.') && value !== expression.slice(3)) return false;
								if (expression === 'not.is.null' && value == null) return false;
								if (
									expression.startsWith('lt.') &&
									(typeof value !== 'string' || Date.parse(value) >= Date.parse(expression.slice(3)))
								)
									return false;
							}
							return true;
						})
						.sort((a, b) => a.id.localeCompare(b.id));
					const size = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000);
					return Response.json(selected.slice(from, from + size).map(({ id }) => ({ id })));
				}
				if (url.pathname === '/rest/v1/rpc/delete_expired_unreferenced_assignment_types' && init?.method === 'POST') {
					if (failure === 'rpc')
						return Response.json({ code: 'P0001', message: 'type deletion unavailable' }, { status: 500 });
					if (failure === 'count') return Response.json(null);
					const args = JSON.parse(String(init.body)) as {
						p_org_id: string;
						p_candidate_ids: string[];
						p_cutoff: string;
					};
					const deleted = rows.filter(
						(row) =>
							row.organization_id === args.p_org_id &&
							args.p_candidate_ids.includes(row.id) &&
							row.archived_at != null &&
							Date.parse(row.archived_at) < Date.parse(args.p_cutoff) &&
							!references.some((reference) => reference.assignment_type_id === row.id)
					);
					const ids = new Set(deleted.map((row) => row.id));
					rows = rows.filter((row) => !ids.has(row.id));
					return Response.json(deleted.length);
				}
				throw new Error('Unexpected Calendar retention provider request');
			}
		}
	});
	return { client, rows: () => rows, original, references };
}

describe('Calendar-owned assignment-type retention', () => {
	it('uses every eligible candidate beyond one page and reports the guarded count without changing saved history', async () => {
		const fixture = provider();
		const source = createSupabaseAssignmentTypeRetention(fixture.client);
		await expect(source.deleteExpired('org-a', cutoff)).resolves.toBe(1001);
		const retainedIds = ['same-history', 'foreign-history', 'boundary', 'recent', 'active', 'foreign'];
		expect(fixture.rows()).toEqual(fixture.original.filter((row) => retainedIds.includes(row.id)));
		expect(fixture.references).toEqual([
			{ id: 'person-assignment', organization_id: 'org-a', assignment_type_id: 'same-history' },
			{ id: 'historical-assignment', organization_id: 'org-b', assignment_type_id: 'foreign-history' }
		]);
		await expect(source.deleteExpired('org-a', cutoff)).resolves.toBe(0);
		expect(fixture.rows()).toEqual(fixture.original.filter((row) => retainedIds.includes(row.id)));
	});

	it.each(['page', 'rpc', 'count'] as const)(
		'rejects an unreadable %s result without reporting cleanup success',
		async (failure) => {
			const fixture = provider(failure);
			await expect(
				createSupabaseAssignmentTypeRetention(fixture.client).deleteExpired('org-a', cutoff)
			).rejects.toThrow();
			expect(fixture.rows()).toEqual(fixture.original);
		}
	);
});
