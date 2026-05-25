import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const CHECKLIST_DOC = readFileSync(resolve(ROOT, 'docs/billing-operations-launch-checklist.md'), 'utf8');
const VERIFICATION_DOC = readFileSync(resolve(ROOT, 'docs/billing-launch-verification.md'), 'utf8');

describe('billing operations launch checklist documentation', () => {
	it('covers required Stripe Dashboard, environment, and support launch topics', () => {
		for (const phrase of [
			'Stripe products',
			'Team and Unit products',
			'Team and Unit prices',
			'Stripe Tax',
			'Customer Portal',
			'webhook endpoint',
			'webhook secret',
			'Billing retry behavior',
			'Customer emails',
			'Invoice and receipt settings',
			'Environment Variables',
			'Support Process'
		]) {
			expect(CHECKLIST_DOC).toContain(phrase);
		}
	});

	it('separates test-mode verification, live-mode launch, and Robert-owned manual decisions', () => {
		for (const phrase of [
			'Test-Mode Verification',
			'Live-Mode Launch',
			'Requires Robert confirmation',
			'Requires Robert/business-owner confirmation',
			'Agent must not invent live Dashboard state',
			'Manual human-only dashboard steps'
		]) {
			expect(CHECKLIST_DOC).toContain(phrase);
		}
	});

	it('references lifecycle verification and supported billing recovery scenarios', () => {
		for (const phrase of [
			'Billing Launch Verification',
			'issue #1049',
			'checkout',
			'renewal',
			'failed renewal',
			'portal period-end cancellation',
			'failed payment recovery',
			'reactivation after successful payment'
		]) {
			expect(CHECKLIST_DOC).toContain(phrase);
		}

		expect(VERIFICATION_DOC).toContain('Billing Operations Launch Checklist');
		expect(VERIFICATION_DOC).toContain('Payment recovery and reactivation');
		expect(VERIFICATION_DOC).toContain('invoice.payment_succeeded');
		expect(VERIFICATION_DOC).toContain('invoice.paid');
		expect(CHECKLIST_DOC).toContain('invoice.payment_succeeded');
		expect(CHECKLIST_DOC).toContain('invoice.paid');
	});

	it('documents portal assumptions that avoid unsupported app states', () => {
		for (const phrase of [
			'The Customer Portal must not create subscription states that TroopToTask cannot explain.',
			'Cancellation at period end',
			'Team and Unit plan switching only',
			'Immediate cancellation through a generic portal path',
			'Portal plan switches to any price ID not known by the catalog',
			'support/admin handled'
		]) {
			expect(CHECKLIST_DOC).toContain(phrase);
		}
	});
});
