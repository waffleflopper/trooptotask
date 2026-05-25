import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const PORTAL_DOC = readFileSync(resolve(ROOT, 'docs/billing-customer-portal.md'), 'utf8');
const CANCELLATION_DOC = readFileSync(resolve(ROOT, 'docs/billing-cancellation-policy.md'), 'utf8');

describe('billing customer portal documentation', () => {
	it('documents supported and support-handled portal outcomes', () => {
		const requiredPhrases = [
			'Invoice history and receipt access',
			'Payment method updates',
			'Subscription cancellation at period end',
			'Plan switches between Team and Unit',
			'no local Stripe Customer ID',
			'legacy Organization mirror customer',
			'legacy-seeded billing snapshot',
			'billing-state mismatch',
			'not present in the TroopToTask price catalog',
			'manual support/admin work'
		];

		for (const phrase of requiredPhrases) {
			expect(PORTAL_DOC).toContain(phrase);
		}
	});

	it('documents period-end default and explicit immediate cancellation policy', () => {
		for (const phrase of [
			'Default paid-launch path',
			'cancels at period end',
			'Immediate cancellation path',
			'explicit confirmation',
			'Freeform provider comments are not stored',
			'webhook remains the source of truth'
		]) {
			expect(CANCELLATION_DOC).toContain(phrase);
		}
	});
});
