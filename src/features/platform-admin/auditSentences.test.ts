import { describe, expect, it } from 'vitest';
import { activityScope, describeAuditEvent, type AuditEventRecord } from './auditSentences';

const event = (overrides: Partial<AuditEventRecord> = {}): AuditEventRecord => ({
	id: 'event-1',
	timestamp: '2026-10-22T12:00:00.000Z',
	action: 'suspend_user',
	severity: 'critical',
	userId: '3f2a91c4-0000-4000-8000-000000000001',
	orgId: null,
	orgName: null,
	resourceType: 'user',
	resourceId: '9d8e7f60-0000-4000-8000-000000000002',
	ipAddress: null,
	details: null,
	...overrides
});

describe('describeAuditEvent', () => {
	it('names the actor by email and the target by the name written with the event', () => {
		const described = describeAuditEvent(
			event({
				details: { actorEmail: 'robert@example.test', targetName: 'pat@example.test', reason: 'Shared a password' }
			})
		);

		expect(described.sentence).toBe('robert@example.test suspended pat@example.test');
		expect(described.category).toBe('accounts');
		expect(described.severity).toBe('critical');
		expect(described.fields).toEqual([
			{ label: 'Action', value: 'suspend_user' },
			{ label: 'Actor', value: 'robert@example.test' },
			{ label: 'Target', value: 'pat@example.test' },
			{ label: 'Reason', value: 'Shared a password' }
		]);
	});

	it('reads a Feedback item closed from the Inbox as a sentence shown under All', () => {
		const described = describeAuditEvent(
			event({
				action: 'feedback.closed_without_reply',
				severity: 'info',
				resourceType: 'feedback',
				details: { actorEmail: 'robert@example.test' }
			})
		);

		expect(described.sentence).toBe('robert@example.test closed Feedback 9d8e7f60 without replying');
		expect(described.category).toBeNull();
		expect(activityScope(null).actions).toContain('feedback.closed_without_reply');
	});

	it('falls back to short IDs for an event written before labels were stored', () => {
		const described = describeAuditEvent(event());

		expect(described.sentence).toBe('User 3f2a91c4 suspended User 9d8e7f60');
		expect(described.fields).toContainEqual({ label: 'Actor', value: '3f2a91c4-0000-4000-8000-000000000001' });
	});

	it('names an Organization target from the joined Organization when no name was written', () => {
		const described = describeAuditEvent(
			event({
				action: 'suspend_org',
				resourceType: 'organization',
				resourceId: 'org-1',
				orgId: 'org-1',
				orgName: 'Alpha Company',
				details: { actorEmail: 'robert@example.test' }
			})
		);

		expect(described.sentence).toBe('robert@example.test suspended Alpha Company');
		expect(described.category).toBe('organizations');
		expect(described.fields).toContainEqual({ label: 'Organization', value: 'Alpha Company' });
	});

	it('shows an unknown action by its name and files it under no category', () => {
		const described = describeAuditEvent(event({ action: 'admin.org.future_action', severity: 'warning' }));

		expect(described.sentence).toBe('admin.org.future_action');
		expect(described.category).toBeNull();
		expect(described.severity).toBe('warning');
	});

	it('labels system events and leaves a platform action outside the four filters in no category', () => {
		const described = describeAuditEvent(
			event({ action: 'announcement_delete', userId: null, resourceType: 'platform_announcement', severity: 'warning' })
		);

		expect(described.sentence).toBe('The system deleted the announcement 9d8e7f60');
		expect(described.category).toBeNull();
	});

	it('lays nested details out as labeled fields and drops redacted values', () => {
		const described = describeAuditEvent(
			event({
				details: {
					fromUserId: 'user-a',
					rateLimit: { limit: 5, windowSeconds: 900 },
					sensitiveAction: '[redacted]',
					redacted_fields: ['sensitiveAction']
				}
			})
		);

		expect(described.fields.slice(3)).toEqual([
			{ label: 'Previous owner ID', value: 'user-a' },
			{ label: 'Rate limit · Limit', value: '5' },
			{ label: 'Rate limit · Window seconds', value: '900' }
		]);
	});

	it('falls back to the registry severity when the stored one is unrecognized', () => {
		expect(describeAuditEvent(event({ severity: 'unexpected' })).severity).toBe('critical');
		expect(describeAuditEvent(event({ action: 'made.up', severity: 'unexpected' })).severity).toBe('info');
	});
});

describe('describeAuditEvent actors and notes', () => {
	const operator = '3f2a91c4-0000-4000-8000-000000000001';

	it('writes the signed-in operator as You and any other actor by name, then email', () => {
		const suspended = event({
			details: { actorEmail: 'robert@example.test', targetName: 'PFC K. Kowalski', reason: 'Personal email' }
		});

		expect(describeAuditEvent(suspended, { viewerId: operator }).sentence).toBe('You suspended PFC K. Kowalski');
		expect(describeAuditEvent(suspended, { viewerId: 'someone-else' }).sentence).toBe(
			'robert@example.test suspended PFC K. Kowalski'
		);
		expect(describeAuditEvent({ ...suspended, actorName: 'CPT Robert Cole' }).sentence).toBe(
			'CPT Robert Cole suspended PFC K. Kowalski'
		);
		expect(describeAuditEvent({ ...suspended, details: null, actorEmail: 'live@example.test' }).sentence).toContain(
			'live@example.test suspended'
		);
		expect(describeAuditEvent({ ...suspended, actorName: 'CPT Robert Cole' }).fields).toContainEqual({
			label: 'Actor',
			value: 'CPT Robert Cole (robert@example.test)'
		});
	});

	it('puts a user suspension reason on the second line and never shows one for an Organization', () => {
		const user = describeAuditEvent(event({ details: { targetName: 'Pat', reason: 'Shared a password' } }));
		const organization = describeAuditEvent(
			event({
				action: 'suspend_org',
				resourceType: 'organization',
				orgId: 'org-1',
				orgName: 'Alpha Company',
				details: { reason: 'Typed by the operator' }
			})
		);
		const redacted = describeAuditEvent(
			event({
				action: 'suspend_org',
				resourceType: 'organization',
				orgId: 'org-1',
				orgName: 'Alpha Company',
				details: { reason: '[redacted]' }
			})
		);

		expect(user.secondary).toBe('Reason: Shared a password');
		expect(organization.secondary).toBeNull();
		expect(redacted.secondary).toBeNull();
	});

	it('explains a refused action on the second line and names the Organization it happened in', () => {
		const described = describeAuditEvent(
			event({
				action: 'admin.org.membership_authorization_denied',
				severity: 'warning',
				resourceType: 'organization',
				orgId: 'org-1',
				orgName: 'Alpha Company',
				details: { actorEmail: 'robert@example.test', targetName: 'Bravo Company' }
			})
		);

		expect(described.sentence).toBe('robert@example.test could not change the membership of Bravo Company');
		expect(described.secondary).toBe('Recent MFA was required · Alpha Company');
		expect(described.category).toBe('security');
	});

	it('leaves the second line empty when there is nothing to add', () => {
		expect(describeAuditEvent(event({ details: { targetName: 'Pat' } })).secondary).toBeNull();
	});
});

describe('activityScope', () => {
	it('limits a category to its own actions and prefixes', () => {
		const scope = activityScope('security');

		expect(scope.actions).toContain('auth.login_failure');
		expect(scope.actions).not.toContain('suspend_user');
		expect(scope.prefixes).toEqual([]);
	});

	it('covers every platform action and prefix when no category is chosen', () => {
		const scope = activityScope(null);

		expect(scope.actions).toEqual(expect.arrayContaining(['suspend_user', 'suspend_org', 'announcement_create']));
		expect(scope.prefixes).toEqual(expect.arrayContaining(['admin.', 'access_request.', 'announcement_']));
	});
});

it.each([
	'access_request.account_setup_link_recording_failed',
	'access_request.account_setup_link_sent',
	'access_request.account_setup_link_resent',
	'access_request.inviter_address_check_requested'
])('attributes %s to the operator and the person named when it was written', (action) => {
	const result = describeAuditEvent(
		event({ action, details: { actorEmail: 'operator@example.test', targetName: 'Pat Rivera' } })
	);
	expect(result.sentence).toContain('operator@example.test');
	expect(result.sentence).toContain('Pat Rivera');
	expect(result.category).toBe('access');
});
