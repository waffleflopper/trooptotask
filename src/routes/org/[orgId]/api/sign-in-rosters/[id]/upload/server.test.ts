import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import { _deleteConfig, _getConfig, _postConfig } from './+server';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const OLD_SCAN_PATH = 'test-org/sign-in-rosters/roster-1/old-scan.pdf';

function createRosterUploadContext(signedFilePath: string | null = null) {
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
			signed_file_path: signedFilePath,
			created_by: ctx.auth.userId,
			created_at: '2026-05-02T10:00:00.000Z'
		}
	]);
	return ctx;
}

describe('/api/sign-in-rosters/[id]/upload route config', () => {
	it('uses policy-first configs for uploaded sign-in roster scans', () => {
		expect('permission' in _getConfig).toBe(false);
		expect('permission' in _postConfig).toBe(false);
		expect('permission' in _deleteConfig).toBe(false);
		expect(_getConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.viewRecords);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.manageSignInRosters);
		expect(_deleteConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.manageSignInRosters);
	});

	it('rejects spoofed PDF uploads before writing to storage', async () => {
		const ctx = createRosterUploadContext();

		await expect(
			handleUseCaseRequest(_postConfig, ctx, {
				rosterId: 'roster-1',
				file: new File(['not a pdf'], 'spoofed.pdf', { type: 'application/pdf' })
			})
		).rejects.toMatchObject({ status: 400, message: 'Only PDF files are allowed.' });

		expect(ctx.storagePort.files).toHaveLength(0);
	});

	it('uploads sign-in roster scans when PDF bytes match the declared file type', async () => {
		const ctx = createRosterUploadContext();

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			rosterId: 'roster-1',
			file: new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' })
		});

		expect(result).toEqual({
			filePath: expect.stringMatching(/^test-org\/sign-in-rosters\/roster-1\/[0-9a-f-]{36}-signed-roster\.pdf$/)
		});
		expect(ctx.storagePort.files).toHaveLength(1);
		expect(ctx.storagePort.files[0]).toMatchObject({
			bucket: SENSITIVE_FILE_BUCKET,
			path: result.filePath
		});

		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: 'roster-1'
		});
		expect(roster?.signed_file_path).toBe(result.filePath);
	});

	it('uses a unique storage path and removes the previous scan after replacement succeeds', async () => {
		const ctx = createRosterUploadContext();

		const first = await handleUseCaseRequest(_postConfig, ctx, {
			rosterId: 'roster-1',
			file: new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' })
		});
		const second = await handleUseCaseRequest(_postConfig, ctx, {
			rosterId: 'roster-1',
			file: new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' })
		});

		expect(first.filePath).not.toBe(second.filePath);
		expect(ctx.storagePort.files.map((file) => file.path)).toEqual([second.filePath]);

		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: 'roster-1'
		});
		expect(roster?.signed_file_path).toBe(second.filePath);
	});

	it('removes a newly uploaded scan if the DB update fails and preserves the previous scan', async () => {
		const ctx = createRosterUploadContext(OLD_SCAN_PATH);
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, OLD_SCAN_PATH, new File([PDF_BYTES], 'old-scan.pdf'));
		const update = ctx.store.update.bind(ctx.store);
		ctx.store.update = async (table, orgId, id, data) => {
			if (table === 'sign_in_rosters') throw new Error('update failed');
			return update(table, orgId, id, data);
		};

		await expect(
			handleUseCaseRequest(_postConfig, ctx, {
				rosterId: 'roster-1',
				file: new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' })
			})
		).rejects.toThrow('update failed');

		expect(ctx.storagePort.files).toHaveLength(1);
		expect(ctx.storagePort.files[0]).toMatchObject({
			bucket: SENSITIVE_FILE_BUCKET,
			path: OLD_SCAN_PATH
		});
		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: 'roster-1'
		});
		expect(roster?.signed_file_path).toBe(OLD_SCAN_PATH);
	});

	it('rethrows the original DB error if upload cleanup removal also fails', async () => {
		const ctx = createRosterUploadContext(OLD_SCAN_PATH);
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, OLD_SCAN_PATH, new File([PDF_BYTES], 'old-scan.pdf'));
		const dbError = new Error('update failed');
		const cleanupError = new Error('cleanup remove failed');
		const update = ctx.store.update.bind(ctx.store);
		ctx.store.update = async (table, orgId, id, data) => {
			if (table === 'sign_in_rosters') throw dbError;
			return update(table, orgId, id, data);
		};
		ctx.storage.remove = async () => {
			throw cleanupError;
		};
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await expect(
				handleUseCaseRequest(_postConfig, ctx, {
					rosterId: 'roster-1',
					file: new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' })
				})
			).rejects.toBe(dbError);

			expect(consoleError).toHaveBeenCalledWith(
				'[sign-in-roster-scan-upload] Failed to clean up uploaded scan after DB update failure:',
				expect.stringContaining('cleanup remove failed')
			);
		} finally {
			consoleError.mockRestore();
		}

		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: 'roster-1'
		});
		expect(roster?.signed_file_path).toBe(OLD_SCAN_PATH);
		expect(ctx.storagePort.files.map((file) => file.path)).toEqual([
			OLD_SCAN_PATH,
			expect.stringMatching(/^test-org\/sign-in-rosters\/roster-1\/[0-9a-f-]{36}-signed-roster\.pdf$/)
		]);
	});

	it('does not remove the existing scan if unlinking fails before the DB path is cleared', async () => {
		const ctx = createRosterUploadContext(OLD_SCAN_PATH);
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, OLD_SCAN_PATH, new File([PDF_BYTES], 'old-scan.pdf'));
		const removeCalls: string[][] = [];
		const remove = ctx.storage.remove.bind(ctx.storage);
		ctx.storage.remove = async (bucket, paths) => {
			removeCalls.push(paths);
			return remove(bucket, paths);
		};
		const update = ctx.store.update.bind(ctx.store);
		ctx.store.update = async (table, orgId, id, data) => {
			if (table === 'sign_in_rosters') throw new Error('update failed');
			return update(table, orgId, id, data);
		};

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1' })).rejects.toThrow('update failed');

		expect(removeCalls).toEqual([]);
		expect(ctx.storagePort.files).toEqual([
			expect.objectContaining({ bucket: SENSITIVE_FILE_BUCKET, path: OLD_SCAN_PATH })
		]);
		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: 'roster-1'
		});
		expect(roster?.signed_file_path).toBe(OLD_SCAN_PATH);
	});

	it('clears the DB path and removes the old scan when unlinking succeeds', async () => {
		const ctx = createRosterUploadContext(OLD_SCAN_PATH);
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, OLD_SCAN_PATH, new File([PDF_BYTES], 'old-scan.pdf'));

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1' })).resolves.toEqual({
			success: true
		});

		expect(ctx.storagePort.files).toHaveLength(0);
		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: 'roster-1'
		});
		expect(roster?.signed_file_path).toBeNull();
	});
});
