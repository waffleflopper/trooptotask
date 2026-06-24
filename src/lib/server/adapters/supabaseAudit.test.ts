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
		userEmail: 'user@example.com',
		ip: '192.168.1.1',
		userAgent: 'TestAgent/1.0'
	};

	beforeEach(() => {
		mockAuditLog.mockReset();
		mockAuditLog.mockResolvedValue(undefined);
	});

	it('swallows errors from auditLog (fire-and-forget)', () => {
		mockAuditLog.mockRejectedValue(new Error('DB down'));

		const audit = createSupabaseAuditAdapter(orgId, requestInfo);

		expect(() => {
			audit.log({ action: 'create', resourceType: 'personnel' });
		}).not.toThrow();
	});
});
