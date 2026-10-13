import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelGovernanceDeletionPort } from './governanceDeletion.server';

const ORG = 'org-1';
const FILE_PATH = 'org-1/counseling-records/person-1/counseling.pdf';
const FOREIGN_PATH = 'org-2/counseling-records/person-1/other.pdf';
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

/**
 * A finite PostgREST/Storage model of the committed SQL contract: approval
 * deletes the row and completes the request atomically, and the row trigger
 * retires only a key under the Person's own prefix. Real SQL proves that
 * contract separately; this checks the server sequence and its outcome.
 */
function provider(filePath: string | null = FILE_PATH) {
	const state = {
		record: { personnel_id: 'person-1', file_path: filePath } as {
			personnel_id: string;
			file_path: string | null;
		} | null,
		pending: true,
		files: new Set([FILE_PATH, FOREIGN_PATH]),
		retired: new Map<string, boolean>(),
		receipt: null as { bucket_id: string | null; object_name: string | null } | null,
		approvalFault: null as null | 'constraint' | 'lost-race',
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
					if (owned) state.retired.set(state.record.file_path!, false);
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
					if (!state.receipt) return Response.json([]);
					const key = state.receipt.object_name;
					return Response.json([{ ...state.receipt, file_removed: key === null || state.retired.get(key) === true }]);
				}
				if (url.pathname === '/rest/v1/rpc/complete_organization_file_retirements') {
					let completed = 0;
					for (const name of body.p_object_names as string[])
						if (state.retired.get(name) === false) (state.retired.set(name, true), completed++);
					return Response.json(completed);
				}
				if (method === 'DELETE' && url.pathname === '/storage/v1/object/counseling-files') {
					if (state.storageFault) return Response.json({ message: 'Unavailable' }, { status: 503 });
					const { prefixes } = body as { prefixes: string[] };
					return Response.json(prefixes.filter((path) => state.files.delete(path)).map((name) => ({ name })));
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
		expect([...run.state.files]).toEqual([FOREIGN_PATH]);
		expect(run.state.retired.get(FILE_PATH)).toBe(true);
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
		expect(run.state.retired.get(FILE_PATH)).toBe(false);
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
