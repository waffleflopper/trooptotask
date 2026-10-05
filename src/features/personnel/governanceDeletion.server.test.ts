import { describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

function client(
	row: { personnel_id: string; file_path: string | null } | null,
	requestExists = true,
	readError?: string
) {
	const remove = vi.fn().mockResolvedValue({ data: row?.file_path ? [{ name: row.file_path }] : [], error: null });
	const storage = { from: vi.fn(() => ({ remove })) };
	const rpc = vi.fn().mockResolvedValue({ error: null });
	const queries: Array<{ table: string; eq: ReturnType<typeof vi.fn> }> = [];
	const from = vi.fn((table: string) => {
		const query = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn(async () => ({
				data: row,
				error: readError ? { message: readError } : null
			}))
		};
		queries.push({ table, eq: query.eq });
		return query;
	});
	const requirePending = vi.fn(async () => {
		if (!requestExists) throw Object.assign(new Error('Pending deletion request not found'), { status: 404 });
	});
	return {
		from,
		storage,
		remove,
		rpc,
		queries,
		requirePending,
		value: { from, storage, rpc } as unknown as SupabaseClient
	};
}

describe('Organization-approved counseling deletion', () => {
	it('denies nonreviewers before service access', async () => {
		const getAdminClient = vi.fn();
		const requirePending = vi.fn();
		const member = createTestAuthContext({ orgId: 'org-1', role: 'member', isPrivileged: false });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(getAdminClient, requirePending).deleteApprovedCounselingRecord(
				member,
				'request-1',
				'record-1',
				'2026-01-01T00:00:00.000Z'
			)
		).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient).not.toHaveBeenCalled();
		expect(requirePending).not.toHaveBeenCalled();
	});

	it('removes the bound file and exact same-Organization row for a reviewer without Personnel access', async () => {
		const provider = client({ personnel_id: 'person-1', file_path: FILE_PATH });
		await createSupabasePersonnelGovernanceDeletionPort(
			() => provider.value,
			provider.requirePending
		).deleteApprovedCounselingRecord(admin(), 'request-1', 'record-1', '2026-01-01T00:00:00.000Z');
		expect(provider.requirePending).toHaveBeenCalledWith('org-1', 'request-1', 'counseling_record', 'record-1');
		expect(provider.from).toHaveBeenCalledWith('counseling_records');
		expect(provider.queries[0].eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(provider.queries[0].eq).toHaveBeenCalledWith('id', 'record-1');
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
			createSupabasePersonnelGovernanceDeletionPort(
				() => provider.value,
				provider.requirePending
			).deleteApprovedCounselingRecord(admin(), 'request-1', 'foreign', '2026-01-01T00:00:00.000Z')
		).rejects.toMatchObject({ status: 404 });
		expect(provider.from).toHaveBeenCalledTimes(1);
		expect(provider.remove).not.toHaveBeenCalled();
		expect(provider.rpc).not.toHaveBeenCalled();
	});

	it('propagates source-row read failure before Storage or approval RPC', async () => {
		const provider = client({ personnel_id: 'person-1', file_path: FILE_PATH }, true, 'source unavailable');
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(
				() => provider.value,
				provider.requirePending
			).deleteApprovedCounselingRecord(admin(), 'request-1', 'record-1', '2026-01-01T00:00:00.000Z')
		).rejects.toThrow('source unavailable');
		expect(provider.remove).not.toHaveBeenCalled();
		expect(provider.rpc).not.toHaveBeenCalled();
	});

	it('does not remove a file for a missing or mismatched request', async () => {
		const provider = client({ personnel_id: 'person-1', file_path: FILE_PATH }, false);
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(
				() => provider.value,
				provider.requirePending
			).deleteApprovedCounselingRecord(admin(), 'wrong-request', 'record-1', '2026-01-01T00:00:00.000Z')
		).rejects.toMatchObject({ status: 404 });
		expect(provider.remove).not.toHaveBeenCalled();
		expect(provider.rpc).not.toHaveBeenCalled();
	});

	it('waits for a fresh pending guard before Storage and propagates its failure', async () => {
		const provider = client({ personnel_id: 'person-1', file_path: FILE_PATH });
		let rejectPending!: (error: Error) => void;
		provider.requirePending.mockImplementationOnce(
			() =>
				new Promise<void>((_resolve, reject) => {
					rejectPending = reject;
				})
		);
		const deletion = createSupabasePersonnelGovernanceDeletionPort(() => provider.value, provider.requirePending);
		const attempt = deletion.deleteApprovedCounselingRecord(
			admin(),
			'request-1',
			'record-1',
			'2026-01-01T00:00:00.000Z'
		);
		const rejected = expect(attempt).rejects.toThrow('request unavailable');
		expect(provider.from).toHaveBeenCalledWith('counseling_records');
		expect(provider.remove).not.toHaveBeenCalled();
		expect(provider.rpc).not.toHaveBeenCalled();
		rejectPending(new Error('request unavailable'));
		await rejected;
		expect(provider.remove).not.toHaveBeenCalled();
		expect(provider.rpc).not.toHaveBeenCalled();
	});

	it('keeps an unsafe file path or Storage failure ahead of database deletion', async () => {
		const unsafe = client({ personnel_id: 'person-1', file_path: 'org-2/counseling-records/person-1/other.pdf' });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(
				() => unsafe.value,
				unsafe.requirePending
			).deleteApprovedCounselingRecord(admin(), 'request-1', 'record-1', '2026-01-01T00:00:00.000Z')
		).rejects.toMatchObject({ status: 400 });
		expect(unsafe.from).toHaveBeenCalledTimes(1);
		expect(unsafe.remove).not.toHaveBeenCalled();
		expect(unsafe.rpc).not.toHaveBeenCalled();
		const failedStorage = client({ personnel_id: 'person-1', file_path: FILE_PATH });
		failedStorage.remove.mockResolvedValue({ error: { message: 'Unavailable' } });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(
				() => failedStorage.value,
				failedStorage.requirePending
			).deleteApprovedCounselingRecord(admin(), 'request-1', 'record-1', '2026-01-01T00:00:00.000Z')
		).rejects.toThrow('Storage remove failed: Unavailable');
		expect(failedStorage.from).toHaveBeenCalledTimes(1);
		expect(failedStorage.rpc).not.toHaveBeenCalled();
	});

	it.each([
		['malformed', { name: FILE_PATH }],
		['duplicate', [{ name: FILE_PATH }, { name: FILE_PATH }]],
		['foreign', [{ name: 'org-2/counseling-records/person-1/other.pdf' }]]
	])('refuses a %s Storage acknowledgement before approval', async (_fault, data) => {
		const provider = client({ personnel_id: 'person-1', file_path: FILE_PATH });
		provider.remove.mockResolvedValue({ data, error: null });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(
				() => provider.value,
				provider.requirePending
			).deleteApprovedCounselingRecord(admin(), 'request-1', 'record-1', '2026-01-01T00:00:00.000Z')
		).rejects.toThrow();
		expect(provider.rpc).not.toHaveBeenCalled();
	});

	it('treats a missing row at the atomic database step as 404', async () => {
		const provider = client({ personnel_id: 'person-1', file_path: null });
		provider.rpc.mockResolvedValue({ error: { code: 'P0002', message: 'Counseling record not found' } });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(
				() => provider.value,
				provider.requirePending
			).deleteApprovedCounselingRecord(admin(), 'request-1', 'record-1', '2026-01-01T00:00:00.000Z')
		).rejects.toMatchObject({ status: 404 });
	});

	it('retries database approval after its file was already removed', async () => {
		const files = new Set([FILE_PATH]);
		const acknowledgements: string[][] = [];
		let recordExists = true;
		let pending = true;
		let failNextApproval = true;
		const provider = createClient('https://storage.invalid', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					const method = init?.method ?? 'GET';
					if (method === 'GET' && url.pathname === '/rest/v1/counseling_records') {
						if (url.searchParams.get('organization_id') !== 'eq.org-1' || url.searchParams.get('id') !== 'eq.record-1')
							throw new Error('Unexpected counseling target');
						return Response.json(recordExists ? [{ personnel_id: 'person-1', file_path: FILE_PATH }] : []);
					}
					if (method === 'DELETE' && url.pathname === '/storage/v1/object/counseling-files') {
						const { prefixes } = JSON.parse(String(init?.body)) as { prefixes: string[] };
						const removed = prefixes.filter((path) => files.delete(path));
						acknowledgements.push(removed);
						return Response.json(removed.map((name) => ({ name })));
					}
					if (method === 'POST' && url.pathname === '/rest/v1/rpc/approve_counseling_deletion_request') {
						if (files.has(FILE_PATH)) throw new Error('File still exists at approval');
						if (failNextApproval) {
							failNextApproval = false;
							return Response.json({ code: 'XX000', message: 'status write failed' }, { status: 500 });
						}
						recordExists = false;
						pending = false;
						return Response.json(null);
					}
					throw new Error('Unexpected finite provider request');
				}
			}
		});
		const requirePending = vi.fn(async () => {
			if (!pending) throw Object.assign(new Error('Pending deletion request not found'), { status: 404 });
		});
		const deletion = createSupabasePersonnelGovernanceDeletionPort(() => provider, requirePending);
		const reviewer = admin();

		await expect(
			deletion.deleteApprovedCounselingRecord(reviewer, 'request-1', 'record-1', '2026-01-01T00:00:00.000Z')
		).rejects.toThrow('status write failed');
		expect(files.size).toBe(0);
		expect(recordExists).toBe(true);
		expect(pending).toBe(true);
		expect(acknowledgements).toEqual([[FILE_PATH]]);
		await expect(
			deletion.deleteApprovedCounselingRecord(reviewer, 'request-1', 'record-1', '2026-01-01T00:00:00.000Z')
		).resolves.toBeUndefined();
		expect(acknowledgements).toEqual([[FILE_PATH], []]);
		expect(files.size).toBe(0);
		expect(recordExists).toBe(false);
		expect(pending).toBe(false);
		expect(requirePending).toHaveBeenCalledTimes(2);
	});
});
