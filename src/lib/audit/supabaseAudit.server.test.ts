import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseAuditAdapter } from './supabaseAudit.server';

vi.mock('./auditLog.server', () => ({
	auditLog: vi.fn()
}));

import { auditLog } from './auditLog.server';

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

	it('settles only after the write, and swallows its failure', async () => {
		let failWrite!: (error: Error) => void;
		mockAuditLog.mockReturnValue(
			new Promise((_, reject) => {
				failWrite = reject;
			})
		);

		const settled = createSupabaseAuditAdapter(orgId, requestInfo).log({
			action: 'create',
			resourceType: 'personnel'
		}) as Promise<void>;

		expect(await Promise.race([settled, Promise.resolve('pending')])).toBe('pending');
		failWrite(new Error('DB down'));
		await expect(settled).resolves.toBeUndefined();
	});
});
