import { describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelArtifactWritePort } from './artifactWrites.server';

function member(personnel: 'view' | 'operate' | 'configure', groupIds: string[] = ['alpha']) {
	return createTestAuthContext({
		orgId: 'a1300000-0000-4000-8000-000000000001',
		userId: 'a1300000-0000-4000-8000-000000000002',
		role: 'member',
		isPrivileged: false,
		capabilityMap: {
			calendar: 'none',
			personnel,
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		},
		scopeSet: { kind: 'groups', groupIds }
	});
}

function client(row: Record<string, unknown> | null = { group_id: 'alpha' }) {
	const query = {
		select: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		is: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		range: vi.fn().mockResolvedValue({ data: [{ file_size_bytes: 12 }, { file_size_bytes: 18 }], error: null }),
		maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
		single: vi.fn().mockResolvedValue({ data: { id: 'artifact-1', personnel_id: 'person-1' }, error: null })
	};
	const from = vi.fn(() => query);
	const storageBucket = {
		upload: vi.fn(async (path: string) => ({ data: { path, fullPath: `counseling-files/${path}` }, error: null })),
		remove: vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }))
	};
	const storage = { from: vi.fn(() => storageBucket) };
	return {
		from,
		query,
		storage,
		storageBucket,
		value: {
			from,
			storage,
			rpc: async (name: string, args: { p_upload_id: string }) => ({
				data: name === 'register_organization_file_upload' ? args.p_upload_id : true,
				error: null
			})
		} as unknown as SupabaseClient
	};
}

describe('Person-bound artifact writes', () => {
	it('does not open privileged persistence for a viewer, empty Group or foreign Person', async () => {
		const request = client();
		const admin = client();
		const getAdminClient = vi.fn(() => admin.value);
		const port = createSupabasePersonnelArtifactWritePort(request.value, getAdminClient);

		await expect(port.forPerson(member('view'), 'person-1')).rejects.toMatchObject({ status: 403 });
		await expect(port.forPerson(member('operate', []), 'person-1')).rejects.toMatchObject({ status: 403 });
		await expect(port.forPerson(member('operate', ['bravo']), 'person-1')).rejects.toMatchObject({ status: 403 });
		request.query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
		await expect(port.forPerson(member('operate'), 'foreign-person')).rejects.toMatchObject({ status: 404 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('binds updates and reads to the admitted Organization and Person', async () => {
		const request = client();
		const admin = client({ id: 'artifact-1', personnel_id: 'person-1' });
		const getAdminClient = vi.fn(() => admin.value);
		const writer = await createSupabasePersonnelArtifactWritePort(request.value, getAdminClient).forPerson(
			member('operate'),
			'person-1'
		);

		await writer.findFollowUp('artifact-1');
		await writer.createFollowUp({
			title: 'Follow up',
			notes: null,
			dueDate: null,
			createdBy: 'actor',
			createdAt: '2026-10-08',
			updatedAt: '2026-10-08'
		});
		await writer.patchFollowUp('artifact-1', { status: 'completed', updatedAt: '2026-10-08' });
		await writer.deleteFollowUp('artifact-1');
		expect(getAdminClient).toHaveBeenCalledTimes(1);
		expect(admin.query.insert).toHaveBeenCalledWith({
			title: 'Follow up',
			notes: null,
			due_date: null,
			created_by: 'actor',
			created_at: '2026-10-08',
			updated_at: '2026-10-08',
			status: 'open',
			organization_id: 'a1300000-0000-4000-8000-000000000001',
			personnel_id: 'person-1'
		});
		expect(admin.query.eq).toHaveBeenCalledWith('organization_id', 'a1300000-0000-4000-8000-000000000001');
		expect(admin.query.eq).toHaveBeenCalledWith('personnel_id', 'person-1');
		expect(admin.query.eq).toHaveBeenCalledWith('id', 'artifact-1');
	});

	it('rejects identity reassignment before privileged insert or update', async () => {
		const request = client();
		const admin = client();
		const writer = await createSupabasePersonnelArtifactWritePort(request.value, () => admin.value).forPerson(
			member('operate'),
			'person-1'
		);

		await expect(
			writer.createFollowUp(
				Object.assign(
					{
						title: 'Wrong Person',
						notes: null,
						dueDate: null,
						createdBy: 'actor',
						createdAt: '2026-10-08',
						updatedAt: '2026-10-08'
					},
					{ personnel_id: 'person-2' }
				)
			)
		).rejects.toMatchObject({ status: 400 });
		await expect(
			writer.patchFollowUp('artifact-1', Object.assign({ updatedAt: '2026-10-08' }, { organization_id: 'org-2' }))
		).rejects.toMatchObject({ status: 400 });
		expect(admin.from).not.toHaveBeenCalled();
	});

	it('counts only bound active documents and protects the Person file prefix', async () => {
		const request = client();
		const admin = client();
		const writer = await createSupabasePersonnelArtifactWritePort(request.value, () => admin.value).forPerson(
			member('operate'),
			'person-1'
		);

		await expect(writer.sumActiveDocumentBytes()).resolves.toBe(30);
		expect(admin.query.eq).toHaveBeenCalledWith('organization_id', 'a1300000-0000-4000-8000-000000000001');
		expect(admin.query.eq).toHaveBeenCalledWith('personnel_id', 'person-1');
		expect(admin.query.is).toHaveBeenCalledWith('archived_at', null);

		const file = new File(['pdf'], 'record.pdf', { type: 'application/pdf' });
		const path = 'a1300000-0000-4000-8000-000000000001/counseling-records/person-1/record.pdf';
		await writer.uploadFile('counseling', path, file);
		await writer.removeFile('counseling', path);
		expect(admin.storage.from).toHaveBeenCalledWith('counseling-files');
		expect(admin.storageBucket.upload).toHaveBeenCalledWith(path, file, { upsert: false });
		expect(admin.storageBucket.remove).toHaveBeenCalledWith([path]);
		await expect(
			writer.removeFile('document', 'a1300000-0000-4000-8000-000000000001/personnel/person-2/documents/x.pdf')
		).rejects.toMatchObject({
			status: 400
		});
		expect(admin.storageBucket.remove).toHaveBeenCalledTimes(1);
	});

	it('rejects an archive batch containing any out-of-Group Person before opening the service client', async () => {
		const request = client();
		request.query.range.mockResolvedValueOnce({
			data: [
				{ id: 'person-1', group_id: 'alpha' },
				{ id: 'person-2', group_id: 'bravo' }
			],
			error: null
		});
		const getAdminClient = vi.fn(() => client().value);
		const port = createSupabasePersonnelArtifactWritePort(request.value, getAdminClient);

		await expect(port.forPeople(member('configure'), ['person-1', 'person-2'], 'archive')).rejects.toMatchObject({
			status: 403
		});
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('binds batch candidate reads and updates to the admitted Person IDs', async () => {
		const request = client();
		request.query.range.mockResolvedValueOnce({ data: [{ id: 'person-1', group_id: 'alpha' }], error: null });
		const admin = client();
		admin.query.range.mockResolvedValueOnce({ data: [{ id: 'note-1', personnel_id: 'person-1' }], error: null });
		const writer = await createSupabasePersonnelArtifactWritePort(request.value, () => admin.value).forPeople(
			member('configure'),
			['person-1'],
			'archive'
		);

		await expect(writer.listLeaderNoteArchiveCandidates(null)).resolves.toEqual([
			{ id: 'note-1', personnelId: 'person-1' }
		]);
		expect(admin.query.in).toHaveBeenCalledWith('personnel_id', ['person-1']);
		expect(admin.query.is).toHaveBeenCalledWith('archived_at', null);
		await writer.setLeaderNoteArchivedAt({ id: 'note-1', personnelId: 'person-1' }, '2026-09-26');
		expect(admin.query.eq).toHaveBeenCalledWith('organization_id', 'a1300000-0000-4000-8000-000000000001');
		expect(admin.query.eq).toHaveBeenCalledWith('personnel_id', 'person-1');
		await expect(
			writer.setLeaderNoteArchivedAt({ id: 'note-2', personnelId: 'person-2' }, '2026-09-26')
		).rejects.toMatchObject({ status: 403 });
		expect(admin.query.update).toHaveBeenCalledTimes(1);
	});
});

// SDK serialization and effect state, separately from the operation lifetime
// tests and the actual SQL/RLS/native provider proofs.
describe('Person-bound registered Storage transport', () => {
	const kinds = ['document', 'counseling'] as const;
	function finite(
		kind: (typeof kinds)[number],
		fault: 'upload-lost' | 'upload-key' | 'remove-empty' | 'remove-lost' | 'remove-array-like'
	) {
		const actor = member('operate');
		const bucket = kind === 'document' ? 'personnel-documents' : 'counseling-files';
		const path =
			kind === 'document'
				? `${actor.orgId}/personnel/person-1/documents/unique.pdf`
				: `${actor.orgId}/counseling-records/person-1/unique.pdf`;
		const registrations = new Map<string, Record<string, unknown>>();
		const files = new Map<string, string>();
		const transport: typeof fetch = async (resource, init) => {
			const url = new URL(String(resource));
			if (url.pathname === '/rest/v1/personnel') return Response.json({ group_id: 'alpha' });
			if (url.pathname.includes('/rpc/')) {
				const args = JSON.parse(String(init?.body)) as Record<string, unknown>;
				if (url.pathname.endsWith('/register_organization_file_upload')) {
					registrations.set(String(args.p_upload_id), args);
					return Response.json(args.p_upload_id);
				}
				if (url.pathname.endsWith('/settle_organization_file_upload')) {
					const exact = JSON.stringify(registrations.get(String(args.p_upload_id))) === JSON.stringify(args);
					if (exact) registrations.delete(String(args.p_upload_id));
					return Response.json(exact);
				}
			}
			if (init?.method === 'POST' && url.pathname === `/storage/v1/object/${bucket}/${path}`) {
				if (![...registrations.values()].some((r) => r.p_bucket_id === bucket && r.p_object_name === path))
					return Response.json({ message: 'Unregistered upload' }, { status: 403 });
				files.set(path, await ((init.body as FormData).get('') as File).text());
				if (fault === 'upload-lost') throw new TypeError('Lost response after byte write');
				return Response.json({
					Id: 'a1300000-0000-4000-8000-000000000501',
					Key: fault === 'upload-key' ? `${bucket}/wrong.pdf` : `${bucket}/${path}`
				});
			}
			if (init?.method === 'DELETE' && url.pathname === `/storage/v1/object/${bucket}`) {
				if (fault === 'remove-lost') throw new TypeError('Removal outcome unknown');
				if (fault === 'remove-empty') return Response.json([]);
				if (fault === 'remove-array-like') return Response.json({ length: 1, 0: { name: path } });
				throw new Error('Unexpected removal');
			}
			throw new Error('Unexpected finite provider operation');
		};
		const client = createClient('http://artifact-upload.invalid', 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch: transport }
		});
		const writer = createSupabasePersonnelArtifactWritePort(client, () => client).forPerson(actor, 'person-1');
		return { writer, bucket, path, registrations, files };
	}
	it.each(kinds)(
		'retains the %s registration and written bytes after an upload response is lost or has the wrong provider key',
		async (kind) => {
			for (const fault of ['upload-lost', 'upload-key'] as const) {
				const run = finite(kind, fault);
				await expect(
					(await run.writer).uploadFile(
						kind,
						run.path,
						new File(['%PDF-1.7'], 'unique.pdf', { type: 'application/pdf' })
					)
				).rejects.toThrow();
				expect([...run.registrations.values()]).toEqual([
					expect.objectContaining({ p_bucket_id: run.bucket, p_object_name: run.path })
				]);
				expect(run.files).toEqual(new Map([[run.path, '%PDF-1.7']]));
			}
		}
	);
	it.each(kinds)('rejects unacknowledged %s compensation without releasing its registration', async (kind) => {
		for (const fault of ['remove-empty', 'remove-lost', 'remove-array-like'] as const) {
			const run = finite(kind, fault);
			const writer = await run.writer;
			await writer.uploadFile(kind, run.path, new File(['%PDF-1.7'], 'unique.pdf', { type: 'application/pdf' }));
			await expect(writer.removeFile(kind, run.path)).rejects.toThrow();
			expect(run.registrations.size).toBe(1);
			expect(run.files.get(run.path)).toBe('%PDF-1.7');
		}
	});
});
