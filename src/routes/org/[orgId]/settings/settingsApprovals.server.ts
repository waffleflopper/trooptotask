import type { AuditLogQueryResult } from '$lib/audit/contracts';
import { listDeletionRequests, type DeletionRequestReadContext } from '$features/deletion-requests/index.server';
import type { DeletionRequestApproval } from '$features/deletion-requests/contracts';
import type { SettingsActivityData, SettingsApprovalsSectionData } from './settingsSectionTypes';

export interface ApprovalsSettingsData {
	sections: {
		approvals: SettingsApprovalsSectionData;
	};
}

export interface BuildApprovalsSettingsDataInput {
	approvalRequests: DeletionRequestApproval[];
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

export async function loadApprovalsSettings(ctx: DeletionRequestReadContext): Promise<ApprovalsSettingsData> {
	const approvalRequests = await listDeletionRequests(ctx);
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

function countPendingApprovals(approvalRequests: Array<Pick<DeletionRequestApproval, 'status'>>): number {
	return approvalRequests.filter((request) => request.status === 'pending').length;
}
