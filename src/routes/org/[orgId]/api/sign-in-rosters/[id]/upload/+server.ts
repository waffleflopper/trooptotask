import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { buildSensitiveFilePath, SENSITIVE_FILE_BUCKET, validateSensitivePdfFile } from '$lib/storage/sensitiveFiles';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const _getConfig: RouteConfig<{ rosterId: string }, { url: string }> = {
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({
		rosterId: event.params.id as string
	}),
	fn: async (ctx, input) => {
		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: input.rosterId
		});

		if (!roster?.signed_file_path) fail(404, 'No signed file found');

		const url = await ctx.storage.createSignedUrl(SENSITIVE_FILE_BUCKET, roster.signed_file_path, 300);

		return { url };
	}
};

export const GET = handle(_getConfig);

export const _postConfig: RouteConfig<{ rosterId: string; file: File }, { filePath: string }> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.manageSignInRosters,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const formData = await event.request.formData();
		const file = formData.get('file') as File;
		return {
			rosterId: event.params.id as string,
			file
		};
	},
	fn: async (ctx, input) => {
		if (!input.file) fail(400, 'No file provided');
		const validationError = await validateSensitivePdfFile(input.file);
		if (validationError) fail(400, validationError);

		const storagePath = buildSensitiveFilePath({
			orgId: ctx.auth.orgId,
			scope: 'sign-in-rosters',
			recordId: input.rosterId,
			filename: input.file.name
		});

		await ctx.storage.upload(SENSITIVE_FILE_BUCKET, storagePath, input.file, { upsert: true });

		await ctx.store.update('sign_in_rosters', ctx.auth.orgId, input.rosterId, {
			signed_file_path: storagePath
		});

		ctx.audit.log({
			action: 'sign_in_roster.scan_uploaded',
			resourceType: 'sign_in_roster',
			resourceId: input.rosterId
		});

		return { filePath: storagePath };
	},
	formatOutput: (result) => json(result)
};

export const POST = handle(_postConfig);

export const _deleteConfig: RouteConfig<{ rosterId: string }, { success: boolean }> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.manageSignInRosters,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({
		rosterId: event.params.id as string
	}),
	fn: async (ctx, input) => {
		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: input.rosterId
		});

		if (!roster) fail(404, 'Roster not found');

		if (roster.signed_file_path) {
			await ctx.storage.remove(SENSITIVE_FILE_BUCKET, [roster.signed_file_path]);
		}

		await ctx.store.update('sign_in_rosters', ctx.auth.orgId, input.rosterId, {
			signed_file_path: null
		});

		return { success: true };
	}
};

export const DELETE = handle(_deleteConfig);
