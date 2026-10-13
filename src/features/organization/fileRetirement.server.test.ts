import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { drainRetiredOrganizationFiles } from './fileRetirement.server';

interface Retirement {
	bucket: string;
	name: string;
	state: 'pending' | 'removed';
	attemptedAt: number | null;
}

function committedSqlModel(keys: Array<{ bucket: string; name: string; stored?: boolean }>) {
	let clock = 0;
	const retirements: Retirement[] = keys.map(({ bucket, name }) => ({
		bucket,
		name,
		state: 'pending',
		attemptedAt: null
	}));
	const objects = new Set(keys.filter((key) => key.stored !== false).map((key) => `${key.bucket}/${key.name}`));
	const state = { unavailableKeys: new Set<string>(), completionUnavailable: false };
	const transport: typeof fetch = async (resource, init) => {
		const url = new URL(String(resource));
		const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
		if (url.pathname === '/rest/v1/rpc/list_pending_organization_file_retirements') {
			const page = retirements
				.filter((retirement) => retirement.state === 'pending')
				.sort((a, b) => (a.attemptedAt ?? -1) - (b.attemptedAt ?? -1))
				.slice(0, body.p_limit as number);
			for (const retirement of page) retirement.attemptedAt = ++clock;
			return Response.json(page.map(({ bucket, name }) => ({ bucket_id: bucket, object_name: name })));
		}
		if (url.pathname === '/rest/v1/rpc/complete_organization_file_retirements') {
			if (state.completionUnavailable) return Response.json({ message: 'Unavailable' }, { status: 503 });
			const names = new Set(body.p_object_names as string[]);
			let completed = 0;
			for (const retirement of retirements) {
				if (retirement.bucket === body.p_bucket_id && names.has(retirement.name) && retirement.state === 'pending') {
					retirement.state = 'removed';
					completed++;
				}
			}
			return Response.json(completed);
		}
		const bucket = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)$/)?.[1];
		if (init?.method === 'DELETE' && bucket) {
			const keys = (body.prefixes as string[]).map((name) => `${bucket}/${name}`);
			if (keys.some((key) => state.unavailableKeys.has(key)))
				return Response.json({ message: 'Unavailable' }, { status: 503 });
			return Response.json(
				(body.prefixes as string[]).filter((name) => objects.delete(`${bucket}/${name}`)).map((name) => ({ name }))
			);
		}
		throw new Error(`Unexpected provider request ${init?.method} ${url.pathname}`);
	};
	const admin = createClient('http://file-retirement.invalid', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch: transport }
	});
	const stateOf = (bucket: string, name: string) =>
		retirements.find((retirement) => retirement.bucket === bucket && retirement.name === name)?.state;
	return {
		admin,
		state,
		objects,
		stateOf,
		pendingCount: () => retirements.filter((r) => r.state === 'pending').length
	};
}

describe('scheduled retired file drain', () => {
	it('removes every pending key across more than one page', async () => {
		const model = committedSqlModel(
			Array.from({ length: 150 }, (_, index) => ({
				bucket: index % 2 ? 'counseling-files' : 'personnel-documents',
				name: `org-1/key-${index}.pdf`
			}))
		);

		await expect(drainRetiredOrganizationFiles(model.admin)).resolves.toEqual({ removed: 150, failed: 0 });
		expect(model.pendingCount()).toBe(0);
		expect(model.objects.size).toBe(0);
	});

	it('removes the rest of a page when one key cannot be removed', async () => {
		const model = committedSqlModel([
			{ bucket: 'personnel-documents', name: 'org-1/first.pdf' },
			{ bucket: 'personnel-documents', name: 'org-1/unavailable.pdf' },
			{ bucket: 'personnel-documents', name: 'org-1/last.pdf' }
		]);
		model.state.unavailableKeys.add('personnel-documents/org-1/unavailable.pdf');

		await expect(drainRetiredOrganizationFiles(model.admin)).resolves.toEqual({ removed: 2, failed: 1 });
		expect([
			model.stateOf('personnel-documents', 'org-1/first.pdf'),
			model.stateOf('personnel-documents', 'org-1/unavailable.pdf'),
			model.stateOf('personnel-documents', 'org-1/last.pdf')
		]).toEqual(['removed', 'pending', 'removed']);
		expect([...model.objects]).toEqual(['personnel-documents/org-1/unavailable.pdf']);
	});

	it('completes a key whose bytes are already absent', async () => {
		const model = committedSqlModel([{ bucket: 'counseling-files', name: 'org-1/absent.pdf', stored: false }]);

		await expect(drainRetiredOrganizationFiles(model.admin)).resolves.toEqual({ removed: 1, failed: 0 });
		expect(model.stateOf('counseling-files', 'org-1/absent.pdf')).toBe('removed');
	});

	it('keeps a key pending when completion fails and finishes it on the next pass', async () => {
		const model = committedSqlModel([{ bucket: 'personnel-documents', name: 'org-1/retry.pdf' }]);
		model.state.completionUnavailable = true;

		await expect(drainRetiredOrganizationFiles(model.admin)).resolves.toEqual({ removed: 0, failed: 1 });
		expect(model.stateOf('personnel-documents', 'org-1/retry.pdf')).toBe('pending');
		expect(model.objects.size).toBe(0);

		model.state.completionUnavailable = false;
		await expect(drainRetiredOrganizationFiles(model.admin)).resolves.toEqual({ removed: 1, failed: 0 });
		expect(model.stateOf('personnel-documents', 'org-1/retry.pdf')).toBe('removed');
	});

	it('does not complete a key through another bucket', async () => {
		const model = committedSqlModel([
			{ bucket: 'personnel-documents', name: 'org-1/same.pdf' },
			{ bucket: 'counseling-files', name: 'org-1/same.pdf' }
		]);
		model.state.unavailableKeys.add('counseling-files/org-1/same.pdf');

		await expect(drainRetiredOrganizationFiles(model.admin)).resolves.toEqual({ removed: 1, failed: 1 });
		expect([
			model.stateOf('personnel-documents', 'org-1/same.pdf'),
			model.stateOf('counseling-files', 'org-1/same.pdf')
		]).toEqual(['removed', 'pending']);
	});
});
