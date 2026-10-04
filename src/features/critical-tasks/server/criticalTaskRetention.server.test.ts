import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseCriticalTaskRetentionSource } from './criticalTaskRetention.server';

const ORG = 'd2534000-0000-4000-8000-000000000001';
const FOREIGN_ORG = 'd2534000-0000-4000-8000-000000000002';
const CUTOFF = '2025-05-30T12:00:00.000Z';

function fixture(response?: { payload: unknown; status?: number }) {
	const pending = new Map([
		[ORG, new Set(Array.from({ length: 1001 }, (_, index) => `expired-${index}`))],
		[FOREIGN_ORG, new Set(['foreign-expired'])]
	]);
	const requests: { method: string; url: string; payload: unknown }[] = [];
	const client = createClient('http://127.0.0.1:9', 'synthetic-ct-retention-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const payload = JSON.parse(String(init?.body)) as { p_org_id: string; p_cutoff: string };
				requests.push({ method: init?.method ?? 'GET', url: url.href, payload });
				if (url.pathname !== '/rest/v1/rpc/delete_expired_unreferenced_critical_tasks' || init?.method !== 'POST')
					throw new Error('Unexpected CT retention provider operation');
				if (response) return Response.json(response.payload, { status: response.status ?? 200 });
				if (payload.p_cutoff !== CUTOFF) return Response.json({ message: 'Unexpected cutoff' }, { status: 400 });
				const rows = pending.get(payload.p_org_id);
				if (!rows) return Response.json({ message: 'Unexpected Organization' }, { status: 400 });
				const deletedCount = rows.size;
				rows.clear();
				return Response.json(deletedCount);
			}
		}
	});
	return { pending, requests, source: createSupabaseCriticalTaskRetentionSource(client) };
}

describe('Critical Tasks retention provider', () => {
	it('uses the fixed Organization/cutoff POST contract and preserves an uncapped scalar count across replay', async () => {
		const run = fixture();
		expect(await run.source.deleteExpired(ORG, CUTOFF)).toBe(1001);
		expect(await run.source.deleteExpired(ORG, CUTOFF)).toBe(0);
		expect(run.pending.get(ORG)?.size).toBe(0);
		expect([...run.pending.get(FOREIGN_ORG)!]).toEqual(['foreign-expired']);
		expect(run.requests).toEqual([
			{
				method: 'POST',
				url: 'http://127.0.0.1:9/rest/v1/rpc/delete_expired_unreferenced_critical_tasks',
				payload: { p_org_id: ORG, p_cutoff: CUTOFF }
			},
			{
				method: 'POST',
				url: 'http://127.0.0.1:9/rest/v1/rpc/delete_expired_unreferenced_critical_tasks',
				payload: { p_org_id: ORG, p_cutoff: CUTOFF }
			}
		]);
	});

	it('propagates a database rejection without reporting a deletion count', async () => {
		const run = fixture({
			payload: { code: '25001', message: 'Critical task retention requires READ COMMITTED' },
			status: 400
		});
		await expect(run.source.deleteExpired(ORG, CUTOFF)).rejects.toThrow(
			'Critical task retention requires READ COMMITTED'
		);
		expect(run.pending.get(ORG)?.size).toBe(1001);
	});

	it.each([null, -1, 1.5, '1001', [], {}])('rejects an invalid provider count %j', async (payload) => {
		const run = fixture({ payload });
		await expect(run.source.deleteExpired(ORG, CUTOFF)).rejects.toThrow(
			'Critical task retention returned no valid deletion count'
		);
	});
});
