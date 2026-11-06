import {
	ORGANIZATION_AUDIT_EXCLUDED_ACTIONS,
	type OrganizationAuditRow,
	type OrganizationAuditStore
} from './organizationAuditStore.server';

interface MemoryAuditRows {
	findMany<T>(
		table: 'audit_logs',
		orgId: string,
		filters?: { action: string },
		options?: { notInFilters?: { action: string[] } }
	): Promise<T[]>;
}

/** Newest first on the instant, then id: the order the database pages on. */
function newestFirst(
	a: Pick<OrganizationAuditRow, 'timestamp' | 'id'>,
	b: Pick<OrganizationAuditRow, 'timestamp' | 'id'>
): number {
	return Date.parse(b.timestamp) - Date.parse(a.timestamp) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

export function createInMemoryOrganizationAuditStore(store: MemoryAuditRows): OrganizationAuditStore {
	const excluded = { notInFilters: { action: ORGANIZATION_AUDIT_EXCLUDED_ACTIONS } };
	return {
		async listLogs({ orgId, filters, after, limit }) {
			const rows = await store.findMany<OrganizationAuditRow>('audit_logs', orgId, undefined, excluded);
			const since = filters.since ? Date.parse(filters.since) : -Infinity;
			const until = filters.until ? Date.parse(filters.until) : Infinity;
			const matches = rows
				.filter((row) => {
					const at = Date.parse(row.timestamp);
					return (
						(!filters.personId || row.subject_personnel_id === filters.personId) &&
						(!filters.userId || row.user_id === filters.userId) &&
						(!filters.action || row.action === filters.action) &&
						at >= since &&
						at < until
					);
				})
				.sort(newestFirst);
			const start = after ? matches.findIndex((row) => newestFirst(after, row) < 0) : 0;
			const page = start === -1 ? [] : matches.slice(start, start + limit + 1);
			return { logs: page.slice(0, limit), hasMore: page.length > limit };
		},
		async listActions(orgId) {
			const rows = await store.findMany<{ action: string }>('audit_logs', orgId, undefined, excluded);
			return [...new Set(rows.map((row) => row.action))].sort();
		}
	};
}
