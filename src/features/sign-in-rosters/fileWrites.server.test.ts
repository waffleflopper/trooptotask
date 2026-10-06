import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabaseStorageAdapter } from '$lib/server/adapters/supabaseStorage';
import { createSupabaseSignInRosterFileWritePort } from './fileWrites.server';
import { deleteSignInRoster, removeSignedScan, uploadSignedScan } from './records.server';
import type { SignInRosterPersistence } from './rosterPersistence.server';

const orgId = 'ab181000-0000-4000-8000-000000000101';
const userId = 'ab181000-0000-4000-8000-000000000001';
const rosterId = 'ab181000-0000-4000-8000-000000000301';
const oldPath = `${orgId}/sign-in-rosters/${rosterId}/old.pdf`;
const file = new File(['%PDF-1.7'], 'signed.pdf', { type: 'application/pdf' });
type Fault =
	| 'none'
	| 'fresh-access'
	| 'upload-response'
	| 'upload-key'
	| 'attachment'
	| 'compensation'
	| 'compensation-empty'
	| 'old-removal'
	| 'old-missing'
	| 'old-hidden'
	| 'old-malformed'
	| 'old-array-like'
	| 'old-name'
	| 'old-duplicate'
	| 'info-invalid'
	| 'info-bucket'
	| 'info-unavailable';

// Real SDK requests against a finite provider. Stored bytes and the registration
// are observable outcomes; actual SQL/RLS and native UI remain separate proof.
function fixture(fault: Fault) {
	const registrations = new Map<string, Record<string, unknown>>();
	const files = new Map<string, string>(fault === 'old-missing' ? [] : [[oldPath, 'old signed bytes']]);
	let signedPath: string | null = oldPath;
	let present = true;
	const audits: string[] = [];
	const actor = createTestAuthContext({ orgId, userId });
	const transport: typeof fetch = async (resource, init) => {
		const url = new URL(String(resource));
		const ordinary = url.hostname === 'ordinary.invalid';
		const method = init?.method ?? 'GET';
		if (url.pathname === '/rest/v1/sign_in_rosters' && ordinary && method === 'GET') {
			if (url.searchParams.get('id') !== `eq.${rosterId}` || url.searchParams.get('organization_id') !== `eq.${orgId}`)
				return Response.json(null);
			return Response.json({ scope_group_ids: [] });
		}
		if (url.pathname.endsWith('/rpc/sensitive_file_object_is_writable') && ordinary)
			return Response.json(fault !== 'fresh-access');
		if (url.pathname === `/storage/v1/object/info/counseling-files/${oldPath}` && !ordinary && method === 'GET') {
			if (fault === 'info-invalid')
				return Response.json({ statusCode: '400', message: 'Invalid request' }, { status: 400 });
			if (fault === 'info-bucket')
				return Response.json({ statusCode: '404', message: 'Bucket not found' }, { status: 400 });
			if (fault === 'info-unavailable')
				return Response.json({ statusCode: '503', message: 'Unavailable' }, { status: 503 });
			if (!files.has(oldPath))
				return Response.json({ statusCode: '404', code: 'NoSuchKey', message: 'Object not found' }, { status: 400 });
			return Response.json({ name: oldPath, size: files.get(oldPath)!.length });
		}
		if (url.pathname.includes('/rpc/') && !ordinary) {
			const args = JSON.parse(String(init?.body)) as Record<string, unknown>;
			if (url.pathname.endsWith('/register_organization_file_upload')) {
				registrations.set(String(args.p_upload_id), args);
				return Response.json(args.p_upload_id);
			}
			if (url.pathname.endsWith('/settle_organization_file_upload')) {
				const active = registrations.get(String(args.p_upload_id));
				const exact = JSON.stringify(active) === JSON.stringify(args);
				if (exact) registrations.delete(String(args.p_upload_id));
				return Response.json(exact);
			}
		}
		if (url.pathname.startsWith('/storage/v1/object/counseling-files/')) {
			const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/counseling-files/'.length));
			if (ordinary || method !== 'POST') throw new Error('Byte upload needs the bound server provider');
			if (![...registrations.values()].some((r) => r.p_object_name === path && r.p_bucket_id === 'counseling-files'))
				return Response.json({ message: 'Unregistered upload' }, { status: 403 });
			const upload = (init?.body as FormData).get('') as File;
			files.set(path, await upload.text());
			if (fault === 'upload-response') return Response.json({ message: 'Response lost' }, { status: 503 });
			return Response.json({
				Id: 'ab181000-0000-4000-8000-000000000501',
				Key: fault === 'upload-key' ? 'counseling-files/other.pdf' : `counseling-files/${path}`
			});
		}
		if (url.pathname === '/storage/v1/object/counseling-files' && method === 'DELETE') {
			if (!ordinary) throw new Error('Removal must retain ordinary account permissions');
			const paths = (JSON.parse(String(init?.body)) as { prefixes: string[] }).prefixes;
			if (fault === 'compensation' || (fault === 'old-removal' && paths.includes(oldPath)))
				return Response.json({ message: 'Removal denied' }, { status: 403 });
			if (paths.includes(oldPath) && ['old-hidden', 'info-invalid', 'info-bucket', 'info-unavailable'].includes(fault))
				return Response.json([]);
			if (paths.includes(oldPath) && fault === 'old-malformed') return Response.json({ name: oldPath });
			if (paths.includes(oldPath) && fault === 'old-array-like')
				return Response.json({ length: 1, 0: { name: oldPath } });
			if (paths.includes(oldPath) && fault === 'old-name') return Response.json([{ name: 'other/scan.pdf' }]);
			if (paths.includes(oldPath) && fault === 'old-duplicate')
				return Response.json([{ name: oldPath }, { name: oldPath }]);
			if (fault === 'compensation-empty') {
				for (const path of paths) files.delete(path);
				return Response.json([]);
			}
			return Response.json(paths.filter((path) => files.delete(path)).map((name) => ({ name })));
		}
		throw new Error(`Unexpected provider request: ${method} ${url.pathname}`);
	};
	const client = (origin: string) =>
		createClient(origin, 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch: transport }
		});
	const fileWrites = createSupabaseSignInRosterFileWritePort(client('http://ordinary.invalid'), () =>
		client('http://service.invalid')
	);
	const persistence: SignInRosterPersistence = {
		async list() {
			throw new Error('Unused list');
		},
		async create() {
			throw new Error('Unused create');
		},
		async delete() {
			present = false;
		},
		async find() {
			return present
				? {
						id: rosterId,
						title: 'Known roster',
						rosterDate: null,
						blankDate: false,
						separateByGroup: false,
						sortBy: 'alphabetical',
						personnelSnapshot: [],
						filterConfig: null,
						signedFilePath: signedPath,
						createdBy: userId,
						createdAt: '2026-01-02T03:04:05.123456Z'
					}
				: null;
		},
		async setSignedFilePath(_id: string, path: string | null) {
			if (path !== null) expect(registrations.size).toBe(1);
			if (['attachment', 'compensation', 'compensation-empty'].includes(fault)) throw new Error('Attachment rejected');
			signedPath = path;
		}
	};
	const context = {
		actor,
		orgId,
		fileWrites,
		persistence,
		audit: {
			log(event: { action: string }) {
				audits.push(event.action);
			}
		},
		storage: createSupabaseStorageAdapter(client('http://ordinary.invalid'))
	};
	return { context, registrations, files, audits, present: () => present, signedPath: () => signedPath };
}

describe.each([
	['unlink', removeSignedScan],
	['delete roster', deleteSignInRoster]
] as const)('admitted roster %s through actual SDK removal', (operation, remove) => {
	it.each([
		'old-hidden',
		'info-invalid',
		'info-bucket',
		'info-unavailable',
		'old-malformed',
		'old-array-like',
		'old-name',
		'old-duplicate'
	] as const)('preserves metadata and known bytes when removal is unconfirmed: %s', async (fault) => {
		const run = fixture(fault);
		await expect(remove(run.context, rosterId)).rejects.toThrow();
		expect(run.present()).toBe(true);
		expect(run.signedPath()).toBe(oldPath);
		expect(run.files).toEqual(new Map([[oldPath, 'old signed bytes']]));
		expect(run.audits).toEqual([]);
	});
	it('completes when the admitted exact key is already absent', async () => {
		const run = fixture('old-missing');
		await remove(run.context, rosterId);
		expect(run.files.size).toBe(0);
		if (operation === 'unlink') {
			expect(run.present()).toBe(true);
			expect(run.signedPath()).toBeNull();
		} else {
			expect(run.present()).toBe(false);
			expect(run.audits).toEqual(['sign_in_roster.deleted']);
		}
	});
	it('rechecks current Training permission before file or metadata effects', async () => {
		const run = fixture('none');
		run.context.actor = {
			...run.context.actor,
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: { ...run.context.actor.capabilityMap, training: 'view' }
		};
		await expect(remove(run.context, rosterId)).rejects.toMatchObject({ status: 403 });
		expect(run.present()).toBe(true);
		expect(run.signedPath()).toBe(oldPath);
		expect(run.files).toEqual(new Map([[oldPath, 'old signed bytes']]));
		expect(run.audits).toEqual([]);
	});
});

describe('registered roster upload provider and attachment', () => {
	it('keeps the registration through attachment and ordinary replacement cleanup', async () => {
		const run = fixture('none');
		const result = await uploadSignedScan(run.context, rosterId, file);
		expect(run.signedPath()).toBe(result.filePath);
		expect(run.files).toEqual(new Map([[result.filePath, '%PDF-1.7']]));
		expect(run.registrations.size).toBe(0);
	});
	it('replaces a saved scan when the server provider confirms its old object is already absent', async () => {
		const run = fixture('old-missing');
		const result = await uploadSignedScan(run.context, rosterId, file);
		expect(run.signedPath()).toBe(result.filePath);
		expect(run.files).toEqual(new Map([[result.filePath, '%PDF-1.7']]));
		expect(run.registrations.size).toBe(0);
	});
	it.each(['old-hidden', 'info-invalid', 'info-bucket', 'info-unavailable'] as const)(
		'refuses unconfirmed previous-object absence and compensates the replacement for %s',
		async (fault) => {
			const run = fixture(fault);
			await expect(uploadSignedScan(run.context, rosterId, file)).rejects.toThrow(
				'Scan file removal could not be confirmed'
			);
			expect(run.signedPath()).toBe(oldPath);
			expect(run.files).toEqual(new Map([[oldPath, 'old signed bytes']]));
			expect(run.registrations.size).toBe(0);
		}
	);
	it('retains registration when new-upload compensation returns an empty acknowledgement', async () => {
		const run = fixture('compensation-empty');
		await expect(uploadSignedScan(run.context, rosterId, file)).rejects.toThrow('Attachment rejected');
		expect(run.signedPath()).toBe(oldPath);
		expect(run.files).toEqual(new Map([[oldPath, 'old signed bytes']]));
		expect(run.registrations.size).toBe(1);
	});
	it('rechecks fresh ordinary Training/Group admission before privileged bytes', async () => {
		const run = fixture('fresh-access');
		await expect(uploadSignedScan(run.context, rosterId, file)).rejects.toMatchObject({ status: 403 });
		expect(run.files).toEqual(new Map([[oldPath, 'old signed bytes']]));
		expect(run.signedPath()).toBe(oldPath);
		expect(run.registrations.size).toBe(0);
	});
	it.each(['upload-response', 'upload-key', 'compensation'] as const)(
		'retains the unresolved registration for %s',
		async (fault) => {
			const run = fixture(fault);
			await expect(uploadSignedScan(run.context, rosterId, file)).rejects.toThrow();
			expect(run.registrations.size).toBe(1);
			const path = [...run.registrations.values()][0].p_object_name as string;
			expect(run.files.get(path)).toBe('%PDF-1.7');
			expect(run.files.get(oldPath)).toBe('old signed bytes');
			expect(run.signedPath()).toBe(oldPath);
		}
	);
	it.each(['attachment', 'old-removal'] as const)(
		'settles only after exact new-byte compensation and preserves the original for %s',
		async (fault) => {
			const run = fixture(fault);
			await expect(uploadSignedScan(run.context, rosterId, file)).rejects.toThrow();
			expect(run.registrations.size).toBe(0);
			expect(run.files).toEqual(new Map([[oldPath, 'old signed bytes']]));
			expect(run.signedPath()).toBe(oldPath);
		}
	);
});
