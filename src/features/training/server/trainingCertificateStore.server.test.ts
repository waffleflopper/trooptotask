import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseTrainingCertificateStore, trainingCertificatePath } from './trainingCertificateStore.server';

const actor = { orgId: 'aa181000-0000-4000-8000-000000000101', userId: 'aa181000-0000-4000-8000-000000000001' };
const personnelId = 'aa181000-0000-4000-8000-000000000201';
const path = trainingCertificatePath(actor.orgId, personnelId, 'range card.pdf');
const objectPath = `/storage/v1/object/training-certificates/${path}`;

function provider(upload: 'stored' | 'failed' | 'stored-then-failed') {
	const registrations = new Set<string>();
	const files = new Set<string>();
	const retired = new Set<string>();
	const client = createClient('http://certificates.invalid', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (request.method === 'POST' && decodeURIComponent(url.pathname) === objectPath) {
					if (upload !== 'failed') files.add(path);
					if (upload === 'stored') return Response.json({ Key: `training-certificates/${path}`, Id: 'object-1' });
					return Response.json({ message: 'Gateway timeout' }, { status: 504 });
				}
				if (request.method === 'DELETE' && url.pathname === '/storage/v1/object/training-certificates') {
					const requested = (await request.json()).prefixes as string[];
					return Response.json(requested.filter((key) => files.delete(key)).map((name) => ({ name })));
				}
				const args = JSON.parse(await request.text()) as Record<string, string>;
				switch (url.pathname) {
					case '/rest/v1/rpc/register_organization_file_upload':
						registrations.add(args.p_upload_id);
						return Response.json(args.p_upload_id);
					case '/rest/v1/rpc/settle_organization_file_upload':
						return Response.json(registrations.delete(args.p_upload_id));
					case '/rest/v1/rpc/reconcile_personnel_file_attachment':
						retired.add(args.p_object_name);
						return Response.json(null);
					case '/rest/v1/rpc/complete_organization_file_retirements':
						return Response.json(true);
				}
				throw new Error(`Unexpected provider request ${request.method} ${url.pathname}`);
			}
		}
	});
	const store = createSupabaseTrainingCertificateStore(client, () => client, actor);
	return { store, registrations, files, retired };
}

const pdf = () => new File([new TextEncoder().encode('%PDF-1.7\n')], 'range card.pdf', { type: 'application/pdf' });

describe('training certificate uploads', () => {
	it('keeps the registration open for the caller to settle once the record is written', async () => {
		const run = provider('stored');

		await run.store.upload(personnelId, path, pdf());

		expect(run.registrations.size).toBe(1);
		expect([...run.files]).toEqual([path]);
	});

	it.each(['failed', 'stored-then-failed'] as const)(
		'retires the key, removes any stored bytes and settles the registration when the upload is %s',
		async (outcome) => {
			const run = provider(outcome);

			await expect(run.store.upload(personnelId, path, pdf())).rejects.toThrow('Storage upload failed');

			expect(run.registrations.size).toBe(0);
			expect([...run.retired]).toEqual([path]);
			expect(run.files.size).toBe(0);
		}
	);
});
