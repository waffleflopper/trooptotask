import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabasePersonnelArtifactRetentionSource } from './personnelArtifactRetention.server';

const ORG = 'd130b000-0000-4000-8000-000000000001';
const FOREIGN_ORG = 'd130b000-0000-4000-8000-000000000002';
const CUTOFF = '2023-10-01T12:00:00.000Z';
const EXPIRED = '2000-01-01T12:00:00.000Z';
const RECENT = '2026-09-30T12:00:00.000Z';
const families = [
	{ table: 'personnel_follow_ups', method: 'deleteExpiredFollowUps', index: 1 },
	{ table: 'counseling_records', method: 'deleteExpiredCounselingRecords', index: 2 },
	{ table: 'personnel_documents', method: 'deleteExpiredDocuments', index: 3 },
	{ table: 'leader_notes', method: 'deleteExpiredLeaderNotes', index: 4 }
] as const;
type Family = (typeof families)[number];
interface Row {
	id: string;
	organization_id: string;
	archived_at: string | null;
	status?: string;
}

function rowFor(family: Family, index: number, org: string, archived: string | null): Row {
	return {
		id: `d130${family.index.toString(16).padStart(4, '0')}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
		organization_id: org,
		archived_at: archived,
		...(family.table === 'personnel_follow_ups' ? { status: archived ? 'archived' : 'open' } : {})
	};
}

function fixture(family: Family, count: number) {
	const expired = Array.from({ length: count }, (_, index) => rowFor(family, index + 1, ORG, EXPIRED));
	const retained = [
		rowFor(family, 2001, ORG, null),
		rowFor(family, 2002, ORG, RECENT),
		rowFor(family, 2003, ORG, CUTOFF),
		rowFor(family, 2004, FOREIGN_ORG, EXPIRED),
		...(family.table === 'personnel_follow_ups' ? [{ ...rowFor(family, 2008, ORG, EXPIRED), status: 'completed' }] : [])
	];
	const state = {
		rows: structuredClone([...expired, ...retained]),
		requests: [] as string[],
		beforeDelete: () => {},
		deleteFailure: false
	};
	const matches = (row: Row, params: URLSearchParams) =>
		[...params].every(([key, filter]) => {
			if (['select', 'offset', 'limit', 'order'].includes(key)) return true;
			if (key === 'organization_id') return filter === `eq.${row.organization_id}`;
			if (key === 'status') return filter === `eq.${row.status}`;
			if (key === 'id')
				return filter.startsWith('in.(') ? filter.slice(4, -1).split(',').includes(row.id) : filter === `eq.${row.id}`;
			if (key === 'archived_at') {
				if (filter === 'not.is.null') return row.archived_at !== null;
				if (filter.startsWith('lt.'))
					return row.archived_at !== null && Date.parse(row.archived_at) < Date.parse(filter.slice(3));
			}
			throw new Error(`Unsupported finite REST filter: ${key} ${filter}`);
		});
	const client = createClient('http://127.0.0.1:9', 'synthetic-artifact-retention-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const method = init?.method ?? 'GET';
				state.requests.push(`${method} ${url.pathname}`);
				if (url.href.length > 8192) return new Response('URI too long', { status: 414 });
				if (!url.pathname.startsWith(`/rest/v1/${family.table}`) || !['GET', 'DELETE'].includes(method))
					throw new Error(`Unexpected finite request: ${method} ${url.pathname}`);
				const params = url.searchParams;
				if (method === 'DELETE') {
					if (state.deleteFailure) return Response.json({ message: 'deletion rejected' }, { status: 403 });
					state.beforeDelete();
					const removed = new Set(state.rows.filter((row) => matches(row, params)).map((row) => row.id));
					state.rows = state.rows.filter((row) => !removed.has(row.id));
					return new Response(null, { status: 204, headers: { 'content-range': `*/${removed.size}` } });
				}
				const offset = Number(params.get('offset') ?? 0);
				const rows = state.rows.filter((row) => matches(row, params)).sort((a, b) => a.id.localeCompare(b.id));
				return Response.json(rows.slice(offset, offset + 1000).map((row) => ({ id: row.id })));
			}
		}
	});
	return {
		state,
		expired,
		retained,
		deleteExpired: () => createSupabasePersonnelArtifactRetentionSource(client)[family.method](ORG, CUTOFF)
	};
}

const ids = (rows: Row[]) => rows.map((row) => row.id).sort();

describe('Personnel scheduled artifact retention', () => {
	it.each(families)(
		'$method deletes all 1,001 expired artifacts and keeps active, recent, cutoff-equal and foreign records',
		async (family) => {
			const run = fixture(family, 1001);
			await expect(run.deleteExpired()).resolves.toBe(1001);
			expect(ids(run.state.rows)).toEqual(ids(run.retained));
			await expect(run.deleteExpired()).resolves.toBe(0);
			expect(ids(run.state.rows)).toEqual(ids(run.retained));
		}
	);

	it.each(families)('$method keeps an artifact restored or re-archived before its deletion runs', async (family) => {
		const run = fixture(family, 3);
		const [restored, rearchived] = run.expired;
		run.state.beforeDelete = () => {
			const restoredRow = run.state.rows.find((row) => row.id === restored.id)!;
			restoredRow.archived_at = null;
			if (restoredRow.status) restoredRow.status = 'open';
			run.state.rows.find((row) => row.id === rearchived.id)!.archived_at = RECENT;
		};
		await expect(run.deleteExpired()).resolves.toBe(1);
		expect(ids(run.state.rows)).toEqual(ids([...run.retained, restored, rearchived]));
	});

	it('propagates a rejected deletion', async () => {
		const run = fixture(families[2], 2);
		run.state.deleteFailure = true;
		await expect(run.deleteExpired()).rejects.toThrow('deletion rejected');
		expect(run.state.rows).toHaveLength(run.expired.length + run.retained.length);
	});
});
