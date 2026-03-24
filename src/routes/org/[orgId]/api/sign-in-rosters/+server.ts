import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { getApiContext } from '$lib/server/supabase';

function toClient(r: Record<string, unknown>) {
	return {
		id: r.id,
		title: r.title,
		rosterDate: r.roster_date,
		blankDate: r.blank_date,
		separateByGroup: r.separate_by_group,
		sortBy: r.sort_by,
		personnelSnapshot: r.personnel_snapshot,
		filterConfig: r.filter_config,
		signedFilePath: r.signed_file_path,
		createdBy: r.created_by,
		createdAt: r.created_at
	};
}

export const GET = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	parseInput: (event: RequestEvent) => {
		const { supabase } = getApiContext(event.locals, event.cookies, event.params.orgId as string);
		return {
			_supabase: supabase,
			_orgId: event.params.orgId as string,
			title: event.url.searchParams.get('title') || '',
			from: event.url.searchParams.get('from'),
			to: event.url.searchParams.get('to'),
			limit: Math.min(parseInt(event.url.searchParams.get('limit') || '20'), 100),
			offset: parseInt(event.url.searchParams.get('offset') || '0')
		};
	},
	fn: async (_ctx, input) => {
		// Uses raw supabase for ilike text search + count pagination
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const supabase = input._supabase as any;
		const orgId = input._orgId as string;

		let query = supabase
			.from('sign_in_rosters')
			.select('*', { count: 'exact' })
			.eq('organization_id', orgId)
			.order('created_at', { ascending: false })
			.range(input.offset, (input.offset as number) + (input.limit as number) - 1);

		if (input.title) query = query.ilike('title', `%${input.title}%`);
		if (input.from) query = query.gte('created_at', input.from);
		if (input.to) query = query.lte('created_at', input.to + 'T23:59:59.999Z');

		const { data, error: dbError, count } = await query;
		if (dbError) fail(500, dbError.message);

		return { rosters: (data || []).map(toClient), total: count ?? 0 };
	}
});

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	fn: async (ctx, input) => {
		if (!input.title || !(input.title as string).trim()) fail(400, 'Title is required');
		if (!(input.personnelSnapshot as unknown[])?.length) fail(400, 'Personnel snapshot is required');

		const row = await ctx.store.insert<Record<string, unknown>>('sign_in_rosters', ctx.auth.orgId, {
			title: (input.title as string).trim(),
			roster_date: input.rosterDate || null,
			blank_date: input.blankDate ?? false,
			separate_by_group: input.separateByGroup ?? false,
			sort_by: input.sortBy || 'alphabetical',
			personnel_snapshot: input.personnelSnapshot,
			filter_config: input.filterConfig || null,
			signed_file_path: null,
			created_by: ctx.auth.userId
		});

		ctx.audit.log({
			action: 'sign_in_roster.created',
			resourceType: 'sign_in_roster',
			resourceId: row.id as string,
			details: { title: input.title }
		});

		return toClient(row);
	},
	formatOutput: (result) => json(result)
});
