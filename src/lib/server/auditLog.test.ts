import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: vi.fn(() => ({ from }))
}));

import { auditLog } from './auditLog';

describe('auditLog', () => {
	beforeEach(() => {
		insert.mockReset();
		from.mockClear();
		insert.mockResolvedValue({ error: null });
	});

	it('masks unauthenticated actor identifiers and redacts risky freeform fields', async () => {
		await auditLog(
			{
				action: 'auth.login_failure',
				resourceType: 'user',
				details: {
					email: 'soldier.one@example.mil',
					reason: 'Bad password for SGT Smith'
				},
				severity: 'warning'
			},
			{
				userId: null,
				userEmail: 'soldier.one@example.mil',
				ip: '127.0.0.1',
				userAgent: 'Vitest'
			}
		);

		expect(insert).toHaveBeenCalledTimes(1);
		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			user_id: null,
			action: 'auth.login_failure',
			resource_type: 'user',
			details: {
				email: 's***@example.mil',
				actor_identifier: 's***@example.mil',
				reason: '[redacted]',
				redacted_fields: ['reason']
			}
		});
	});

	it('reduces personnel names to rank and last name while keeping safe identifiers', async () => {
		await auditLog(
			{
				action: 'personnel.restored',
				resourceType: 'personnel',
				resourceId: 'person-123',
				orgId: 'org-123',
				details: {
					name: 'SSG Smith, John',
					personnel_id: 'person-123',
					count: 1,
					personalPhone: '907-555-0100'
				}
			},
			{
				userId: 'user-123',
				userEmail: 'owner@example.mil',
				ip: '127.0.0.1',
				userAgent: 'Vitest'
			}
		);

		expect(insert).toHaveBeenCalledTimes(1);
		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			user_id: 'user-123',
			org_id: 'org-123',
			action: 'personnel.restored',
			resource_type: 'personnel',
			resource_id: 'person-123',
			details: {
				subject_label: 'SSG Smith',
				personnel_id: 'person-123',
				count: 1,
				personalPhone: '[redacted]',
				redacted_fields: ['personalPhone']
			}
		});
	});

	it('preserves allowlisted audit identifiers even when their keys include redacted substrings', async () => {
		await auditLog(
			{
				action: 'onboarding.note_viewed',
				resourceType: 'onboarding',
				details: {
					note_author_user_id: 'user-456',
					note: 'Needs a follow-up call this afternoon'
				}
			},
			{
				userId: 'user-123',
				userEmail: 'owner@example.mil',
				ip: '127.0.0.1',
				userAgent: 'Vitest'
			}
		);

		expect(insert).toHaveBeenCalledTimes(1);
		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			details: {
				note_author_user_id: 'user-456',
				note: '[redacted]',
				redacted_fields: ['note']
			}
		});
	});

	it('preserves supportable auth workflow audit labels', async () => {
		await auditLog(
			{
				action: 'account_setup.completion_failed',
				resourceType: 'account_setup_link',
				resourceId: 'setup-link-1',
				details: {
					stateTransition: 'pending.replaced',
					outcome: 'blocked',
					failureCategory: 'access-request-not-approved',
					rawStatus: 'This freeform status should still redact'
				}
			},
			{
				userId: 'user-123',
				userEmail: 'owner@example.mil',
				ip: '127.0.0.1',
				userAgent: 'Vitest'
			}
		);

		expect(insert).toHaveBeenCalledTimes(1);
		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			details: {
				stateTransition: 'pending.replaced',
				outcome: 'blocked',
				failureCategory: 'access-request-not-approved',
				rawStatus: '[redacted]',
				redacted_fields: ['rawStatus']
			}
		});
	});
});
