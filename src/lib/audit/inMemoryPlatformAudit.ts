import type { PlatformAuditRecord, PlatformAuditStore } from './platformAudit.server';

interface InMemoryPlatformAuditOptions {
	logs?: PlatformAuditRecord[];
	organizationNames?: Record<string, string>;
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
		async listRecentActivity(input) {
			return logs.slice(0, input.limit).map((log) => ({
				id: log.id,
				action: log.action,
				user_id: log.userId,
				timestamp: log.timestamp
			}));
		},

		async listActivity(input) {
			const search = input.search.toLowerCase();
			const matching = logs.filter((log) => {
				const timestamp = new Date(log.timestamp).getTime();
				if (!input.actions.includes(log.action) && !input.prefixes.some((prefix) => log.action.startsWith(prefix)))
					return false;
				if (input.from && timestamp < input.from.getTime()) return false;
				if (input.to && timestamp >= input.to.getTime()) return false;
				if (!search) return true;
				const searched = [
					log.action,
					typeof log.details?.actorEmail === 'string' ? log.details.actorEmail : '',
					typeof log.details?.targetName === 'string' ? log.details.targetName : '',
					log.resourceId ?? '',
					log.orgId ? (options.organizationNames?.[log.orgId] ?? '') : ''
				];
				return searched.some((value) => value.toLowerCase().includes(search));
			});
			const lastOffset = Math.floor(Math.max(matching.length - 1, 0) / input.limit) * input.limit;
			const offset = Math.min(input.offset, lastOffset);
			return {
				events: matching.slice(offset, offset + input.limit).map((log) => ({
					id: log.id,
					timestamp: log.timestamp,
					action: log.action,
					severity: log.severity,
					userId: log.userId,
					orgId: log.orgId,
					orgName: log.orgId ? (options.organizationNames?.[log.orgId] ?? null) : null,
					resourceType: log.resourceType,
					resourceId: log.resourceId,
					ipAddress: log.ipAddress,
					details: log.details ? { ...log.details } : null
				})),
				totalCount: matching.length,
				offset
			};
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
