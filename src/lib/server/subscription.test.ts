import { describe, expect, it } from 'vitest';
import { readOnlyMessage } from './subscription';

describe('subscription read-only messaging', () => {
	it('distinguishes payment failure from personnel-limit read-only mode', () => {
		expect(readOnlyMessage('payment_failure')).toContain('payment failed');
		expect(readOnlyMessage('personnel_limit')).toContain('remove personnel');
		expect(readOnlyMessage('billing_state')).toContain('billing is not currently active');
	});
});
