import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { drainRetiredOrganizationFiles } from '$features/organization/index.server';
import { createSupabasePersonnelGovernanceDeletionPort } from './governanceDeletion.server';

const ORG = 'org-1';
const FILE_PATH = 'org-1/counseling-records/person-1/counseling.pdf';
const FOREIGN_PATH = 'org-2/counseling-records/person-1/other.pdf';
const SIBLING_PATH = 'org-1/counseling-records/person-1/sibling.pdf';
const REVIEWED_AT = '2026-01-01T00:00:00.000Z';

function admin(personnel: 'none' | 'configure' = 'none') {
	return createTestAuthContext({
		orgId: ORG,
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

type ReceiptRow = { bucket_id: string | null; object_name: string | null; file_removed: boolean };
const RECEIPT_FAULTS = {
	empty: () => [],
	malformed: (row: ReceiptRow) => [{ ...row, file_removed: 'false' }],
	duplicate: (row: ReceiptRow) => [row, row],
	'a pending row without a key': (row: ReceiptRow) => [{ ...row, object_name: null }],
	'a completed row that still names a key': (row: ReceiptRow) => [{ ...row, file_removed: true }],
	'the document bucket': (row: ReceiptRow) => [{ ...row, bucket_id: 'personnel-documents' }],
	'another Organization key': (row: ReceiptRow) => [{ ...row, object_name: FOREIGN_PATH }],
	'a sibling key of the same Person': (row: ReceiptRow) => [{ ...row, object_name: SIBLING_PATH }],
	'a forged owned key': () => [{ bucket_id: 'counseling-files', object_name: FILE_PATH, file_removed: false }]
};

function provider(filePath: string | null = FILE_PATH) {
	const state = {
		record: { personnel_id: 'person-1', file_path: filePath } as {
			personnel_id: string;
			file_path: string | null;
		} | null,
		pending: true,
		files: new Set([FILE_PATH, FOREIGN_PATH, SIBLING_PATH]),
		retired: new Map<string, 'pending' | 'removed'>(),
		receipt: null as { bucket_id: string | null; object_name: string | null } | null,
		approvalFault: null as null | 'constraint' | 'lost-race',
		receiptFault: null as null | 'unavailable' | keyof typeof RECEIPT_FAULTS,
		drainedBeforeReceipt: false,
		storageFault: false,
		readFault: false,
		calls: [] as string[]
	};
	const client = createClient('https://provider.invalid', 'synthetic-service-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const method = init?.method ?? 'GET';
				const body = init?.body ? JSON.parse(String(init.body)) : null;
				state.calls.push(`${method} ${url.pathname}`);
				if (method === 'GET' && url.pathname === '/rest/v1/counseling_records') {
					if (state.readFault) return Response.json({ message: 'source unavailable' }, { status: 500 });
					const exact =
						url.searchParams.get('organization_id') === `eq.${ORG}` && url.searchParams.get('id') === 'eq.record-1';
					return Response.json(exact && state.record ? [state.record] : []);
				}
				if (url.pathname === '/rest/v1/rpc/approve_counseling_deletion_request') {
					if (state.approvalFault === 'constraint')
						return Response.json({ code: '23514', message: 'deletion review rejected' }, { status: 400 });
					if (state.approvalFault === 'lost-race') state.pending = false;
					if (!state.pending || !state.record || body.p_expected_file_path !== state.record.file_path)
						return Response.json({ code: 'P0002', message: 'Pending deletion request not found' }, { status: 404 });
					const owned = state.record.file_path?.startsWith(`${ORG}/counseling-records/person-1/`) ?? false;
					if (owned) state.retired.set(state.record.file_path!, 'pending');
					state.receipt = owned
						? { bucket_id: 'counseling-files', object_name: state.record.file_path }
						: { bucket_id: null, object_name: null };
					state.record = null;
					state.pending = false;
					return new Response(null, { status: 204 });
				}
				if (url.pathname === '/rest/v1/rpc/personnel_file_artifact_deletion') {
					expect(body).toEqual({
						p_organization_id: ORG,
						p_personnel_id: 'person-1',
						p_kind: 'counseling',
						p_artifact_id: 'record-1'
					});
					if (state.receiptFault === 'unavailable')
						return Response.json({ message: 'receipt unavailable' }, { status: 503 });
					if (!state.receipt) return Response.json([]);
					const key = state.receipt.object_name;
					if (state.drainedBeforeReceipt && key) (state.files.delete(key), state.retired.set(key, 'removed'));
					const removed = key === null || state.retired.get(key) === 'removed';
					const row = { bucket_id: state.receipt.bucket_id, object_name: removed ? null : key, file_removed: removed };
					return Response.json(state.receiptFault ? RECEIPT_FAULTS[state.receiptFault](row) : [row]);
				}
				if (url.pathname === '/rest/v1/rpc/list_pending_organization_file_retirements') {
					return Response.json(
						[...state.retired]
							.filter(([, status]) => status === 'pending')
							.map(([object_name]) => ({ bucket_id: 'counseling-files', object_name }))
					);
				}
				if (url.pathname === '/rest/v1/rpc/complete_organization_file_retirements') {
					let completed = 0;
					for (const name of body.p_object_names as string[])
						if (body.p_bucket_id === 'counseling-files' && state.retired.get(name) === 'pending')
							(state.retired.set(name, 'removed'), completed++);
					return Response.json(completed);
				}
				if (method === 'DELETE' && url.pathname.startsWith('/storage/v1/object/')) {
					if (state.storageFault) return Response.json({ message: 'Unavailable' }, { status: 503 });
					const { prefixes } = body as { prefixes: string[] };
					const stored = url.pathname === '/storage/v1/object/counseling-files' ? state.files : new Set<string>();
					return Response.json(prefixes.filter((path) => stored.delete(path)).map((name) => ({ name })));
				}
				throw new Error(`Unexpected finite provider request ${method} ${url.pathname}`);
			}
		}
	});
	const requirePending = vi.fn(async () => {
		if (!state.pending) throw Object.assign(new Error('Pending deletion request not found'), { status: 404 });
	});
	const port = createSupabasePersonnelGovernanceDeletionPort(() => client, requirePending);
	return {
		state,
		client,
		requirePending,
		approve: (actor = admin()) => port.deleteApprovedCounselingRecord(actor, 'request-1', 'record-1', REVIEWED_AT)
	};
}

describe('Organization-approved counseling deletion', () => {
	it('denies nonreviewers before service access', async () => {
		const getAdminClient = vi.fn();
		const requirePending = vi.fn();
		const member = createTestAuthContext({ orgId: ORG, role: 'member', isPrivileged: false });
		await expect(
			createSupabasePersonnelGovernanceDeletionPort(getAdminClient, requirePending).deleteApprovedCounselingRecord(
				member,
				'request-1',
				'record-1',
				REVIEWED_AT
			)
		).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient).not.toHaveBeenCalled();
		expect(requirePending).not.toHaveBeenCalled();
	});

	it('removes the bound file only after the atomic approval commits, for a reviewer without Personnel access', async () => {
		const run = provider();
		await expect(run.approve()).resolves.toEqual({ fileCleanup: 'complete' });
		expect(run.requirePending).toHaveBeenCalledWith(ORG, 'request-1', 'counseling_record', 'record-1');
		expect(run.state).toMatchObject({ record: null, pending: false });
		expect(run.state.files).toEqual(new Set([FOREIGN_PATH, SIBLING_PATH]));
		expect(run.state.retired.get(FILE_PATH)).toBe('removed');
		const approval = run.state.calls.indexOf('POST /rest/v1/rpc/approve_counseling_deletion_request');
		const removal = run.state.calls.indexOf('DELETE /storage/v1/object/counseling-files');
		expect(approval).toBeGreaterThan(-1);
		expect(removal).toBeGreaterThan(approval);
	});

	it('keeps the file, row and pending request when the approval transaction fails, then completes on retry', async () => {
		const run = provider();
		run.state.approvalFault = 'constraint';
		await expect(run.approve()).rejects.toThrow('deletion review rejected');
		expect(run.state.record).toEqual({ personnel_id: 'person-1', file_path: FILE_PATH });
		expect(run.state.pending).toBe(true);
		expect(run.state.files.has(FILE_PATH)).toBe(true);
		run.state.approvalFault = null;
		await expect(run.approve()).resolves.toEqual({ fileCleanup: 'complete' });
		expect(run.state.files.has(FILE_PATH)).toBe(false);
	});

	it('produces no file effect for a reviewer who loses the terminal race', async () => {
		const run = provider();
		run.state.approvalFault = 'lost-race';
		await expect(run.approve()).rejects.toMatchObject({ status: 404 });
		expect(run.state.files.has(FILE_PATH)).toBe(true);
		expect(run.state.calls).not.toContain('DELETE /storage/v1/object/counseling-files');
	});

	it('reports pending cleanup when Storage fails after the approval commits', async () => {
		const run = provider();
		run.state.storageFault = true;
		await expect(run.approve()).resolves.toEqual({ fileCleanup: 'pending' });
		expect(run.state).toMatchObject({ record: null, pending: false });
		expect(run.state.files.has(FILE_PATH)).toBe(true);
		expect(run.state.retired.get(FILE_PATH)).toBe('pending');
	});

	it.each([
		'unavailable',
		'empty',
		'malformed',
		'duplicate',
		'a pending row without a key',
		'a completed row that still names a key',
		'the document bucket',
		'another Organization key',
		'a sibling key of the same Person'
	] as const)(
		'reports pending cleanup for a committed approval whose receipt is %s, leaving the retired key for scheduled cleanup',
		async (fault) => {
			const run = provider();
			run.state.receiptFault = fault;
			await expect(run.approve()).resolves.toEqual({ fileCleanup: 'pending' });
			expect(run.state).toMatchObject({ record: null, pending: false });
			expect(run.state.files).toEqual(new Set([FILE_PATH, FOREIGN_PATH, SIBLING_PATH]));
			expect(run.state.calls.filter((call) => call.startsWith('DELETE '))).toEqual([]);
			expect(run.state.retired.get(FILE_PATH)).toBe('pending');
			await expect(run.approve()).rejects.toMatchObject({ status: 404 });

			await expect(drainRetiredOrganizationFiles(run.client)).resolves.toEqual({
				removed: 1,
				failed: 0,
				limitReached: false
			});
			expect(run.state.files).toEqual(new Set([FOREIGN_PATH, SIBLING_PATH]));
			expect(run.state.retired.get(FILE_PATH)).toBe('removed');
		}
	);

	it('reports pending without Storage effects when a record without a file receives an owned key', async () => {
		const run = provider(null);
		run.state.receiptFault = 'a forged owned key';
		await expect(run.approve()).resolves.toEqual({ fileCleanup: 'pending' });
		expect(run.state).toMatchObject({ record: null, pending: false });
		expect(run.state.files).toEqual(new Set([FILE_PATH, FOREIGN_PATH, SIBLING_PATH]));
		expect(run.state.calls.filter((call) => call.startsWith('DELETE '))).toEqual([]);
		expect(run.state.retired).toEqual(new Map());
	});

	it('confirms a retirement that scheduled cleanup completed before the receipt read', async () => {
		const run = provider();
		run.state.drainedBeforeReceipt = true;
		await expect(run.approve()).resolves.toEqual({ fileCleanup: 'complete' });
		expect(run.state).toMatchObject({ record: null, pending: false });
		expect(run.state.files).toEqual(new Set([FOREIGN_PATH, SIBLING_PATH]));
		expect(run.state.calls.filter((call) => call.startsWith('DELETE '))).toEqual([]);
		expect(run.state.retired.get(FILE_PATH)).toBe('removed');
	});

	it('approves a record whose historical path is outside its Person without removing those bytes', async () => {
		const run = provider(FOREIGN_PATH);
		await expect(run.approve()).resolves.toEqual({ fileCleanup: 'complete' });
		expect(run.state.record).toBeNull();
		expect(run.state.files.has(FOREIGN_PATH)).toBe(true);
		expect(run.state.calls).not.toContain('DELETE /storage/v1/object/counseling-files');
	});

	it('rejects a foreign or missing row before approval', async () => {
		const run = provider();
		run.state.record = null;
		await expect(run.approve()).rejects.toMatchObject({ status: 404 });
		expect(run.state.calls).not.toContain('POST /rest/v1/rpc/approve_counseling_deletion_request');
	});

	it('propagates a source read or pending-guard failure before approval', async () => {
		const unreadable = provider();
		unreadable.state.readFault = true;
		await expect(unreadable.approve()).rejects.toThrow('source unavailable');
		const resolved = provider();
		resolved.state.pending = false;
		await expect(resolved.approve()).rejects.toMatchObject({ status: 404 });
		for (const run of [unreadable, resolved]) {
			expect(run.state.calls).not.toContain('POST /rest/v1/rpc/approve_counseling_deletion_request');
			expect(run.state.files.has(FILE_PATH)).toBe(true);
		}
	});
});
