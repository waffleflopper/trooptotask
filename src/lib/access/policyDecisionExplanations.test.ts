import { describe, expect, it } from 'vitest';
import { POLICY_REASON_CODES, type PolicyReasonCode } from './policyEvaluator';
import { explainPolicyReasonCode } from './policyDecisionExplanations';

describe('policy decision explanations', () => {
	it('maps every policy reason code to user-facing copy without exposing raw codes', () => {
		for (const reasonCode of Object.values(POLICY_REASON_CODES)) {
			const explanation = explainPolicyReasonCode(reasonCode);

			expect(explanation.length).toBeGreaterThan(20);
			expect(explanation).not.toContain(reasonCode);
		}
	});

	it('keeps governance-role denials distinct from high feature access', () => {
		expect(explainPolicyReasonCode('denied:governance-role' satisfies PolicyReasonCode)).toMatch(/admin|owner|role/i);
	});
});
