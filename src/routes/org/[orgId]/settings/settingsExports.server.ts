import type { AuditLogQueryResult } from '$lib/server/core/useCases/auditLogQuery';
import { fetchAuditLogPreview } from '$lib/server/core/useCases/auditLogQuery';
import type { DataStore, QueryWithRawStorePorts, UseCaseContext } from '$lib/server/core/ports';
import { readOrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import { readEffectivePlanPolicy } from '$lib/server/core/useCases/planPolicy';
import type { DeletionRequestRow } from './settingsRows.server';
import type { SettingsExportInfo, SettingsExportsSectionData } from './settingsSectionTypes';

export interface ExportsSettingsData {
	sections: {
		exports: SettingsExportsSectionData;
	};
}

export type SettingsExportInfoSource = Pick<SettingsExportInfo, 'exportsUsed' | 'exportsLimit' | 'isLimited'>;

export interface BuildExportsSettingsDataInput {
	exportInfo: SettingsExportInfoSource;
	approvalRequests: DeletionRequestRow[];
	auditLog: AuditLogQueryResult;
}

export async function loadExportsSettings(
	ctx: QueryWithRawStorePorts,
	adminStore: DataStore
): Promise<ExportsSettingsData> {
	const [exportInfo, approvalRequests, auditLog] = await Promise.all([
		loadExportInfo(ctx),
		ctx.store.findMany<DeletionRequestRow>('deletion_requests', ctx.auth.orgId, undefined, {
			orderBy: [{ column: 'created_at', ascending: false }]
		}),
		fetchAuditLogPreview(ctx, adminStore, { limit: 9 })
	]);

	return buildExportsSettingsData({
		exportInfo,
		approvalRequests,
		auditLog
	});
}

export function buildExportsSettingsData(input: BuildExportsSettingsDataInput): ExportsSettingsData {
	const exportInfo = shapeExportInfo(input.exportInfo);

	return {
		sections: {
			exports: {
				exportInfo,
				commands: {
					canExportJson: !exportInfo.limitReached,
					canExportExcel: !exportInfo.limitReached
				},
				activity: {
					pendingApprovalsCount: countPendingApprovals(input.approvalRequests),
					approvalRequests: input.approvalRequests,
					auditLog: input.auditLog
				}
			}
		}
	};
}

async function loadExportInfo(ctx: Pick<UseCaseContext, 'auth' | 'rawStore'>): Promise<SettingsExportInfoSource> {
	const [policy, usage] = await Promise.all([
		readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore }),
		readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore })
	]);
	const exportLimit = policy.exportQuota.limit;
	return {
		exportsUsed: usage.monthlyExportCount,
		exportsLimit: exportLimit ?? Infinity,
		isLimited: exportLimit !== null
	};
}

function shapeExportInfo(source: SettingsExportInfoSource): SettingsExportInfo {
	const limitReached = source.isLimited && source.exportsUsed >= source.exportsLimit;
	return {
		...source,
		limitReached,
		planBadge: source.isLimited ? 'Plan limited' : 'Unlimited exports'
	};
}

function countPendingApprovals(approvalRequests: Array<Pick<DeletionRequestRow, 'status'>>): number {
	return approvalRequests.filter((request) => request.status === 'pending').length;
}
