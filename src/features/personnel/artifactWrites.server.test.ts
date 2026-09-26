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
		maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
		single: vi.fn().mockResolvedValue({ data: { id: 'artifact-1', personnel_id: 'person-1' }, error: null })
	};
	const from = vi.fn(() => query);
	return { from, query, value: { from } as unknown as SupabaseClient };
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
});
