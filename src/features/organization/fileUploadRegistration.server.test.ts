import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { registerOrganizationFileUpload } from './fileUploadRegistration.server';

const input = {
	orgId: 'aa181000-0000-4000-8000-000000000101',
	userId: 'aa181000-0000-4000-8000-000000000001',
	bucket: 'personnel-documents' as const,
	path: 'aa181000-0000-4000-8000-000000000101/personnel/known/documents/unique.pdf'
};
function provider(
	fault?: 'admission-error' | 'admission-ack' | 'settlement-error' | 'settlement-ack' | 'settlement-response'
) {
	let binding: Record<string, unknown> | null = null;
	const client = createClient('http://upload-registration.invalid', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (resource, init) => {
				const url = new URL(String(resource));
				if (init?.method !== 'POST') throw new Error('Unexpected provider operation');
				const args = JSON.parse(String(init.body)) as Record<string, unknown>;
				if (url.pathname === '/rest/v1/rpc/register_organization_file_upload') {
					if (binding) return Response.json({ message: 'Duplicate key', code: '23505' }, { status: 409 });
					// Admission can commit before its response is lost or malformed.
					binding = args;
					if (fault === 'admission-error') return Response.json({ message: 'Response unavailable' }, { status: 503 });
					return Response.json(fault === 'admission-ack' ? 'aa181000-0000-4000-8000-000000000999' : args.p_upload_id);
				}
				if (url.pathname === '/rest/v1/rpc/settle_organization_file_upload') {
					if (fault === 'settlement-error')
						return Response.json({ message: 'Completion unavailable' }, { status: 503 });
					if (fault === 'settlement-ack') return Response.json(false);
					const matches = JSON.stringify(args) === JSON.stringify(binding);
					if (matches) binding = null;
					if (fault === 'settlement-response')
						return Response.json({ message: 'Response lost after completion' }, { status: 503 });
					return Response.json(matches);
				}
				throw new Error('Unexpected provider resource');
			}
		}
	});
	return { client, binding: () => binding };
}

describe('Organization file registration SDK protocol', () => {
	it('keeps the exact Organization/actor/bucket/key registration until explicit completion', async () => {
		const run = provider();
		const registration = await registerOrganizationFileUpload(run.client, input);
		expect(run.binding()).toMatchObject({
			p_organization_id: input.orgId,
			p_actor_id: input.userId,
			p_bucket_id: input.bucket,
			p_object_name: input.path
		});
		expect(run.binding()?.p_upload_id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
		await registration.complete();
		expect(run.binding()).toBeNull();
	});
	it.each(['admission-error', 'admission-ack'] as const)(
		'refuses an unconfirmed %s without releasing a possibly committed registration',
		async (fault) => {
			const run = provider(fault);
			await expect(registerOrganizationFileUpload(run.client, input)).rejects.toThrow();
			expect(run.binding()?.p_object_name).toBe(input.path);
		}
	);
	it.each(['settlement-error', 'settlement-ack'] as const)('does not report completion for %s', async (fault) => {
		const run = provider(fault);
		const registration = await registerOrganizationFileUpload(run.client, input);
		await expect(registration.complete()).rejects.toThrow();
		expect(run.binding()?.p_object_name).toBe(input.path);
	});
	it('reports a lost settlement response even when its safe completion already committed', async () => {
		const run = provider('settlement-response');
		const registration = await registerOrganizationFileUpload(run.client, input);
		await expect(registration.complete()).rejects.toThrow();
		expect(run.binding()).toBeNull();
	});
});
