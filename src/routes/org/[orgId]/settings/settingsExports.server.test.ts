import { describe, expect, it } from 'vitest';
import { buildExportsSettingsData } from './settingsExports.server';

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

describe('exports settings read model', () => {
	it('builds export limits and activity data without unrelated settings sections', () => {
		const exportsSettings = buildExportsSettingsData({
			exportInfo: {
				exportsUsed: 3,
				exportsLimit: 3,
				isLimited: true
			},
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

		expect(exportsSettings).toEqual({
			sections: {
				exports: {
					exportInfo: {
						exportsUsed: 3,
						exportsLimit: 3,
						isLimited: true,
						limitReached: true,
						planBadge: 'Plan limited'
					},
					commands: {
						canExportJson: false,
						canExportExcel: false
					},
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
		expect('members' in exportsSettings.sections).toBe(false);
		expect('archivedPersonnel' in exportsSettings.sections).toBe(false);
		expect('dangerZone' in exportsSettings.sections).toBe(false);
	});
});
