import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelArtifactWritePort } from './artifactWrites.server';

function member(personnel: 'view' | 'operate' | 'configure', groupIds: string[] = ['alpha']) {
	return createTestAuthContext({
		orgId: 'org-1',
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
		upload: vi.fn().mockResolvedValue({ error: null }),
		remove: vi.fn().mockResolvedValue({ error: null })
	};
	const storage = { from: vi.fn(() => storageBucket) };
	return { from, query, storage, storageBucket, value: { from, storage } as unknown as SupabaseClient };
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

		await writer.find('personnel_follow_ups', 'artifact-1');
		await writer.insert('personnel_follow_ups', { title: 'Follow up' });
		await writer.update('personnel_follow_ups', 'artifact-1', { status: 'completed' });
		await writer.delete('personnel_follow_ups', 'artifact-1');
		expect(getAdminClient).toHaveBeenCalledTimes(1);
		expect(admin.query.insert).toHaveBeenCalledWith({
			title: 'Follow up',
			organization_id: 'org-1',
			personnel_id: 'person-1'
		});
		expect(admin.query.eq).toHaveBeenCalledWith('organization_id', 'org-1');
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
			writer.insert('personnel_follow_ups', { personnel_id: 'person-2', title: 'Wrong Person' })
		).rejects.toMatchObject({ status: 400 });
		await expect(
			writer.update('personnel_follow_ups', 'artifact-1', { organization_id: 'org-2' })
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
		expect(admin.query.eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(admin.query.eq).toHaveBeenCalledWith('personnel_id', 'person-1');
		expect(admin.query.is).toHaveBeenCalledWith('archived_at', null);

		const file = new File(['pdf'], 'record.pdf', { type: 'application/pdf' });
		const path = 'org-1/counseling-records/person-1/record.pdf';
		await writer.uploadFile('counseling', path, file);
		await writer.removeFile('counseling', path);
		expect(admin.storage.from).toHaveBeenCalledWith('counseling-files');
		expect(admin.storageBucket.upload).toHaveBeenCalledWith(path, file, { upsert: false });
		expect(admin.storageBucket.remove).toHaveBeenCalledWith([path]);
		await expect(writer.removeFile('document', 'org-1/personnel/person-2/documents/x.pdf')).rejects.toMatchObject({
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

		await expect(writer.listCandidates('leader_notes', { archivedAt: null })).resolves.toEqual([
			{ id: 'note-1', personnelId: 'person-1' }
		]);
		expect(admin.query.in).toHaveBeenCalledWith('personnel_id', ['person-1']);
		expect(admin.query.is).toHaveBeenCalledWith('archived_at', null);
		await writer.update('leader_notes', { id: 'note-1', personnelId: 'person-1' }, { archived_at: '2026-09-26' });
		expect(admin.query.eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(admin.query.eq).toHaveBeenCalledWith('personnel_id', 'person-1');
		await expect(
			writer.update('leader_notes', { id: 'note-2', personnelId: 'person-2' }, { archived_at: '2026-09-26' })
		).rejects.toMatchObject({ status: 403 });
		expect(admin.query.update).toHaveBeenCalledTimes(1);
	});
});
