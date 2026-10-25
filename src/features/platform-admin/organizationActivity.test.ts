import { describe, expect, it } from 'vitest';
import { describeAuditEvent } from './organizationActivity';

const members = new Map([
	['user-1', 'ann@example.test'],
	['user-2', null]
]);

describe('describeAuditEvent', () => {
	it('names the member who acted', () => {
		expect(describeAuditEvent({ action: 'personnel.archived', userId: 'user-1' }, members)).toBe(
			'ann@example.test archived a Personnel Record'
		);
	});

	it('does not invent a name for a member without an email, a person who left, or the system', () => {
		expect(describeAuditEvent({ action: 'member.invite', userId: 'user-2' }, members)).toBe(
			'Someone who has since left invited a member'
		);
		expect(describeAuditEvent({ action: 'member.invite', userId: 'gone' }, members)).toBe(
			'Someone who has since left invited a member'
		);
		expect(describeAuditEvent({ action: 'member.invite', userId: null }, members)).toBe('The system invited a member');
	});

	it('writes platform actions as the platform, whoever the operator was', () => {
		expect(describeAuditEvent({ action: 'suspend_org', userId: 'user-1' }, members)).toBe(
			'A platform operator suspended the Organization'
		);
		expect(describeAuditEvent({ action: 'unsuspend_org', userId: null }, members)).toBe(
			'A platform operator lifted the Organization suspension'
		);
	});

	it('falls back to the recorded action for one it has no sentence for', () => {
		expect(describeAuditEvent({ action: 'brand.new_thing', userId: 'user-1' }, members)).toBe(
			'ann@example.test recorded brand.new_thing'
		);
	});
});
