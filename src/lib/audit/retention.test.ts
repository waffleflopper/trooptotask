import { describe, expect, it } from 'vitest';
import { AUDIT_KINDS } from './catalog';
import { ORGANIZATION_AUDIT_EXCLUDED_ACTIONS } from './organizationAuditStore.server';

describe('Audit retention', () => {
	it('never shortens the retention of a cataloged unit record kind', () => {
		for (const action of ORGANIZATION_AUDIT_EXCLUDED_ACTIONS)
			expect(Object.hasOwn(AUDIT_KINDS, action), action).toBe(false);
	});
});
