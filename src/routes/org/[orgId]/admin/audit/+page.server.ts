import type { PageServerLoad } from './$types';
import { getAdminClient } from '$lib/server/supabase';

/** Actions that are site-wide (auth, rate-limit, etc.) — excluded from org audit view */
const EXCLUDED_ACTIONS = [
	'auth.login_success',
	'auth.login_failure',
	'auth.mfa_verify',
	'security.rate_limit_violation'
];

export const load: PageServerLoad = async ({ params, url }) => {
	const { orgId } = params;
	const supabase = getAdminClient();

	const page = parseInt(url.searchParams.get('page') || '1');
	const action = url.searchParams.get('action') || '';
	const limit = 50;
	const offset = (page - 1) * limit;

	// Build query — scoped to this org, excluding site-wide auth events
	let query = supabase
		.from('audit_logs')
		.select('*', { count: 'exact' })
		.eq('org_id', orgId);

	for (const excluded of EXCLUDED_ACTIONS) {
		query = query.neq('action', excluded);
	}

	if (action) {
		query = query.eq('action', action);
	}

	query = query
		.order('timestamp', { ascending: false })
		.range(offset, offset + limit - 1);

	// Get available actions for filter dropdown (scoped to org)
	const [logsResult, actionsResult] = await Promise.all([
		query,
		supabase
			.from('audit_logs')
			.select('action')
			.eq('org_id', orgId)
			.not('action', 'in', `(${EXCLUDED_ACTIONS.join(',')})`)
			.order('timestamp', { ascending: false })
			.limit(1000)
	]);

	const { data: logs, count } = logsResult;

	const uniqueActions = [
		...new Set((actionsResult.data ?? []).map((a: { action: string }) => a.action))
	].sort();

	return {
		logs: (logs ?? []).map((log: any) => ({
			id: log.id,
			userId: log.user_id,
			action: log.action,
			resourceType: log.resource_type,
			resourceId: log.resource_id,
			details: log.details,
			createdAt: log.timestamp
		})),
		totalCount: count ?? 0,
		page,
		limit,
		actionFilter: action,
		availableActions: uniqueActions
	};
};
