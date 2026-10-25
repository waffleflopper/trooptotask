import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
const maybeSingle = vi.fn();
const getUserById = vi.fn();
const from = vi.fn((table: string) =>
	table === 'audit_logs' ? { insert } : { select: () => ({ eq: () => ({ maybeSingle }) }) }
);

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: vi.fn(() => ({ from, auth: { admin: { getUserById } } }))
}));

import { auditLog } from './auditLog.server';
import { createSupabaseAuditAdapter } from './supabaseAudit.server';
import { getAdminClient } from '$lib/server/supabase';

describe('auditLog', () => {
	beforeEach(() => {
		insert.mockReset();
		from.mockClear();
		insert.mockResolvedValue({ error: null });
		maybeSingle.mockReset();
		maybeSingle.mockResolvedValue({ data: null });
		getUserById.mockReset();
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

	describe('platform events', () => {
		const operator = { userId: 'operator-1', userEmail: 'Robert@Example.test', ip: '127.0.0.1', userAgent: 'Vitest' };

		it('keep the actor email, the written target name and the typed reason as written', async () => {
			await auditLog(
				{
					action: 'suspend_user',
					resourceType: 'user',
					resourceId: 'user-9',
					details: { targetName: 'pat@example.test', reason: 'Shared a password', email: 'pat@example.test' },
					severity: 'critical'
				},
				operator,
				{ required: true }
			);

			expect(insert.mock.calls[0]?.[0].details).toEqual({
				actorEmail: 'robert@example.test',
				targetName: 'pat@example.test',
				reason: 'Shared a password',
				email: 'p***@example.test'
			});
		});

		it('keep an Organization-scoped event redacted: no actor email, no typed reason', async () => {
			await auditLog(
				{
					action: 'suspend_org',
					resourceType: 'organization',
					resourceId: 'org-1',
					orgId: 'org-1',
					details: { targetName: 'Alpha Company', reason: 'Unpaid invoice' }
				},
				operator,
				{ required: true }
			);

			expect(insert.mock.calls[0]?.[0].details).toEqual({
				targetName: 'Alpha Company',
				reason: '[redacted]',
				redacted_fields: ['reason']
			});
		});

		it('name a revoked setup link by the access request it belonged to', async () => {
			maybeSingle.mockResolvedValue({ data: { name: 'Pat Doe', email: 'pat@example.test' } });

			await auditLog(
				{
					action: 'account_setup.link_revoked',
					resourceType: 'account_setup_link',
					resourceId: 'link-1',
					details: { accessRequestId: 'request-1' }
				},
				operator,
				{ required: true }
			);

			expect(from).toHaveBeenCalledWith('access_requests');
			expect(insert.mock.calls[0]?.[0].details).toMatchObject({ targetName: 'Pat Doe' });
		});

		it('read the target name from its record when the command did not supply one', async () => {
			maybeSingle.mockResolvedValue({ data: { name: 'Alpha Company' } });

			await auditLog(
				{ action: 'suspend_org', resourceType: 'organization', resourceId: 'org-1', orgId: 'org-1' },
				operator,
				{ required: true }
			);

			expect(from).toHaveBeenCalledWith('organizations');
			expect(insert.mock.calls[0]?.[0].details).toEqual({ targetName: 'Alpha Company' });
		});

		it('name a user target by the saved profile, falling back to the email', async () => {
			getUserById.mockResolvedValue({ data: { user: { email: 'pat@example.test', user_metadata: {} } } });
			maybeSingle.mockResolvedValueOnce({ data: { first_name: 'Pat', last_name: 'Lee', rank: 'SGT' } });
			await auditLog({ action: 'suspend_user', resourceType: 'user', resourceId: 'user-9' }, operator, {
				required: true
			});
			expect(from).toHaveBeenCalledWith('user_profiles');
			expect(insert.mock.calls[0]?.[0].details).toMatchObject({ targetName: 'SGT Pat Lee' });

			insert.mockClear();
			await auditLog({ action: 'suspend_user', resourceType: 'user', resourceId: 'user-9' }, operator, {
				required: true
			});
			expect(insert.mock.calls[0]?.[0].details).toMatchObject({ targetName: 'pat@example.test' });
		});

		it('still write when the target record cannot be read', async () => {
			maybeSingle.mockRejectedValue(new Error('provider down'));

			await expect(
				auditLog({ action: 'suspend_org', resourceType: 'organization', resourceId: 'org-1' }, operator, {
					required: true
				})
			).resolves.toBeUndefined();
			expect(insert.mock.calls[0]?.[0].details).toEqual({ actorEmail: 'robert@example.test' });
		});

		it('are the only events that keep an email and a reason; other events stay masked and redacted', async () => {
			await auditLog(
				{
					action: 'member.invite',
					resourceType: 'organization',
					resourceId: 'org-1',
					details: { email: 'pat@example.test', reason: 'Because' }
				},
				operator
			);

			expect(insert.mock.calls[0]?.[0].details).toEqual({
				email: 'p***@example.test',
				reason: '[redacted]',
				redacted_fields: ['reason']
			});
			expect(maybeSingle).not.toHaveBeenCalled();
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

	it('keeps an Access Request rejection reason while still redacting other freeform reasons', async () => {
		await auditLog(
			{
				action: 'access_request.rejected',
				resourceType: 'access_request',
				resourceId: '11111111-1111-4111-8111-111111111111',
				details: { rejectionReason: 'Not a unit account', reason: 'Private note' }
			},
			{ userId: 'admin-1', ip: '127.0.0.1' }
		);

		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			details: { rejectionReason: 'Not a unit account', reason: '[redacted]', redacted_fields: ['reason'] }
		});
	});
});
