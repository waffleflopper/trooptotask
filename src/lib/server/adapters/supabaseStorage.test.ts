import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseStorageAdapter } from './supabaseStorage';

const bucket = 'counseling-files';
const path = 'org/scan.pdf';

function signing(reply: unknown, origin = 'https://storage.invalid') {
	const client = createClient(origin, 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch: async () => Response.json(reply) }
	});
	return createSupabaseStorageAdapter(client);
}

function removal(paths: string[], reply?: (requested: string[], batch: number) => unknown) {
	const files = new Set(paths);
	const batches: string[][] = [];
	const client = createClient('https://storage.invalid', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				if (request.method !== 'DELETE' || new URL(request.url).pathname !== '/storage/v1/object/counseling-files')
					throw new Error('Unexpected finite Storage request');
				const requested = (await request.json()).prefixes as string[];
				batches.push(requested);
				if (requested.length > 1000) return Response.json({ message: 'Too many prefixes' }, { status: 413 });
				const response = reply?.(requested, batches.length);
				if (response instanceof Response) return response;
				if (response !== undefined) return Response.json(response);
				return Response.json(requested.filter((key) => files.delete(key)).map((name) => ({ name })));
			}
		}
	});
	return { storage: createSupabaseStorageAdapter(client), files, batches };
}

describe('Storage provider responses through the real SDK', () => {
	it('returns the requested signed object with its opaque token', async () => {
		await expect(
			signing({ signedURL: '/object/sign/counseling-files/org/scan.pdf?token=opaque' }).createSignedUrl(
				bucket,
				path,
				300
			)
		).resolves.toBe('https://storage.invalid/storage/v1/object/sign/counseling-files/org/scan.pdf?token=opaque');
	});
	it('preserves local ports, self-host route prefixes and encoded object names', async () => {
		const storage = signing(
			{ signedURL: '/object/sign/counseling-files/org/scan café literal%20.pdf?token=opaque' },
			'http://127.0.0.1:1234/proxy/object/public/root'
		);
		await expect(storage.createSignedUrl(bucket, 'org/scan café literal%20.pdf', 300)).resolves.toBe(
			'http://127.0.0.1:1234/proxy/object/public/root/storage/v1/object/sign/counseling-files/org/scan%20caf%C3%A9%20literal%2520.pdf?token=opaque'
		);
	});
	it.each([
		{},
		{ signedURL: '' },
		{ signedURL: '/object/sign/counseling-files/org/scan.pdf' },
		{ signedURL: '/object/sign/counseling-files/org/scan.pdf?token=' },
		{ signedURL: '/object/sign/counseling-files/org/scan.pdf?token= ' },
		{ signedURL: '/object/sign/counseling-files/org/scan.pdf?token=one&token=two' },
		{ signedURL: '/object/sign/other-bucket/org/scan.pdf?token=opaque' },
		{ signedURL: '/object/sign/counseling-files/other/scan.pdf?token=opaque' },
		{ signedURL: '/object/sign/counseling-files/org/scan.pdf?token=opaque#fragment' },
		{ signedURL: 'https://foreign.invalid/object/sign/counseling-files/org/scan.pdf?token=opaque' }
	])('rejects malformed or mismatched signing reply %j', async (reply) => {
		await expect(signing(reply).createSignedUrl(bucket, path, 300)).rejects.toThrow();
	});
	it('permits service-role deletion of present and already-missing keys', async () => {
		const run = removal([path]);
		await run.storage.remove(bucket, [path, 'org/missing.pdf']);
		await run.storage.remove(bucket, [path]);
		expect(run.files.size).toBe(0);
	});
	it.each([
		{ reply: null },
		{ reply: {} },
		{ reply: 'deleted' },
		{ reply: [null] },
		{ reply: [{}] },
		{ reply: [{ name: 1 }] },
		{ reply: [{ name: 'other/key.pdf' }] },
		{ reply: [{ name: path }, { name: path }] }
	])('rejects an invalid deletion acknowledgment %j', async ({ reply }) => {
		const run = removal([path], () => reply);
		await expect(run.storage.remove(bucket, [path])).rejects.toThrow();
		expect(run.files.has(path)).toBe(true);
	});
	it('removes 1001 unique keys within the provider limit and leaves unrelated bytes', async () => {
		const paths = Array.from({ length: 1001 }, (_, index) => `org/${index}.pdf`);
		const run = removal([...paths, 'other/sentinel.pdf']);
		await run.storage.remove(bucket, [...paths, paths[0]]);
		expect([...run.files]).toEqual(['other/sentinel.pdf']);
		expect(run.batches.every((batch) => batch.length <= 1000)).toBe(true);
	});
	it('does not accept an acknowledgment for a key outside the current request batch', async () => {
		const paths = Array.from({ length: 1001 }, (_, index) => `org/${index}.pdf`);
		const run = removal(paths, () => [{ name: paths[1000] }]);
		await expect(run.storage.remove(bucket, paths)).rejects.toThrow();
		expect(run.files.size).toBe(1001);
	});
	it('reports a later batch failure with the first batch effects retained', async () => {
		const paths = Array.from({ length: 1001 }, (_, index) => `org/${index}.pdf`);
		const run = removal(paths, (_keys, batch) =>
			batch === 2 ? Response.json({ message: 'Unavailable' }, { status: 503 }) : undefined
		);
		await expect(run.storage.remove(bucket, paths)).rejects.toThrow('Unavailable');
		expect([...run.files]).toEqual(['org/1000.pdf']);
	});
	it('avoids a provider mutation for an empty manifest', async () => {
		const run = removal([path]);
		await run.storage.remove(bucket, []);
		expect(run.batches).toEqual([]);
		expect([...run.files]).toEqual([path]);
	});
});
