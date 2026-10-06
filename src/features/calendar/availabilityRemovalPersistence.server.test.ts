import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseCalendarAvailabilityRemovalPort } from './availabilityRemovalPersistence.server';
import { deleteAvailabilityBatch } from './availabilityBatch.server';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';

const ORG = '00000000-0000-4000-8000-000000000001';
const IDS = Array.from({ length: 500 }, (_, i) => `00000000-0000-4000-8001-${String(i).padStart(12, '0')}`);
const KEY = 'synthetic-ordinary-client';
const MAX_REFERENCE_URL_BYTES = 8192;

function fixture(options: { failedRead?: number; reply?: unknown; error?: { code: string; message: string } } = {}) {
	const requests: Request[] = [];
	let reads = 0;
	const client = createClient('http://ordinary.invalid', KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				requests.push(request.clone());
				const url = new URL(request.url);
				if (url.origin !== 'http://ordinary.invalid' || request.headers.get('authorization') !== `Bearer ${KEY}`)
					throw new Error('Unexpected client authority');
				if (request.method === 'GET' && url.pathname === '/rest/v1/availability_entries') {
					reads++;
					if (reads === options.failedRead) return Response.json({ message: 'Reference unavailable' }, { status: 500 });
					if (
						url.searchParams.get('organization_id') !== `eq.${ORG}` ||
						url.searchParams.get('select') !== 'personnel_id'
					)
						throw new Error('Unexpected reference authority');
					const ids = url.searchParams.get('id')?.slice(4, -1).split(',') ?? [];
					if (new TextEncoder().encode(request.url).length > MAX_REFERENCE_URL_BYTES)
						return Response.json({ message: 'URI Too Long' }, { status: 414 });
					return Response.json(ids.map((id) => ({ personnel_id: `person-${IDS.indexOf(id)}` })));
				}
				if (request.method === 'POST' && url.pathname === '/rest/v1/rpc/delete_availability_entries') {
					if (options.error) return Response.json(options.error, { status: 403 });
					return Response.json('reply' in options ? options.reply : 500);
				}
				throw new Error('Unexpected removal transport');
			}
		}
	});
	return { requests, port: createSupabaseCalendarAvailabilityRemovalPort(client, ORG) };
}

describe('ordinary Calendar availability removal transport', () => {
	it('collects all 500 references without an oversized URL, then sends one fixed-path mutation body', async () => {
		const { port, requests } = fixture();
		const people = await port.findPersonnelIds([...IDS, IDS[0]]);
		expect(people).toHaveLength(500);
		expect(people[0]).toBe('person-0');
		expect(people[499]).toBe('person-499');
		await expect(port.deleteIds(IDS)).resolves.toBe(500);
		const reads = requests.filter((r) => r.method === 'GET');
		expect(reads.every((r) => new TextEncoder().encode(r.url).length <= MAX_REFERENCE_URL_BYTES)).toBe(true);
		expect(reads.flatMap((r) => new URL(r.url).searchParams.get('id')?.slice(4, -1).split(',') ?? []).sort()).toEqual(
			[...IDS].sort()
		);
		const mutations = requests.filter((r) => r.method === 'POST');
		expect(mutations).toHaveLength(1);
		const mutation = mutations[0];
		expect(requests.at(-1)).toBe(mutation);
		expect(mutation.url).toBe('http://ordinary.invalid/rest/v1/rpc/delete_availability_entries');
		expect(await mutation.json()).toEqual({ p_organization_id: ORG, p_ids: IDS });
	});

	it('does not mutate or publish a success audit after a later reference request fails', async () => {
		const { port, requests } = fixture({ failedRead: 2 });
		const ctx = createWritePortsContext();
		await expect(deleteAvailabilityBatch({ ...ctx, availabilityRemoval: port }, { ids: IDS })).rejects.toThrow(
			'Reference unavailable'
		);
		expect(requests.every((r) => r.method === 'GET')).toBe(true);
		expect(ctx.audit.events).toEqual([]);
	});

	it.each([null, '1', -1, 0.5, 3])('rejects malformed acknowledgment %s without retry or fallback', async (reply) => {
		const { port, requests } = fixture({ reply });
		const ctx = createWritePortsContext();
		await expect(
			deleteAvailabilityBatch(
				{ ...ctx, availabilityRemoval: { ...port, findPersonnelIds: async () => [] } },
				{ ids: [IDS[0], IDS[1]] }
			)
		).rejects.toThrow('Invalid Calendar removal acknowledgment');
		expect(requests.map((r) => r.method)).toEqual(['POST']);
		expect(ctx.audit.events).toEqual([]);
	});

	it.each([
		[{ code: '42501', message: 'Private provider detail' }, 403, 'You do not have access to that Calendar scope'],
		[{ code: '22023', message: 'Private provider detail' }, 400, 'Provide between 1 and 500 availability IDs']
	] as const)('maps a rejected mutation to a safe caller error', async (error, status, message) => {
		const { port, requests } = fixture({ error });
		await expect(port.deleteIds([IDS[0]])).rejects.toMatchObject({ status, message });
		expect(requests.map((r) => r.method)).toEqual(['POST']);
	});
});
