export type PlatformAuditSeverity = 'info' | 'warning' | 'critical' | string;

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

export interface PlatformAuditLogEntry {
	id: string;
	userId: string | null;
	orgId: string | null;
	action: string;
	resourceType: string | null;
	resourceId: string | null;
	ipAddress: string | null;
	details: Record<string, unknown> | null;
	severity: PlatformAuditSeverity;
	createdAt: string;
}

export interface PlatformAuditOrganizationActivity {
	id: string;
	action: string;
	userId: string | null;
	timestamp: string;
	severity: PlatformAuditSeverity;
	resourceType: string | null;
	resourceId: string | null;
}

export interface PlatformAuditUserActivity {
	id: string;
	action: string;
	resourceType: string | null;
	resourceId: string | null;
	orgId: string | null;
	timestamp: string;
	severity: PlatformAuditSeverity;
}

export interface PlatformAuditListInput {
	page: number;
	limit?: number;
	action?: string;
	severity?: string;
	orgId?: string;
}

export interface PlatformAuditListResult {
	logs: PlatformAuditLogEntry[];
	totalCount: number;
	page: number;
	limit: number;
	actionFilter: string;
	severityFilter: string;
	orgFilter: string;
	availableActions: string[];
}

export interface PlatformAuditStore {
	listLogs(input: {
		offset: number;
		limit: number;
		action?: string;
		severity?: string;
		orgId?: string;
	}): Promise<{ logs: PlatformAuditRecord[]; totalCount: number }>;
	listDistinctActions(): Promise<string[]>;
	listRecentByOrganization(input: { orgId: string; limit: number }): Promise<PlatformAuditRecord[]>;
	listRecentByUser(input: { userId: string; limit: number }): Promise<PlatformAuditRecord[]>;
}

export interface PlatformAuditDependencies {
	store: PlatformAuditStore;
}

export interface PlatformAudit {
	listLogs(input: PlatformAuditListInput): Promise<PlatformAuditListResult>;
	listRecentByOrganization(input: { orgId: string; limit?: number }): Promise<PlatformAuditOrganizationActivity[]>;
	listRecentByUser(input: { userId: string; limit?: number }): Promise<PlatformAuditUserActivity[]>;
}

function mapLog(record: PlatformAuditRecord): PlatformAuditLogEntry {
	return {
		id: record.id,
		userId: record.userId,
		orgId: record.orgId,
		action: record.action,
		resourceType: record.resourceType,
		resourceId: record.resourceId,
		ipAddress: record.ipAddress,
		details: record.details,
		severity: record.severity,
		createdAt: record.timestamp
	};
}

function normalizeFilter(value: string | undefined): string {
	return value?.trim() ?? '';
}

function normalizeLimit(value: number | undefined, fallback: number): number {
	if (!value || !Number.isFinite(value)) return fallback;
	return Math.max(1, Math.floor(value));
}

export function createPlatformAudit(deps: PlatformAuditDependencies): PlatformAudit {
	return {
		async listLogs(input) {
			const limit = normalizeLimit(input.limit, 50);
			const page = Math.max(1, input.page);
			const actionFilter = normalizeFilter(input.action);
			const severityFilter = normalizeFilter(input.severity);
			const orgFilter = normalizeFilter(input.orgId);
			const offset = (page - 1) * limit;

			const [logPage, availableActions] = await Promise.all([
				deps.store.listLogs({
					offset,
					limit,
					action: actionFilter || undefined,
					severity: severityFilter || undefined,
					orgId: orgFilter || undefined
				}),
				deps.store.listDistinctActions()
			]);

			return {
				logs: logPage.logs.map(mapLog),
				totalCount: logPage.totalCount,
				page,
				limit,
				actionFilter,
				severityFilter,
				orgFilter,
				availableActions
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
