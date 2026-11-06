import { describe, expect, it } from 'vitest';
import { AUDIT_KINDS } from './catalog';
import { ORGANIZATION_AUDIT_EXCLUDED_ACTIONS } from './organizationAuditStore.server';
import { SHORT_RETENTION_AUDIT_ACTIONS } from './retention';

const RATE_LIMITED_ACTIONS = [
	'member.invite_rate_limited',
	'member.invite_resend_rate_limited',
	'auth.forgot_password_rate_limited',
	'auth.password_update_rate_limited',
	'account_setup.completion_rate_limited',
	'account_setup.renewal_rate_limited',
	'access_request.account_setup_approval_rate_limited',
	'access_request.account_setup_resend_rate_limited'
];

describe('Audit retention', () => {
	it('keeps every kind that Logs hides for 90 days only, so hidden entries are not held for 3 years', () => {
		for (const action of ORGANIZATION_AUDIT_EXCLUDED_ACTIONS)
			expect(SHORT_RETENTION_AUDIT_ACTIONS, action).toContain(action);
	});

	it('never shortens the retention of a cataloged unit record kind', () => {
		for (const action of SHORT_RETENTION_AUDIT_ACTIONS) expect(Object.hasOwn(AUDIT_KINDS, action), action).toBe(false);
	});

	it('keeps rate-limited entries for 90 days while Logs still shows them', () => {
		for (const action of RATE_LIMITED_ACTIONS) {
			expect(SHORT_RETENTION_AUDIT_ACTIONS, action).toContain(action);
			expect(ORGANIZATION_AUDIT_EXCLUDED_ACTIONS, action).not.toContain(action);
		}
	});
});
