import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const supabase = locals.supabase;

	const page = parseInt(url.searchParams.get('page') || '1');
	const action = url.searchParams.get('action') || '';
	const limit = 50;
	const offset = (page - 1) * limit;

	// Build query
	let query = supabase
		.from('admin_audit_log')
		.select('*', { count: 'exact' });

	if (action) {
		query = query.eq('action', action);
	}

	query = query
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1);

	const { data: logs, count } = await query;

	// Get distinct actions for filter dropdown
	const { data: actions } = await supabase
		.from('admin_audit_log')
		.select('action')
		.order('action');

	const uniqueActions = [...new Set((actions ?? []).map((a: { action: string }) => a.action))];

	return {
		logs: (logs ?? []).map((log: any) => ({
			id: log.id,
			adminUserId: log.admin_user_id,
			targetUserId: log.target_user_id,
			action: log.action,
			details: log.details,
			createdAt: log.created_at
		})),
		totalCount: count ?? 0,
		page,
		limit,
		actionFilter: action,
		availableActions: uniqueActions
	};
};
