import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { getApiContext } from '$lib/server/supabase';

export const GET = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	parseInput: (event: RequestEvent) => {
		const { supabase } = getApiContext(event.locals, event.cookies, event.params.orgId as string);
		return { _supabase: supabase, rosterId: event.params.id as string };
	},
	fn: async (ctx, input) => {
		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: input.rosterId as string
		});

		if (!roster?.signed_file_path) fail(404, 'No signed file found');

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const supabase = input._supabase as any;
		const { data: signedUrl } = await supabase.storage
			.from('counseling-files')
			.createSignedUrl(roster.signed_file_path, 300);

		if (!signedUrl) fail(500, 'Failed to create download URL');

		return { url: signedUrl.signedUrl };
	}
});

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	parseInput: async (event: RequestEvent) => {
		const { supabase } = getApiContext(event.locals, event.cookies, event.params.orgId as string);
		const formData = await event.request.formData();
		const file = formData.get('file') as File;
		return {
			_supabase: supabase,
			_orgId: event.params.orgId as string,
			rosterId: event.params.id as string,
			file
		};
	},
	fn: async (ctx, input) => {
		const file = input.file as File;
		const rosterId = input.rosterId as string;

		if (!file) fail(400, 'No file provided');
		if (file.size > 10 * 1024 * 1024) fail(400, 'File must be under 10MB');

		const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
		const storagePath = `${ctx.auth.orgId}/sign-in-rosters/${rosterId}/${sanitizedName}`;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const supabase = input._supabase as any;
		const { error: uploadError } = await supabase.storage
			.from('counseling-files')
			.upload(storagePath, file, { upsert: true });

		if (uploadError) fail(500, uploadError.message);

		await ctx.store.update('sign_in_rosters', ctx.auth.orgId, rosterId, {
			signed_file_path: storagePath
		});

		ctx.audit.log({
			action: 'sign_in_roster.scan_uploaded',
			resourceType: 'sign_in_roster',
			resourceId: rosterId
		});

		return { signedFilePath: storagePath };
	},
	formatOutput: (result) => json(result)
});

export const DELETE = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	parseInput: (event: RequestEvent) => {
		const { supabase } = getApiContext(event.locals, event.cookies, event.params.orgId as string);
		return { _supabase: supabase, rosterId: event.params.id as string };
	},
	fn: async (ctx, input) => {
		const rosterId = input.rosterId as string;

		const roster = await ctx.store.findOne<{ signed_file_path: string | null }>('sign_in_rosters', ctx.auth.orgId, {
			id: rosterId
		});

		if (!roster) fail(404, 'Roster not found');

		if (roster.signed_file_path) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const supabase = input._supabase as any;
			await supabase.storage.from('counseling-files').remove([roster.signed_file_path]);
		}

		await ctx.store.update('sign_in_rosters', ctx.auth.orgId, rosterId, {
			signed_file_path: null
		});

		return { success: true };
	}
});
