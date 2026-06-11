import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import { _deleteConfig, _getConfig, _postConfig } from './+server';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function createRosterUploadContext() {
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
			signed_file_path: null,
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
			filePath: 'test-org/sign-in-rosters/roster-1/signed-roster.pdf'
		});
		expect(ctx.storagePort.files).toHaveLength(1);
		expect(ctx.storagePort.files[0]).toMatchObject({
			bucket: SENSITIVE_FILE_BUCKET,
			path: 'test-org/sign-in-rosters/roster-1/signed-roster.pdf'
		});

		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: 'roster-1'
		});
		expect(roster?.signed_file_path).toBe('test-org/sign-in-rosters/roster-1/signed-roster.pdf');
	});
});
