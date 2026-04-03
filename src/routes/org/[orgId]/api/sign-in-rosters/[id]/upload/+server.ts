import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import {
	buildSensitiveFilePath,
	SENSITIVE_FILE_BUCKET,
	validateSensitiveFileSelection
} from '$lib/storage/sensitiveFiles';

export const GET = handle<{ rosterId: string }, { url: string }>({
	permission: 'personnel',
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
});

export const POST = handle<{ rosterId: string; file: File }, { filePath: string }>({
	permission: 'personnel',
	mutation: true,
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
		const validationError = validateSensitiveFileSelection(input.file);
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
});

export const DELETE = handle<{ rosterId: string }, { success: boolean }>({
	permission: 'personnel',
	mutation: true,
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
});
