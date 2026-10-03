import type { SupabaseClient } from '@supabase/supabase-js';
import { assertAuditQuerySuccess } from './providerError.server';
import {
	ORGANIZATION_AUDIT_EXCLUDED_ACTIONS,
	type OrganizationAuditRow,
	type OrganizationAuditStore
} from './organizationAuditStore.server';

const LOG_COLUMNS = 'id, user_id, action, resource_type, resource_id, details, timestamp';

/** Privileged Organization reads; delivery admits the owner before constructing this reader. */
export function createSupabaseOrganizationAuditStore(client: SupabaseClient): OrganizationAuditStore {
	const scoped = (orgId: string, columns: string, head = false) =>
		client
			.from('audit_logs')
			.select(columns, { count: 'exact', head })
			.eq('org_id', orgId)
			.not('action', 'in', `(${ORGANIZATION_AUDIT_EXCLUDED_ACTIONS.join(',')})`);
	return {
		async listLogs({ orgId, action, offset, limit }) {
			let query = scoped(orgId, LOG_COLUMNS);
			if (action) query = query.eq('action', action);
			const response = await query
				.order('timestamp', { ascending: false })
				.range(offset, offset + limit - 1)
				.returns<OrganizationAuditRow[]>();
			assertAuditQuerySuccess('Organization Audit page', response);
			return { logs: response.data ?? [], totalCount: response.count ?? 0 };
		},
		async countRecent({ orgId, cutoff }) {
			const response = await scoped(orgId, 'id', true).gte('timestamp', cutoff);
			assertAuditQuerySuccess('Organization Audit recent count', response);
			return response.count ?? 0;
		},
		async listActions(orgId) {
			const response = await client.rpc('list_audit_log_actions', {
				p_org_id: orgId,
				p_excluded_actions: ORGANIZATION_AUDIT_EXCLUDED_ACTIONS
			});
			assertAuditQuerySuccess('Organization Audit actions', response);
			return [
				...new Set(
					((response.data ?? []) as Array<{ action: string | null }>)
						.map((row) => row.action)
						.filter((action): action is string => !!action)
				)
			].sort();
		}
	};
}
