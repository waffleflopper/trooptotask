import type { SupabaseClient } from '$lib/server/database';
import { assertAuditQuerySuccess } from './providerError.server';
import {
	ORGANIZATION_AUDIT_EXCLUDED_ACTIONS,
	type OrganizationAuditRow,
	type OrganizationAuditStore
} from './organizationAuditStore.server';

const LOG_COLUMNS =
	'id, user_id, action, resource_type, resource_id, details, timestamp, actor_label, record_label, subject_personnel_id, subject_label, batch_id';

/** Privileged Organization reads; delivery admits the owner or admin before constructing this reader. */
export function createSupabaseOrganizationAuditStore(client: SupabaseClient): OrganizationAuditStore {
	return {
		async listLogs({ orgId, filters, after, limit }) {
			let query = client
				.from('audit_logs')
				.select(LOG_COLUMNS)
				.eq('org_id', orgId)
				.not('action', 'in', `(${ORGANIZATION_AUDIT_EXCLUDED_ACTIONS.join(',')})`);
			if (filters.personId) query = query.eq('subject_personnel_id', filters.personId);
			if (filters.userId) query = query.eq('user_id', filters.userId);
			if (filters.action) query = query.eq('action', filters.action);
			if (filters.since) query = query.gte('timestamp', filters.since);
			if (filters.until) query = query.lt('timestamp', filters.until);
			// The bound on timestamp lets the index seek to the cursor; the OR then drops the entries already shown.
			if (after) {
				query = query.lte('timestamp', after.timestamp).or(`timestamp.lt."${after.timestamp}",id.lt."${after.id}"`);
			}
			const response = await query
				.order('timestamp', { ascending: false })
				.order('id', { ascending: false })
				.limit(limit + 1)
				.returns<OrganizationAuditRow[]>();
			assertAuditQuerySuccess('Organization Audit page', response);
			const rows = response.data ?? [];
			return { logs: rows.slice(0, limit), hasMore: rows.length > limit };
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
