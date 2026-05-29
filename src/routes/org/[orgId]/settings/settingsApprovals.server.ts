import type { AuditLogQueryResult } from '$lib/server/core/useCases/auditLogQuery';
import type { QueryWithRawStorePorts } from '$lib/server/core/ports';
import type { DeletionRequestRow } from './settingsRows.server';
import type { SettingsActivityData, SettingsApprovalsSectionData } from './settingsSectionTypes';

export interface ApprovalsSettingsData {
	sections: {
		approvals: SettingsApprovalsSectionData;
	};
}

export interface BuildApprovalsSettingsDataInput {
	approvalRequests: DeletionRequestRow[];
	auditLog?: SettingsActivityData['auditLog'];
}

const emptyAuditLog: AuditLogQueryResult = {
	logs: [],
	totalCount: 0,
	last30DaysCount: 0,
	page: 1,
	limit: 9,
	actionFilter: '',
	availableActions: []
};

export async function loadApprovalsSettings(ctx: QueryWithRawStorePorts): Promise<ApprovalsSettingsData> {
	const approvalRequests = await ctx.store.findMany<DeletionRequestRow>(
		'deletion_requests',
		ctx.auth.orgId,
		undefined,
		{
			orderBy: [{ column: 'created_at', ascending: false }]
		}
	);

	return buildApprovalsSettingsData({ approvalRequests });
}

export function buildApprovalsSettingsData(input: BuildApprovalsSettingsDataInput): ApprovalsSettingsData {
	return {
		sections: {
			approvals: {
				activity: {
					pendingApprovalsCount: countPendingApprovals(input.approvalRequests),
					approvalRequests: input.approvalRequests,
					auditLog: input.auditLog ?? emptyAuditLog
				}
			}
		}
	};
}

function countPendingApprovals(approvalRequests: Array<Pick<DeletionRequestRow, 'status'>>): number {
	return approvalRequests.filter((request) => request.status === 'pending').length;
}
