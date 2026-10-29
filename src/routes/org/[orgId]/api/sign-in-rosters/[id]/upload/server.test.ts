import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { selectRosterContext, selectRosterUploadContext } from '../../rosterTestContexts';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import type { RequestEvent } from '@sveltejs/kit';
import { _deleteConfig, _getConfig, _postConfig } from './+server';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const OLD_SCAN_PATH = 'test-org/sign-in-rosters/roster-1/old-scan.pdf';
const MIXED_SCAN_PATH = 'test-org/sign-in-rosters/roster-mixed/mixed-scan.pdf';
const GROUP_ALPHA = 'group-alpha';
const GROUP_BRAVO = 'group-bravo';

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
			personnel_ids: ['p-1'],
			scope_group_ids: [GROUP_ALPHA],
			filter_config: null,
			signed_file_path: signedFilePath,
			created_by: ctx.auth.userId,
			created_at: '2026-05-02T10:00:00.000Z'
		}
	]);
	return ctx;
}

function createScopedRosterUploadContext(signedFilePath: string | null = MIXED_SCAN_PATH) {
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
			scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: [GROUP_ALPHA] })
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
			signed_file_path: signedFilePath,
			created_by: ctx.auth.userId,
			created_at: '2026-05-02T10:00:00.000Z'
		}
	]);
	return ctx;
}

describe('/api/sign-in-rosters/[id]/upload route config', () => {
	it.each(['replace', 'unlink'] as const)(
		'denies scan %s to a Training viewer before changing files or paths',
		async (operation) => {
			const ctx = createRosterUploadContext(OLD_SCAN_PATH);
			ctx.auth = {
				...ctx.auth,
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: { ...ctx.auth.capabilityMap, training: 'view' }
			};
			await ctx.storage.upload(SENSITIVE_FILE_BUCKET, OLD_SCAN_PATH, new File([PDF_BYTES], 'old-scan.pdf'));
			const result =
				operation === 'replace'
					? handleUseCaseRequest(
							_postConfig,
							ctx,
							{
								rosterId: 'roster-1',
								file: new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' })
							},
							() => selectRosterUploadContext(ctx)
						)
					: handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1', filePath: OLD_SCAN_PATH }, () =>
							selectRosterUploadContext(ctx)
						);
			await expect(result).rejects.toMatchObject({ status: 403 });
			expect(ctx.storagePort.files.map((file) => file.path)).toEqual([OLD_SCAN_PATH]);
			await expect(ctx.store.findOne('sign_in_rosters', ctx.auth.orgId, { id: 'roster-1' })).resolves.toMatchObject({
				signed_file_path: OLD_SCAN_PATH
			});
			expect(ctx.auditPort.events).toEqual([expect.objectContaining({ action: 'policy.denied' })]);
		}
	);

	it.each(['read', 'replace', 'unlink'] as const)(
		'denies a foreign roster scan %s before any file access',
		async (operation) => {
			const ctx = createRosterUploadContext();
			ctx.rawStore.seed('sign_in_rosters', [
				{ id: 'foreign-roster', organization_id: 'foreign-org', title: 'Foreign', signed_file_path: OLD_SCAN_PATH }
			]);
			await ctx.storage.upload(SENSITIVE_FILE_BUCKET, OLD_SCAN_PATH, new File([PDF_BYTES], 'old-scan.pdf'));
			const upload = vi.spyOn(ctx.storage, 'upload');
			const remove = vi.spyOn(ctx.storage, 'remove');
			const signedUrl = vi.spyOn(ctx.storage, 'createSignedUrl');
			const result =
				operation === 'replace'
					? handleUseCaseRequest(
							_postConfig,
							ctx,
							{
								rosterId: 'foreign-roster',
								file: new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' })
							},
							() => selectRosterUploadContext(ctx)
						)
					: operation === 'read'
						? handleUseCaseRequest(_getConfig, ctx, { rosterId: 'foreign-roster' }, () => selectRosterContext(ctx))
						: handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'foreign-roster', filePath: OLD_SCAN_PATH }, () =>
								selectRosterUploadContext(ctx)
							);
			await expect(result).rejects.toMatchObject({
				status: 404,
				message: operation === 'read' ? 'No signed file found' : 'This roster is no longer available.'
			});
			expect(upload).not.toHaveBeenCalled();
			expect(remove).not.toHaveBeenCalled();
			expect(signedUrl).not.toHaveBeenCalled();
			expect(ctx.storagePort.files.map((file) => file.path)).toEqual([OLD_SCAN_PATH]);
			await expect(
				ctx.rawStore.findOne('sign_in_rosters', 'foreign-org', { id: 'foreign-roster' })
			).resolves.toMatchObject({
				signed_file_path: OLD_SCAN_PATH
			});
			expect(ctx.auditPort.events).toEqual([]);
		}
	);

	it('rejects spoofed PDF uploads before writing to storage', async () => {
		const ctx = createRosterUploadContext();

		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					rosterId: 'roster-1',
					file: new File(['not a pdf'], 'spoofed.pdf', { type: 'application/pdf' })
				},
				() => selectRosterUploadContext(ctx)
			)
		).rejects.toMatchObject({ status: 400, message: 'Only PDF files are allowed.' });

		expect(ctx.storagePort.files).toHaveLength(0);
	});

	it('uploads sign-in roster scans when PDF bytes match the declared file type', async () => {
		const ctx = createRosterUploadContext();

		const result = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				rosterId: 'roster-1',
				file: new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' })
			},
			() => selectRosterUploadContext(ctx)
		);

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

	it('denies signed URL creation for mixed-scope rosters outside the caller scope', async () => {
		const ctx = createScopedRosterUploadContext(MIXED_SCAN_PATH);
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, MIXED_SCAN_PATH, new File([PDF_BYTES], 'mixed-scan.pdf'));

		await expect(
			handleUseCaseRequest(_getConfig, ctx, { rosterId: 'roster-mixed' }, () => selectRosterContext(ctx))
		).rejects.toMatchObject({
			status: 404,
			message: 'No signed file found'
		});
	});

	it('denies scan replacement for mixed-scope rosters before uploading a replacement', async () => {
		const ctx = createScopedRosterUploadContext(MIXED_SCAN_PATH);
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, MIXED_SCAN_PATH, new File([PDF_BYTES], 'mixed-scan.pdf'));

		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					rosterId: 'roster-mixed',
					file: new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' })
				},
				() => selectRosterUploadContext(ctx)
			)
		).rejects.toMatchObject({ status: 404, message: 'This roster is no longer available.' });

		expect(ctx.storagePort.files.map((file) => file.path)).toEqual([MIXED_SCAN_PATH]);
	});

	it('uses a unique storage path and removes the previous scan after replacement succeeds', async () => {
		const ctx = createRosterUploadContext();

		const first = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				rosterId: 'roster-1',
				file: new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' })
			},
			() => selectRosterUploadContext(ctx)
		);
		const second = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				rosterId: 'roster-1',
				file: new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' })
			},
			() => selectRosterUploadContext(ctx)
		);

		expect(first.filePath).not.toBe(second.filePath);
		expect(ctx.storagePort.files.map((file) => file.path)).toEqual([second.filePath]);

		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: 'roster-1'
		});
		expect(roster?.signed_file_path).toBe(second.filePath);
	});

	it('keeps a saved replacement when displaced scan cleanup is left to scheduled cleanup', async () => {
		const ctx = createRosterUploadContext(OLD_SCAN_PATH);
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, OLD_SCAN_PATH, new File([PDF_BYTES], 'old-scan.pdf'));
		ctx.storage.remove = async () => {
			throw new Error('previous cleanup failed');
		};

		const result = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				rosterId: 'roster-1',
				file: new File([PDF_BYTES], 'signed-roster.pdf', { type: 'application/pdf' })
			},
			() => selectRosterUploadContext(ctx)
		);

		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: 'roster-1'
		});
		expect(roster?.signed_file_path).toBe(result.filePath);
		expect(ctx.storagePort.files.map((file) => file.path)).toEqual([OLD_SCAN_PATH, result.filePath]);
		expect(ctx.auditPort.events).toEqual([expect.objectContaining({ action: 'sign_in_roster.scan_uploaded' })]);
	});

	it('clears the pointer and reports pending cleanup when unlink storage cleanup fails', async () => {
		const ctx = createRosterUploadContext(OLD_SCAN_PATH);
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, OLD_SCAN_PATH, new File([PDF_BYTES], 'old-scan.pdf'));
		ctx.storage.remove = async () => {
			throw new Error('storage cleanup failed');
		};

		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1', filePath: OLD_SCAN_PATH }, () =>
				selectRosterUploadContext(ctx)
			)
		).resolves.toEqual({ success: true, fileCleanup: 'pending' });

		await expect(ctx.store.findOne('sign_in_rosters', ctx.auth.orgId, { id: 'roster-1' })).resolves.toMatchObject({
			signed_file_path: null
		});
	});

	it('refuses to unlink a scan that changed since the caller loaded it', async () => {
		const ctx = createRosterUploadContext(OLD_SCAN_PATH);
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, OLD_SCAN_PATH, new File([PDF_BYTES], 'old-scan.pdf'));

		await expect(
			handleUseCaseRequest(
				_deleteConfig,
				ctx,
				{ rosterId: 'roster-1', filePath: 'test-org/sign-in-rosters/roster-1/stale-scan.pdf' },
				() => selectRosterUploadContext(ctx)
			)
		).rejects.toMatchObject({ status: 409, message: 'This signed scan changed. Reload to review it.' });

		expect(ctx.storagePort.files.map((file) => file.path)).toEqual([OLD_SCAN_PATH]);
		await expect(ctx.store.findOne('sign_in_rosters', ctx.auth.orgId, { id: 'roster-1' })).resolves.toMatchObject({
			signed_file_path: OLD_SCAN_PATH
		});
	});

	it('requires the expected scan key in the unlink request body', async () => {
		const rosterId = '00000000-0000-4000-8000-00000000d001';
		const event = (body: string) =>
			({
				params: { id: rosterId },
				request: new Request('http://localhost/api', { method: 'DELETE', body })
			}) as unknown as RequestEvent;

		await expect(_deleteConfig.parseInput?.(event(JSON.stringify({ filePath: OLD_SCAN_PATH })))).resolves.toEqual({
			rosterId,
			filePath: OLD_SCAN_PATH
		});
		for (const body of ['', '{}', JSON.stringify({ filePath: '' }), JSON.stringify({ filePath: 'x'.repeat(1025) })])
			await expect(_deleteConfig.parseInput?.(event(body))).rejects.toMatchObject({
				status: 400,
				message: 'The signed scan to remove is required'
			});
	});

	it('answers a non-UUID roster path as a missing roster before reading the request', async () => {
		const event = (method: string) =>
			({
				params: { id: 'abc' },
				request: new Request('http://localhost/api', { method, body: method === 'GET' ? undefined : '{}' })
			}) as unknown as RequestEvent;

		for (const [config, method] of [
			[_getConfig, 'GET'],
			[_postConfig, 'POST'],
			[_deleteConfig, 'DELETE']
		] as const) {
			await expect(Promise.resolve().then(() => config.parseInput?.(event(method)))).rejects.toMatchObject({
				status: 404,
				message: 'This roster is no longer available.'
			});
		}
	});

	it('clears the DB path and removes the old scan when unlinking succeeds', async () => {
		const ctx = createRosterUploadContext(OLD_SCAN_PATH);
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, OLD_SCAN_PATH, new File([PDF_BYTES], 'old-scan.pdf'));

		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-1', filePath: OLD_SCAN_PATH }, () =>
				selectRosterUploadContext(ctx)
			)
		).resolves.toEqual({ success: true, fileCleanup: 'complete' });

		expect(ctx.storagePort.files).toHaveLength(0);
		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: 'roster-1'
		});
		expect(roster?.signed_file_path).toBeNull();
	});

	it('denies scan unlink for mixed-scope rosters outside the caller scope', async () => {
		const ctx = createScopedRosterUploadContext(MIXED_SCAN_PATH);
		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, MIXED_SCAN_PATH, new File([PDF_BYTES], 'mixed-scan.pdf'));

		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { rosterId: 'roster-mixed', filePath: MIXED_SCAN_PATH }, () =>
				selectRosterUploadContext(ctx)
			)
		).rejects.toMatchObject({
			status: 404,
			message: 'This roster is no longer available.'
		});

		expect(ctx.storagePort.files.map((file) => file.path)).toEqual([MIXED_SCAN_PATH]);
		const roster = await ctx.rawStore.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: 'roster-mixed'
		});
		expect(roster?.signed_file_path).toBe(MIXED_SCAN_PATH);
	});
});
