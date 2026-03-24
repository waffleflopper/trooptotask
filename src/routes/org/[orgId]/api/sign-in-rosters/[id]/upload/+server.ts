import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';

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

		const url = await ctx.storage.createSignedUrl('counseling-files', roster.signed_file_path, 300);

		return { url };
	}
});

export const POST = handle<{ rosterId: string; file: File }, { signedFilePath: string }>({
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
		if (input.file.size > 10 * 1024 * 1024) fail(400, 'File must be under 10MB');

		const sanitizedName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const storagePath = `${ctx.auth.orgId}/sign-in-rosters/${input.rosterId}/${sanitizedName}`;

		await ctx.storage.upload('counseling-files', storagePath, input.file, { upsert: true });

		await ctx.store.update('sign_in_rosters', ctx.auth.orgId, input.rosterId, {
			signed_file_path: storagePath
		});

		ctx.audit.log({
			action: 'sign_in_roster.scan_uploaded',
			resourceType: 'sign_in_roster',
			resourceId: input.rosterId
		});

		return { signedFilePath: storagePath };
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
			await ctx.storage.remove('counseling-files', [roster.signed_file_path]);
		}

		await ctx.store.update('sign_in_rosters', ctx.auth.orgId, input.rosterId, {
			signed_file_path: null
		});

		return { success: true };
	}
});
