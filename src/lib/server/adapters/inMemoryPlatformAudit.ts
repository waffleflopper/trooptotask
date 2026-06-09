import type { PlatformAuditRecord, PlatformAuditStore } from '$lib/server/core/useCases/platformAudit';

interface InMemoryPlatformAuditOptions {
	logs?: PlatformAuditRecord[];
}

function cloneLog(log: PlatformAuditRecord): PlatformAuditRecord {
	return {
		...log,
		details: log.details ? { ...log.details } : null
	};
}

function newestFirst(a: PlatformAuditRecord, b: PlatformAuditRecord): number {
	return b.timestamp.localeCompare(a.timestamp);
}

export function createInMemoryPlatformAuditStore(options: InMemoryPlatformAuditOptions = {}): PlatformAuditStore {
	const logs = (options.logs ?? []).map(cloneLog).sort(newestFirst);

	return {
		async listLogs(input) {
			const filtered = logs.filter((log) => {
				if (input.action && log.action !== input.action) return false;
				if (input.severity && log.severity !== input.severity) return false;
				if (input.orgId && log.orgId !== input.orgId) return false;
				return true;
			});

			return {
				logs: filtered.slice(input.offset, input.offset + input.limit).map(cloneLog),
				totalCount: filtered.length
			};
		},

		async listDistinctActions() {
			return [...new Set(logs.map((log) => log.action))].sort();
		},

		async listRecentByOrganization(input) {
			return logs
				.filter((log) => log.orgId === input.orgId)
				.slice(0, input.limit)
				.map(cloneLog);
		},

		async listRecentByUser(input) {
			return logs
				.filter((log) => log.userId === input.userId)
				.slice(0, input.limit)
				.map(cloneLog);
		}
	};
}
