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

function client(row: { personnel_id: string; file_path: string | null } | null, requestExists = true) {
	const remove = vi.fn().mockResolvedValue({ error: null });
	const storage = { from: vi.fn(() => ({ remove })) };
	const rpc = vi.fn().mockResolvedValue({ error: null });
	const queries: Array<{ table: string; eq: ReturnType<typeof vi.fn> }> = [];
	const from = vi.fn((table: string) => {
		const query = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn(async () => ({
				data: table === 'deletion_requests' ? (requestExists ? { id: 'request-1' } : null) : row,
				error: null
			}))
		};
		queries.push({ table, eq: query.eq });
		return query;
	});
	return { from, storage, remove, rpc, queries, value: { from, storage, rpc } as unknown as SupabaseClient };
}

describe('Organization-approved counseling deletion', () => {
	it('denies nonreviewers before service access', async () => {
		const getAdminClient = vi.fn();
		const member = createTestAuthContext({ orgId: 'org-1', role: 'member', isPrivileged: false });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(getAdminClient).deleteApprovedCounselingRecord(
				member,
				'request-1',
				'record-1',
				'2026-01-01T00:00:00.000Z'
			)
		).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('removes the bound file and exact same-Organization row for a reviewer without Personnel access', async () => {
		const provider = client({ personnel_id: 'person-1', file_path: FILE_PATH });
		await createSupabasePersonnelGovernanceDeletionPort(() => provider.value).deleteApprovedCounselingRecord(
			admin(),
			'request-1',
			'record-1',
			'2026-01-01T00:00:00.000Z'
		);
		expect(provider.from).toHaveBeenCalledWith('deletion_requests');
		expect(provider.from).toHaveBeenCalledWith('counseling_records');
		expect(provider.queries[0].table).toBe('deletion_requests');
		expect(provider.queries[0].eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(provider.queries[0].eq).toHaveBeenCalledWith('id', 'request-1');
		expect(provider.queries[0].eq).toHaveBeenCalledWith('resource_type', 'counseling_record');
		expect(provider.queries[0].eq).toHaveBeenCalledWith('resource_id', 'record-1');
		expect(provider.queries[0].eq).toHaveBeenCalledWith('status', 'pending');
		expect(provider.queries[1].table).toBe('counseling_records');
		expect(provider.queries[1].eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(provider.queries[1].eq).toHaveBeenCalledWith('id', 'record-1');
		expect(provider.storage.from).toHaveBeenCalledWith('counseling-files');
		expect(provider.remove).toHaveBeenCalledWith([FILE_PATH]);
		expect(provider.rpc).toHaveBeenCalledWith('approve_counseling_deletion_request', {
			p_organization_id: 'org-1',
			p_request_id: 'request-1',
			p_record_id: 'record-1',
			p_reviewer_id: admin().userId,
			p_reviewed_at: '2026-01-01T00:00:00.000Z',
			p_expected_file_path: FILE_PATH
		});
		expect(provider.remove.mock.invocationCallOrder[0]).toBeLessThan(provider.rpc.mock.invocationCallOrder[0]);
	});

	it('rejects foreign or missing rows without deleting or removing files', async () => {
		const provider = client(null);
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(() => provider.value).deleteApprovedCounselingRecord(
				admin(),
				'request-1',
				'foreign',
				'2026-01-01T00:00:00.000Z'
			)
		).rejects.toMatchObject({ status: 404 });
		expect(provider.from).toHaveBeenCalledTimes(2);
		expect(provider.remove).not.toHaveBeenCalled();
		expect(provider.rpc).not.toHaveBeenCalled();
	});

	it('does not remove a file for a missing or mismatched request', async () => {
		const provider = client({ personnel_id: 'person-1', file_path: FILE_PATH }, false);
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(() => provider.value).deleteApprovedCounselingRecord(
				admin(),
				'wrong-request',
				'record-1',
				'2026-01-01T00:00:00.000Z'
			)
		).rejects.toMatchObject({ status: 404 });
		expect(provider.remove).not.toHaveBeenCalled();
		expect(provider.rpc).not.toHaveBeenCalled();
	});

	it('keeps an unsafe file path or Storage failure ahead of database deletion', async () => {
		const unsafe = client({ personnel_id: 'person-1', file_path: 'org-2/counseling-records/person-1/other.pdf' });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(() => unsafe.value).deleteApprovedCounselingRecord(
				admin(),
				'request-1',
				'record-1',
				'2026-01-01T00:00:00.000Z'
			)
		).rejects.toMatchObject({ status: 400 });
		expect(unsafe.from).toHaveBeenCalledTimes(2);
		expect(unsafe.rpc).not.toHaveBeenCalled();
		const failedStorage = client({ personnel_id: 'person-1', file_path: FILE_PATH });
		failedStorage.remove.mockResolvedValue({ error: { message: 'Unavailable' } });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(() => failedStorage.value).deleteApprovedCounselingRecord(
				admin(),
				'request-1',
				'record-1',
				'2026-01-01T00:00:00.000Z'
			)
		).rejects.toThrow('Storage remove failed: Unavailable');
		expect(failedStorage.from).toHaveBeenCalledTimes(2);
		expect(failedStorage.rpc).not.toHaveBeenCalled();
	});

	it('treats a missing row at the atomic database step as 404', async () => {
		const provider = client({ personnel_id: 'person-1', file_path: null });
		provider.rpc.mockResolvedValue({ error: { code: 'P0002', message: 'Counseling record not found' } });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(() => provider.value).deleteApprovedCounselingRecord(
				admin(),
				'request-1',
				'record-1',
				'2026-01-01T00:00:00.000Z'
			)
		).rejects.toMatchObject({ status: 404 });
	});

	it('retries database approval after its file was already removed', async () => {
		const provider = client({ personnel_id: 'person-1', file_path: FILE_PATH });
		provider.remove
			.mockResolvedValueOnce({ data: [{ name: FILE_PATH }], error: null })
			.mockResolvedValueOnce({ data: [], error: null });
		provider.rpc
			.mockResolvedValueOnce({ error: { code: 'XX000', message: 'status write failed' } })
			.mockResolvedValueOnce({ error: null });
		const deletion = createSupabasePersonnelGovernanceDeletionPort(() => provider.value);
		const reviewer = admin();

		await expect(
			deletion.deleteApprovedCounselingRecord(reviewer, 'request-1', 'record-1', '2026-01-01T00:00:00.000Z')
		).rejects.toThrow('status write failed');
		await expect(
			deletion.deleteApprovedCounselingRecord(reviewer, 'request-1', 'record-1', '2026-01-01T00:00:00.000Z')
		).resolves.toBeUndefined();
		expect(provider.remove).toHaveBeenCalledTimes(2);
		expect(provider.rpc).toHaveBeenCalledTimes(2);
	});
});
