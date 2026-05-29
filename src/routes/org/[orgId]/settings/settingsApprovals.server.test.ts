import { describe, expect, it } from 'vitest';
import { buildApprovalsSettingsData } from './settingsApprovals.server';

const emptyAuditLog = {
	logs: [],
	totalCount: 0,
	last30DaysCount: 0,
	page: 1,
	limit: 9,
	actionFilter: '',
	availableActions: []
};

function makeDeletionRequest(id: string, status: 'pending' | 'approved', createdAt: string) {
	return {
		id,
		status,
		created_at: createdAt,
		requester_email: null,
		resource_description: null,
		resource_type: 'personnel',
		resource_url: null,
		denial_reason: null
	};
}

describe('approvals settings read model', () => {
	it('builds approval activity data without export controls', () => {
		const approvalsSettings = buildApprovalsSettingsData({
			approvalRequests: [
				makeDeletionRequest('request-1', 'approved', '2026-05-01T12:00:00Z'),
				makeDeletionRequest('request-2', 'pending', '2026-05-02T12:00:00Z')
			],
			auditLog: {
				...emptyAuditLog,
				totalCount: 6,
				last30DaysCount: 4
			}
		});

		expect(approvalsSettings).toEqual({
			sections: {
				approvals: {
					activity: {
						pendingApprovalsCount: 1,
						approvalRequests: [
							makeDeletionRequest('request-1', 'approved', '2026-05-01T12:00:00Z'),
							makeDeletionRequest('request-2', 'pending', '2026-05-02T12:00:00Z')
						],
						auditLog: {
							...emptyAuditLog,
							totalCount: 6,
							last30DaysCount: 4
						}
					}
				}
			}
		});
		expect('exports' in approvalsSettings.sections).toBe(false);
	});
});
