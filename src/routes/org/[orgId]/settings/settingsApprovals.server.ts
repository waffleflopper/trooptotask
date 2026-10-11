import { listDeletionRequests, type DeletionRequestReadContext } from '$features/deletion-requests/index.server';
import type { DeletionRequestApproval } from '$features/deletion-requests/contracts';
import type { SettingsApprovalsSectionData } from './settingsSectionTypes';

export interface ApprovalsSettingsData {
	sections: {
		approvals: SettingsApprovalsSectionData;
	};
}

export interface BuildApprovalsSettingsDataInput {
	approvalRequests: DeletionRequestApproval[];
}

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
					approvalRequests: input.approvalRequests
				}
			}
		}
	};
}

function countPendingApprovals(approvalRequests: Array<Pick<DeletionRequestApproval, 'status'>>): number {
	return approvalRequests.filter((request) => request.status === 'pending').length;
}
