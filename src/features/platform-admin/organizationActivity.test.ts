import { describe, expect, it } from 'vitest';
import { describeAuditEvent } from './organizationActivity';

const members = new Map([
	['user-1', 'ann@example.test'],
	['user-2', null]
]);

const describeFor = (action: string, userId: string | null) => describeAuditEvent({ action, userId }, members);

describe('describeAuditEvent', () => {
	it('names the member who acted', () => {
		expect(describeFor('personnel.archived', 'user-1')).toContain('ann@example.test');
	});

	it('does not invent a name for a member without an email, a person who left, or the system', () => {
		for (const userId of ['user-2', 'gone', null]) {
			const sentence = describeFor('member.invite', userId);
			expect(sentence).not.toContain('@');
			expect(sentence).not.toContain('user-2');
			expect(sentence).not.toContain('gone');
		}
		expect(new Set(['user-2', 'gone'].map((id) => describeFor('member.invite', id))).size).toBe(1);
		expect(describeFor('member.invite', null)).not.toBe(describeFor('member.invite', 'gone'));
	});

	it('writes platform actions as the platform, whoever the operator was', () => {
		for (const action of ['suspend_org', 'unsuspend_org', 'admin.org.gift_tier', 'admin.org.transfer_ownership']) {
			expect(describeFor(action, 'user-1')).not.toContain('ann@example.test');
			expect(describeFor(action, 'user-1')).toBe(describeFor(action, null));
		}
	});

	it('surfaces the recorded action for one it has no sentence for', () => {
		const sentence = describeFor('brand.new_thing', 'user-1');
		expect(sentence).toContain('brand.new_thing');
		expect(sentence).toContain('ann@example.test');
	});
});
