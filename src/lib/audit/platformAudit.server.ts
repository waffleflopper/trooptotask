import type {
	PlatformActivityEvent,
	PlatformActivityInput,
	PlatformAudit,
	PlatformAuditDashboardActivity,
	PlatformAuditSeverity
} from './platformContracts';

export interface PlatformAuditRecord {
	id: string;
	userId: string | null;
	orgId: string | null;
	action: string;
	resourceType: string | null;
	resourceId: string | null;
	ipAddress: string | null;
	details: Record<string, unknown> | null;
	severity: PlatformAuditSeverity;
	timestamp: string;
}

export interface PlatformAuditStore {
	listRecentActivity(input: { limit: number }): Promise<PlatformAuditDashboardActivity[]>;
	/** A page of matching events. An offset past the end clamps to the last page, and the offset used comes back. */
	listActivity(
		input: Omit<PlatformActivityInput, 'page' | 'limit'> & { offset: number; limit: number }
	): Promise<{ events: PlatformActivityEvent[]; totalCount: number; offset: number }>;
	listRecentByOrganization(input: { orgId: string; limit: number }): Promise<PlatformAuditRecord[]>;
	listRecentByUser(input: { userId: string; limit: number }): Promise<PlatformAuditRecord[]>;
}

export interface PlatformAuditDependencies {
	store: PlatformAuditStore;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
	if (!value || !Number.isFinite(value)) return fallback;
	return Math.max(1, Math.floor(value));
}

export function createPlatformAudit(deps: PlatformAuditDependencies): PlatformAudit {
	return {
		listRecentActivity(input) {
			return deps.store.listRecentActivity({ limit: normalizeLimit(input.limit, 10) });
		},

		async listActivity(input) {
			const limit = normalizeLimit(input.limit, 50);
			const page = Math.max(1, Math.floor(input.page));
			const result = await deps.store.listActivity({
				actions: input.actions,
				prefixes: input.prefixes,
				search: input.search.trim(),
				from: input.from,
				to: input.to,
				offset: (page - 1) * limit,
				limit
			});
			return {
				events: result.events,
				totalCount: result.totalCount,
				page: Math.floor(result.offset / limit) + 1,
				limit
			};
		},

		async listRecentByOrganization(input) {
			const logs = await deps.store.listRecentByOrganization({
				orgId: input.orgId,
				limit: normalizeLimit(input.limit, 10)
			});

			return logs.map((log) => ({
				id: log.id,
				action: log.action,
				userId: log.userId,
				timestamp: log.timestamp,
				severity: log.severity,
				resourceType: log.resourceType,
				resourceId: log.resourceId
			}));
		},

		async listRecentByUser(input) {
			const logs = await deps.store.listRecentByUser({
				userId: input.userId,
				limit: normalizeLimit(input.limit, 10)
			});

			return logs.map((log) => ({
				id: log.id,
				action: log.action,
				resourceType: log.resourceType,
				resourceId: log.resourceId,
				orgId: log.orgId,
				timestamp: log.timestamp,
				severity: log.severity
			}));
		}
	};
}
