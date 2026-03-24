import type { PageServerLoad } from './$types';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'audit',
	fn: async (ctx, event) => {
		const { adminClient } = ctx;
		const { url } = event;

		const page = parseInt(url.searchParams.get('page') || '1');
		const action = url.searchParams.get('action') || '';
		const severity = url.searchParams.get('severity') || '';
		const orgId = url.searchParams.get('org') || '';
		const limit = 50;
		const offset = (page - 1) * limit;

		let query = adminClient.from('audit_logs').select('*', { count: 'exact' });

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

		const [logsResult, actionsResult] = await Promise.all([
			query,
			adminClient.from('audit_logs').select('action').order('timestamp', { ascending: false }).limit(1000)
		]);

		const { data: logs, count } = logsResult;

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
	}
});
