import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelGovernanceDeletionPort } from './governanceDeletion.server';

const FILE_PATH = 'org-1/counseling-records/person-1/counseling.pdf';

function admin(personnel: 'none' | 'configure' = 'none') {
	return createTestAuthContext({
		orgId: 'org-1',
		role: 'admin',
		isPrivileged: true,
		capabilityMap: {
			calendar: 'none',
			personnel,
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		}
	});
}

function client(row: { personnel_id: string; file_path: string | null } | null) {
	const remove = vi.fn().mockResolvedValue({ error: null });
	const storage = { from: vi.fn(() => ({ remove })) };
	const queries: Array<{ eq: ReturnType<typeof vi.fn>; deleted: () => boolean }> = [];
	const from = vi.fn(() => {
		let deleting = false;
		const query = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			delete: vi.fn(() => {
				deleting = true;
				return query;
			}),
			maybeSingle: vi.fn(async () => ({ data: deleting ? { id: 'record-1' } : row, error: null }))
		};
		queries.push({ eq: query.eq, deleted: () => deleting });
		return query;
	});
	return { from, storage, remove, queries, value: { from, storage } as unknown as SupabaseClient };
}

describe('Organization-approved counseling deletion', () => {
	it('denies nonreviewers before service access', async () => {
		const getAdminClient = vi.fn();
		const member = createTestAuthContext({ orgId: 'org-1', role: 'member', isPrivileged: false });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(getAdminClient).deleteApprovedCounselingRecord(member, 'record-1')
		).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('removes the bound file and exact same-Organization row for a reviewer without Personnel access', async () => {
		const provider = client({ personnel_id: 'person-1', file_path: FILE_PATH });
		await createSupabasePersonnelGovernanceDeletionPort(() => provider.value).deleteApprovedCounselingRecord(
			admin(),
			'record-1'
		);
		expect(provider.from).toHaveBeenCalledTimes(2);
		expect(provider.queries[0].eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(provider.queries[0].eq).toHaveBeenCalledWith('id', 'record-1');
		expect(provider.queries[1].eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(provider.queries[1].eq).toHaveBeenCalledWith('id', 'record-1');
		expect(provider.queries[1].deleted()).toBe(true);
		expect(provider.storage.from).toHaveBeenCalledWith('counseling-files');
		expect(provider.remove).toHaveBeenCalledWith([FILE_PATH]);
		expect(provider.remove.mock.invocationCallOrder[0]).toBeLessThan(provider.from.mock.invocationCallOrder[1]);
	});

	it('rejects foreign or missing rows without deleting or removing files', async () => {
		const provider = client(null);
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(() => provider.value).deleteApprovedCounselingRecord(
				admin(),
				'foreign'
			)
		).rejects.toMatchObject({ status: 404 });
		expect(provider.from).toHaveBeenCalledTimes(1);
		expect(provider.remove).not.toHaveBeenCalled();
	});

	it('keeps an unsafe file path or Storage failure ahead of database deletion', async () => {
		const unsafe = client({ personnel_id: 'person-1', file_path: 'org-2/counseling-records/person-1/other.pdf' });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(() => unsafe.value).deleteApprovedCounselingRecord(
				admin(),
				'record-1'
			)
		).rejects.toMatchObject({ status: 400 });
		expect(unsafe.from).toHaveBeenCalledTimes(1);
		const failedStorage = client({ personnel_id: 'person-1', file_path: FILE_PATH });
		failedStorage.remove.mockResolvedValue({ error: { message: 'Unavailable' } });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(() => failedStorage.value).deleteApprovedCounselingRecord(
				admin(),
				'record-1'
			)
		).rejects.toThrow('Storage remove failed: Unavailable');
		expect(failedStorage.from).toHaveBeenCalledTimes(1);
	});
});
