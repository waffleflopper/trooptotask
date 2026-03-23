import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseAuditAdapter } from './supabaseAudit';

vi.mock('$lib/server/auditLog', () => ({
	auditLog: vi.fn()
}));

import { auditLog } from '$lib/server/auditLog';

const mockAuditLog = vi.mocked(auditLog);

describe('SupabaseAuditAdapter', () => {
	const orgId = 'org-123';
	const requestInfo = {
		userId: 'user-456',
		ip: '192.168.1.1',
		userAgent: 'TestAgent/1.0'
	};

	beforeEach(() => {
		mockAuditLog.mockReset();
		mockAuditLog.mockResolvedValue(undefined);
	});

	it('delegates to auditLog with pre-bound orgId and requestInfo', () => {
		const audit = createSupabaseAuditAdapter(orgId, requestInfo);

		audit.log({
			action: 'create',
			resourceType: 'training_record',
			resourceId: 'tr-1',
			details: { name: 'First Aid' }
		});

		expect(mockAuditLog).toHaveBeenCalledWith(
			{
				action: 'create',
				resourceType: 'training_record',
				resourceId: 'tr-1',
				orgId: 'org-123',
				details: { name: 'First Aid' }
			},
			requestInfo
		);
	});

	it('works without optional resourceId and details', () => {
		const audit = createSupabaseAuditAdapter(orgId, requestInfo);

		audit.log({ action: 'list', resourceType: 'personnel' });

		expect(mockAuditLog).toHaveBeenCalledWith(
			{
				action: 'list',
				resourceType: 'personnel',
				resourceId: undefined,
				orgId: 'org-123',
				details: undefined
			},
			requestInfo
		);
	});

	it('swallows errors from auditLog (fire-and-forget)', () => {
		mockAuditLog.mockRejectedValue(new Error('DB down'));

		const audit = createSupabaseAuditAdapter(orgId, requestInfo);

		expect(() => {
			audit.log({ action: 'create', resourceType: 'personnel' });
		}).not.toThrow();
	});
});
