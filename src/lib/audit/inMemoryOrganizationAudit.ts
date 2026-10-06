import {
	ORGANIZATION_AUDIT_EXCLUDED_ACTIONS,
	type OrganizationAuditRow,
	type OrganizationAuditStore
} from './organizationAuditStore.server';

interface MemoryReadOptions {
	notInFilters?: { action: string[] };
	orderBy?: Array<{ column: string; ascending: boolean }>;
	range?: { from: number; to: number };
	count?: 'exact';
	rangeFilters?: Array<{ column: string; op: 'gte'; value: string }>;
	limit?: number;
}
interface MemoryAuditRows {
	findMany<T>(
		table: 'audit_logs',
		orgId: string,
		filters?: { action: string },
		options?: MemoryReadOptions
	): Promise<T[]>;
	findManyWithCount<T>(
		table: 'audit_logs',
		orgId: string,
		filters?: { action: string },
		options?: MemoryReadOptions
	): Promise<{ data: T[]; count: number | null }>;
}

/** Synthetic persistence used by owned query/composition tests. */
export function createInMemoryOrganizationAuditStore(store: MemoryAuditRows): OrganizationAuditStore {
	const excluded = { notInFilters: { action: ORGANIZATION_AUDIT_EXCLUDED_ACTIONS } };
	return {
		async listLogs({ orgId, action, offset, limit }) {
			const response = await store.findManyWithCount<OrganizationAuditRow>(
				'audit_logs',
				orgId,
				action ? { action } : undefined,
				{
					...excluded,
					orderBy: [{ column: 'timestamp', ascending: false }],
					range: { from: offset, to: offset + limit - 1 },
					count: 'exact'
				}
			);
			return { logs: response.data, totalCount: response.count ?? 0 };
		},
		async countRecent({ orgId, cutoff }) {
			const response = await store.findManyWithCount('audit_logs', orgId, undefined, {
				...excluded,
				rangeFilters: [{ column: 'timestamp', op: 'gte', value: cutoff }],
				limit: 0,
				count: 'exact'
			});
			return response.count ?? 0;
		},
		async listActions(orgId) {
			const rows = await store.findMany<{ action: string }>('audit_logs', orgId, undefined, excluded);
			return [...new Set(rows.map((row) => row.action))].sort();
		}
	};
}
