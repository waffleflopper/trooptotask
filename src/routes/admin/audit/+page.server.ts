import type { PageServerLoad } from './$types';
import { getAdminClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ url }) => {
	// Use admin client to read audit_logs (RLS only allows org owners / platform admins)
	const supabase = getAdminClient();

	const page = parseInt(url.searchParams.get('page') || '1');
	const action = url.searchParams.get('action') || '';
	const severity = url.searchParams.get('severity') || '';
	const orgId = url.searchParams.get('org') || '';
	const limit = 50;
	const offset = (page - 1) * limit;

	// Build query
	let query = supabase.from('audit_logs').select('*', { count: 'exact' });

	if (action) {
		query = query.eq('action', action);
	}
	if (severity) {
		query = query.eq('severity', severity);
	}
	if (orgId) {
		query = query.eq('org_id', orgId);
	}

	query = query.order('timestamp', { ascending: false }).range(offset, offset + limit - 1);

	// Run both queries in parallel
	const [logsResult, actionsResult] = await Promise.all([
		query,
		supabase.from('audit_logs').select('action').order('timestamp', { ascending: false }).limit(1000)
	]);

	const { data: logs, count } = logsResult;

	// Extract unique actions from limited result set
	const uniqueActions = [...new Set((actionsResult.data ?? []).map((a: { action: string }) => a.action))].sort();

	return {
		logs: ((logs ?? []) as unknown as Record<string, unknown>[]).map((log) => ({
			id: log.id as string,
			userId: log.user_id as string | null,
			orgId: log.org_id as string | null,
			action: log.action as string,
			resourceType: log.resource_type as string | null,
			resourceId: log.resource_id as string | null,
			ipAddress: log.ip_address as string | null,
			details: log.details as Record<string, unknown> | null,
			severity: log.severity as string,
			createdAt: log.timestamp as string
		})),
		totalCount: count ?? 0,
		page,
		limit,
		actionFilter: action,
		severityFilter: severity,
		orgFilter: orgId,
		availableActions: uniqueActions
	};
};
