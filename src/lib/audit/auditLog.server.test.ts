import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: vi.fn(() => ({ from }))
}));

import { auditLog } from './auditLog.server';
import { createSupabaseAuditAdapter } from './supabaseAudit.server';
import { getAdminClient } from '$lib/server/supabase';

describe('auditLog', () => {
	beforeEach(() => {
		insert.mockReset();
		from.mockClear();
		insert.mockResolvedValue({ error: null });
	});
	afterEach(() => vi.restoreAllMocks());

	it.each(['resolved provider error', 'rejected insert', 'provider construction failure'])(
		'%s remains best-effort and reports no event or provider payload',
		async (failure) => {
			const sensitiveError = new Error('private@example.test private personnel note');
			const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
			if (failure === 'resolved provider error') insert.mockResolvedValue({ error: sensitiveError });
			if (failure === 'rejected insert') insert.mockRejectedValue(sensitiveError);
			if (failure === 'provider construction failure') {
				vi.mocked(getAdminClient).mockImplementationOnce(() => {
					throw sensitiveError;
				});
			}
			await expect(
				auditLog(
					{
						action: 'personnel.updated',
						resourceType: 'personnel',
						details: { note: 'private personnel note', email: 'private@example.test' }
					},
					{ userId: 'actor', ip: '127.0.0.1' }
				)
			).resolves.toBeUndefined();
			expect(diagnostic.mock.calls).toEqual([['Audit log write failed']]);
		}
	);

	it.each(['resolved provider error', 'rejected insert', 'provider construction failure'])(
		'required platform audit rejects on %s',
		async (failure) => {
			const sensitiveError = new Error('private@example.test private personnel note');
			if (failure === 'resolved provider error') insert.mockResolvedValue({ error: sensitiveError });
			if (failure === 'rejected insert') insert.mockRejectedValue(sensitiveError);
			if (failure === 'provider construction failure')
				vi.mocked(getAdminClient).mockImplementationOnce(() => {
					throw sensitiveError;
				});
			await expect(
				auditLog({ action: 'suspend_user', resourceType: 'user' }, { userId: 'actor' }, { required: true })
			).rejects.toThrow('Audit log write failed');
		}
	);

	it('retains a deleted Organization identifier without referencing its missing parent', () => {
		const id = '11111111-1111-4111-8111-111111111111';
		createSupabaseAuditAdapter(null, {
			userId: 'owner-1',
			userEmail: 'owner@example.test',
			ip: '127.0.0.1',
			userAgent: 'Vitest'
		}).log({ action: 'org.deleted', resourceType: 'organization', resourceId: id, severity: 'critical' });
		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			org_id: null,
			resource_id: id,
			user_id: 'owner-1',
			action: 'org.deleted',
			severity: 'critical'
		});
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

	it('keeps the operator-written suspension reason readable while other reasons stay redacted', async () => {
		await auditLog(
			{
				action: 'suspend_org',
				resourceType: 'organization',
				resourceId: 'org-123',
				details: { suspension_reason: 'Abuse report 42', reason: 'Abuse report 42' },
				severity: 'critical'
			},
			{ userId: 'operator-1', userEmail: null, ip: '127.0.0.1', userAgent: 'Vitest' }
		);

		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			details: {
				suspension_reason: 'Abuse report 42',
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

	it('keeps the feature switch lists of a settings update', async () => {
		await auditLog(
			{
				action: 'organization.settings_updated',
				resourceType: 'organization',
				orgId: 'org-123',
				details: { previous_disabled_features: [], disabled_features: ['training', 'lossesAndAwards'] }
			},
			{ userId: 'user-123', ip: '127.0.0.1', userAgent: 'Vitest' }
		);

		expect(insert.mock.calls[0]?.[0].details).toEqual({
			previous_disabled_features: [],
			disabled_features: ['training', 'lossesAndAwards']
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

	it('preserves plan feature override audit details while omitting freeform reasons', async () => {
		await auditLog(
			{
				action: 'admin.plan_feature_override.set',
				resourceType: 'organization',
				resourceId: '11111111-1111-4111-8111-111111111111',
				orgId: '11111111-1111-4111-8111-111111111111',
				details: {
					featureKey: 'bulk_export_unlimited',
					overrideState: 'granted',
					expiresAt: '2999-01-01T00:00:00.000Z',
					hasReason: true,
					reason: 'Comp account for command pilot'
				},
				severity: 'warning'
			},
			{
				userId: 'admin-1',
				userEmail: 'admin@example.mil',
				ip: '127.0.0.1',
				userAgent: 'Vitest'
			}
		);

		expect(insert).toHaveBeenCalledTimes(1);
		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			action: 'admin.plan_feature_override.set',
			org_id: '11111111-1111-4111-8111-111111111111',
			details: {
				featureKey: 'bulk_export_unlimited',
				overrideState: 'granted',
				expiresAt: '2999-01-01T00:00:00.000Z',
				hasReason: true,
				reason: '[redacted]',
				redacted_fields: ['reason']
			}
		});
	});
});
