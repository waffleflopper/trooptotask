import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import { _deleteConfig } from './+server';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const SIGNED_SCAN_PATH = 'test-org/sign-in-rosters/roster-1/signed-scan.pdf';

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
			filter_config: null,
			signed_file_path: SIGNED_SCAN_PATH,
			created_by: ctx.auth.userId,
			created_at: '2026-05-02T10:00:00.000Z'
		}
	]);
	return ctx;
}

describe('/api/sign-in-rosters/[id] route config', () => {
	it('uses the Training sign-in roster policy for deletion', () => {
		expect('permission' in _deleteConfig).toBe(false);
		expect(_deleteConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.manageSignInRosters);
		expect(_deleteConfig.policyResource).toEqual({ kind: 'unscoped' });
		expect(_deleteConfig.mutation).toBe(true);
	});

	it('does not remove the stored scan when deleting the DB row fails', async () => {
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

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1' })).rejects.toThrow('delete failed');

		expect(removeCalls).toEqual([]);
		expect(ctx.storagePort.files).toEqual([
			expect.objectContaining({ bucket: SENSITIVE_FILE_BUCKET, path: SIGNED_SCAN_PATH })
		]);
		await expect(
			ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, { id: 'roster-1' })
		).resolves.toMatchObject({ signed_file_path: SIGNED_SCAN_PATH });
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('deletes the DB row, removes the stored scan, and logs audit when deletion succeeds', async () => {
		const ctx = createRosterContext();
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, SIGNED_SCAN_PATH, new File([PDF_BYTES], 'signed-scan.pdf'));

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1' })).resolves.toEqual({
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

	it('preserves DB deletion and skips audit if storage cleanup fails after the row is deleted', async () => {
		const ctx = createRosterContext();
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, SIGNED_SCAN_PATH, new File([PDF_BYTES], 'signed-scan.pdf'));
		ctx.storage.remove = async () => {
			throw new Error('storage cleanup failed');
		};

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1' })).rejects.toThrow(
			'storage cleanup failed'
		);

		await expect(ctx.store.findOne('sign_in_rosters', ctx.auth.orgId, { id: 'roster-1' })).resolves.toBeNull();
		expect(ctx.storagePort.files).toEqual([
			expect.objectContaining({ bucket: SENSITIVE_FILE_BUCKET, path: SIGNED_SCAN_PATH })
		]);
		expect(ctx.auditPort.events).toEqual([]);
	});
});
