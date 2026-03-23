import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';

export const GET = async (event: RequestEvent) => {
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	const title = event.url.searchParams.get('title') || '';
	const from = event.url.searchParams.get('from');
	const to = event.url.searchParams.get('to');
	const limit = Math.min(parseInt(event.url.searchParams.get('limit') || '20'), 100);
	const offset = parseInt(event.url.searchParams.get('offset') || '0');

	let query = supabase
		.from('sign_in_rosters')
		.select('*', { count: 'exact' })
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1);

	if (title) {
		query = query.ilike('title', `%${title}%`);
	}
	if (from) {
		query = query.gte('created_at', from);
	}
	if (to) {
		query = query.lte('created_at', to + 'T23:59:59.999Z');
	}

	const { data, error: dbError, count } = await query;

	if (dbError) throw error(500, dbError.message);

	const rosters = (data || []).map((r: Record<string, unknown>) => ({
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
	}));

	return json({ rosters, total: count ?? 0 });
};

export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase, userId, isSandbox } = getApiContext(event.locals, event.cookies, orgId);

	if (isSandbox) throw error(403, 'Not available in sandbox mode');

	const body = await event.request.json();

	if (!body.title?.trim()) {
		return json({ error: 'Title is required' }, { status: 400 });
	}
	if (!body.personnelSnapshot?.length) {
		return json({ error: 'Personnel snapshot is required' }, { status: 400 });
	}

	const row = {
		organization_id: orgId,
		title: body.title.trim(),
		roster_date: body.rosterDate || null,
		blank_date: body.blankDate ?? false,
		separate_by_group: body.separateByGroup ?? false,
		sort_by: body.sortBy || 'alphabetical',
		personnel_snapshot: body.personnelSnapshot,
		filter_config: body.filterConfig || null,
		signed_file_path: null,
		created_by: userId
	};

	const { data, error: dbError } = await supabase.from('sign_in_rosters').insert(row).select().single();

	if (dbError) throw error(500, dbError.message);

	ctx.audit.log({
		action: 'sign_in_roster.created',
		resourceType: 'sign_in_roster',
		resourceId: data.id,
		details: { actor: event.locals.user?.email ?? userId, title: body.title }
	});

	return json({
		id: data.id,
		title: data.title,
		rosterDate: data.roster_date,
		blankDate: data.blank_date,
		separateByGroup: data.separate_by_group,
		sortBy: data.sort_by,
		personnelSnapshot: data.personnel_snapshot,
		filterConfig: data.filter_config,
		signedFilePath: data.signed_file_path,
		createdBy: data.created_by,
		createdAt: data.created_at
	});
};
