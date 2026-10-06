import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { selectRosterUploadContext } from '../rosterTestContexts';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import { _deleteConfig } from './+server';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const SIGNED_SCAN_PATH = 'test-org/sign-in-rosters/roster-1/signed-scan.pdf';
const GROUP_ALPHA = 'group-alpha';
const GROUP_BRAVO = 'group-bravo';

function createRosterContext() {
	const ctx = createTestContext();
	ctx.store.seed('sign_in_rosters', [
		{
			id: 'roster-1',
			organization_id: ctx.auth.orgId,
			title: 'Annual AT Sign-In',
			roster_date: '2026-05-02',
			blank_date: false,
			separate_by_group: false,
			sort_by: 'alphabetical',
			personnel_snapshot: [],
			personnel_ids: ['p-1'],
			scope_group_ids: [GROUP_ALPHA],
			filter_config: null,
			signed_file_path: SIGNED_SCAN_PATH,
			created_by: ctx.auth.userId,
			created_at: '2026-05-02T10:00:00.000Z'
		}
	]);
	return ctx;
}

function createScopedRosterContext() {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			capabilityMap: {
				calendar: 'view',
				personnel: 'view',
				training: 'operate',
				criticalTasks: 'view',
				onboarding: 'view',
				ratingScheme: 'view'
			},
			scopeSet: { kind: 'groups', groupIds: [GROUP_ALPHA] }
		}
	});
	ctx.rawStore.seed('sign_in_rosters', [
		{
			id: 'roster-alpha',
			organization_id: ctx.auth.orgId,
			title: 'Alpha roster',
			personnel_snapshot: [],
			personnel_ids: ['p-alpha'],
			scope_group_ids: [GROUP_ALPHA],
			signed_file_path: null,
			created_by: ctx.auth.userId,
			created_at: '2026-05-02T10:00:00.000Z'
		},
		{
			id: 'roster-mixed',
			organization_id: ctx.auth.orgId,
			title: 'Mixed roster',
			personnel_snapshot: [],
			personnel_ids: ['p-alpha', 'p-bravo'],
			scope_group_ids: [GROUP_ALPHA, GROUP_BRAVO],
			signed_file_path: null,
			created_by: ctx.auth.userId,
			created_at: '2026-05-02T10:00:00.000Z'
		}
	]);
	return ctx;
}

describe('/api/sign-in-rosters/[id] route config', () => {
	it('denies roster deletion to a Training viewer without touching the row or scan', async () => {
		const ctx = createRosterContext();
		ctx.auth = {
			...ctx.auth,
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: { ...ctx.auth.capabilityMap, training: 'view' }
		};
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, SIGNED_SCAN_PATH, new File([PDF_BYTES], 'signed-scan.pdf'));
		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1' }, () => selectRosterUploadContext(ctx))
		).rejects.toMatchObject({ status: 403 });
		await expect(ctx.store.findOne('sign_in_rosters', ctx.auth.orgId, { id: 'roster-1' })).resolves.toMatchObject({
			signed_file_path: SIGNED_SCAN_PATH
		});
		expect(ctx.storagePort.files.map((file) => file.path)).toEqual([SIGNED_SCAN_PATH]);
		expect(ctx.auditPort.events).toEqual([expect.objectContaining({ action: 'policy.denied' })]);
	});

	it('does not delete a foreign Organization roster or its scan', async () => {
		const ctx = createRosterContext();
		ctx.rawStore.seed('sign_in_rosters', [
			{ id: 'foreign-roster', organization_id: 'foreign-org', title: 'Foreign', signed_file_path: SIGNED_SCAN_PATH }
		]);
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, SIGNED_SCAN_PATH, new File([PDF_BYTES], 'signed-scan.pdf'));
		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'foreign-roster' }, () => selectRosterUploadContext(ctx))
		).rejects.toMatchObject({ status: 404, message: 'Roster not found' });
		await expect(
			ctx.rawStore.findOne('sign_in_rosters', 'foreign-org', { id: 'foreign-roster' })
		).resolves.not.toBeNull();
		expect(ctx.storagePort.files.map((file) => file.path)).toEqual([SIGNED_SCAN_PATH]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('preserves the DB row and stored scan when storage cleanup fails', async () => {
		const ctx = createRosterContext();
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, SIGNED_SCAN_PATH, new File([PDF_BYTES], 'signed-scan.pdf'));
		const deleteRow = ctx.store.delete.bind(ctx.store);
		const deleteCalls: string[] = [];
		ctx.store.delete = async (table, orgId, id) => {
			deleteCalls.push(`${table}/${id}`);
			return deleteRow(table, orgId, id);
		};
		ctx.storage.remove = async () => {
			throw new Error('storage cleanup failed');
		};

		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1' }, () => selectRosterUploadContext(ctx))
		).rejects.toThrow('storage cleanup failed');

		expect(deleteCalls).toEqual([]);
		expect(ctx.storagePort.files).toEqual([
			expect.objectContaining({ bucket: SENSITIVE_FILE_BUCKET, path: SIGNED_SCAN_PATH })
		]);
		await expect(
			ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, { id: 'roster-1' })
		).resolves.toMatchObject({ signed_file_path: SIGNED_SCAN_PATH });
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('removes the stored scan before deleting the DB row so retries keep a recoverable pointer', async () => {
		const ctx = createRosterContext();
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, SIGNED_SCAN_PATH, new File([PDF_BYTES], 'signed-scan.pdf'));
		const removeCalls: string[][] = [];
		const remove = ctx.storage.remove.bind(ctx.storage);
		ctx.storage.remove = async (bucket, paths) => {
			removeCalls.push(paths);
			return remove(bucket, paths);
		};
		const deleteRow = ctx.store.delete.bind(ctx.store);
		ctx.store.delete = async (table, orgId, id) => {
			if (table === 'sign_in_rosters') throw new Error('delete failed');
			return deleteRow(table, orgId, id);
		};

		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1' }, () => selectRosterUploadContext(ctx))
		).rejects.toThrow('delete failed');

		expect(removeCalls).toEqual([[SIGNED_SCAN_PATH]]);
		expect(ctx.storagePort.files).toEqual([]);
		await expect(
			ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, { id: 'roster-1' })
		).resolves.toMatchObject({ signed_file_path: SIGNED_SCAN_PATH });
		expect(ctx.auditPort.events).toEqual([]);
		ctx.store.delete = deleteRow;
		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1' }, () => selectRosterUploadContext(ctx))
		).resolves.toEqual({ success: true });
		await expect(ctx.store.findOne('sign_in_rosters', ctx.auth.orgId, { id: 'roster-1' })).resolves.toBeNull();
	});

	it('deletes the DB row, removes the stored scan, and logs audit when deletion succeeds', async () => {
		const ctx = createRosterContext();
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, SIGNED_SCAN_PATH, new File([PDF_BYTES], 'signed-scan.pdf'));

		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1' }, () => selectRosterUploadContext(ctx))
		).resolves.toEqual({
			success: true
		});

		expect(ctx.storagePort.files).toHaveLength(0);
		await expect(ctx.store.findOne('sign_in_rosters', ctx.auth.orgId, { id: 'roster-1' })).resolves.toBeNull();
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'sign_in_roster.deleted',
				resourceType: 'sign_in_roster',
				resourceId: 'roster-1',
				details: { title: 'Annual AT Sign-In' }
			})
		]);
	});

	it('denies deletion for mixed-scope rosters when the caller has only one roster group', async () => {
		const ctx = createScopedRosterContext();

		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-mixed' }, () => selectRosterUploadContext(ctx))
		).rejects.toMatchObject({
			status: 404,
			message: 'Roster not found'
		});

		await expect(
			ctx.rawStore.findOne('sign_in_rosters', ctx.auth.orgId, { id: 'roster-mixed' })
		).resolves.not.toBeNull();
	});
});
