import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabasePersonnelRetentionSource } from './personnelRetention.server';

const ORG = 'd1204000-0000-4000-8000-000000000001';
const FOREIGN_ORG = 'd1204000-0000-4000-8000-000000000002';
const CUTOFF = '2025-05-30T12:00:00.000Z';
const EXPIRED = '2025-01-01T00:00:00.000Z';
const RECENT = '2026-04-01T00:00:00.000Z';

interface Row {
	id: string;
	organization_id: string;
	archived_at: string | null;
}
interface DeleteInput {
	p_org_id: string;
	p_candidate_ids: string[];
	p_cutoff: string;
}

function personId(index: number) {
	return `d1204100-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function fixture() {
	const state = {
		personnel: [
			{ id: personId(1), organization_id: ORG, archived_at: '2025-05-30T11:59:59.999Z' },
			{ id: personId(2), organization_id: ORG, archived_at: EXPIRED },
			{ id: personId(3), organization_id: ORG, archived_at: null },
			{ id: personId(4), organization_id: ORG, archived_at: RECENT },
			{ id: personId(5), organization_id: ORG, archived_at: CUTOFF },
			{ id: personId(6), organization_id: FOREIGN_ORG, archived_at: EXPIRED }
		] as Row[],
		rpcInputs: [] as DeleteInput[],
		discoveryFailure: false,
		rpcFailure: false,
		countOverride: undefined as unknown,
		beforeDelete: () => {}
	};
	const client = createClient('http://127.0.0.1:9', 'synthetic-retention-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				if (url.href.length > 8192) return new Response('URI too long', { status: 414 });
				const resource = url.pathname.split('/').at(-1);
				if (resource === 'delete_expired_personnel' && init?.method === 'POST') {
					const args = JSON.parse(String(init.body)) as DeleteInput;
					state.rpcInputs.push(args);
					if (state.rpcFailure)
						return Response.json({ code: '23503', message: 'parent deletion rejected' }, { status: 409 });
					state.beforeDelete();
					const removed = new Set(
						state.personnel
							.filter(
								(row) =>
									row.organization_id === args.p_org_id &&
									args.p_candidate_ids.includes(row.id) &&
									row.archived_at != null &&
									Date.parse(row.archived_at) < Date.parse(args.p_cutoff)
							)
							.map((row) => row.id)
					);
					state.personnel = state.personnel.filter((row) => !removed.has(row.id));
					return Response.json(state.countOverride === undefined ? removed.size : state.countOverride);
				}
				if (resource !== 'personnel' || (init?.method ?? 'GET') !== 'GET')
					throw new Error(`Unexpected synthetic provider request: ${init?.method ?? 'GET'} ${url.pathname}`);
				const params = url.searchParams;
				const offset = Number(params.get('offset') ?? 0);
				if (state.discoveryFailure && offset >= 1000)
					return Response.json({ message: 'discovery unavailable' }, { status: 500 });
				const cutoff = params
					.getAll('archived_at')
					.find((filter) => filter.startsWith('lt.'))
					?.slice(3);
				const rows = state.personnel
					.filter(
						(row) =>
							params.get('organization_id') === `eq.${row.organization_id}` &&
							row.archived_at != null &&
							(!cutoff || Date.parse(row.archived_at) < Date.parse(cutoff))
					)
					.sort((a, b) => a.id.localeCompare(b.id));
				return Response.json(rows.slice(offset, offset + 1000).map((row) => ({ id: row.id })));
			}
		}
	});
	return { state, source: createSupabasePersonnelRetentionSource(client) };
}

function largeFixture() {
	const run = fixture();
	// Together with the two original expired parents, this is 1,001 candidates.
	for (let index = 7; index <= 1005; index++)
		run.state.personnel.unshift({ id: personId(index), organization_id: ORG, archived_at: EXPIRED });
	return run;
}

describe('Personnel scheduled parent retention', () => {
	it('deletes only expired same-Organization parents and retains cutoff, active, recent and foreign parents', async () => {
		const run = fixture();
		await expect(run.source.deleteExpired(ORG, CUTOFF)).resolves.toBe(2);
		expect(run.state.personnel.map((row) => row.id)).toEqual([personId(3), personId(4), personId(5), personId(6)]);
		await expect(run.source.deleteExpired(ORG, CUTOFF)).resolves.toBe(0);
	});

	it('submits all 1,001 discovered parents in one atomic mutation', async () => {
		const run = largeFixture();
		await expect(run.source.deleteExpired(ORG, CUTOFF)).resolves.toBe(1001);
		expect(run.state.rpcInputs).toHaveLength(1);
		expect(run.state.rpcInputs[0].p_candidate_ids).toHaveLength(1001);
	});

	it('counts only parents still expired when the mutation runs', async () => {
		const run = fixture();
		run.state.beforeDelete = () => {
			run.state.personnel.find((row) => row.id === personId(2))!.archived_at = null;
		};
		await expect(run.source.deleteExpired(ORG, CUTOFF)).resolves.toBe(1);
		expect(run.state.personnel.some((row) => row.id === personId(2))).toBe(true);
	});

	it('discards an incomplete discovery before mutation', async () => {
		const run = largeFixture();
		run.state.discoveryFailure = true;
		await expect(run.source.deleteExpired(ORG, CUTOFF)).rejects.toThrow('discovery unavailable');
		expect(run.state.rpcInputs).toEqual([]);
	});

	it('propagates a rejected parent deletion', async () => {
		const run = fixture();
		run.state.rpcFailure = true;
		await expect(run.source.deleteExpired(ORG, CUTOFF)).rejects.toThrow('parent deletion rejected');
		expect(run.state.personnel).toHaveLength(6);
	});

	it.each([null, -1, 1.5])('rejects an invalid deletion count %s', async (count) => {
		const run = fixture();
		run.state.countOverride = count;
		await expect(run.source.deleteExpired(ORG, CUTOFF)).rejects.toThrow(
			'Personnel retention returned no valid deletion count'
		);
	});

	it('does not mutate anything without expired parents', async () => {
		const run = fixture();
		await expect(run.source.deleteExpired(ORG, '2000-01-01T00:00:00.000Z')).resolves.toBe(0);
		expect(run.state.rpcInputs).toEqual([]);
	});
});
