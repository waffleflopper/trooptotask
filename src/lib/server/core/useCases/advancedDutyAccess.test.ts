import { describe, expect, it } from 'vitest';

import { createTestAuthContext } from '$lib/server/adapters/inMemory';

import { canAccessAdvancedDuty, requireAdvancedDutyTemplateManagement } from './advancedDutyAccess';

describe('canAccessAdvancedDuty', () => {
	it('allows unscoped privileged users to reload advanced duty data', () => {
		const auth = createTestAuthContext({
			isPrivileged: true,
			isFullEditor: false,
			scopedGroupId: null
		});

		expect(canAccessAdvancedDuty(auth)).toBe(true);
	});

	it('denies scoped users even when they are privileged', () => {
		const auth = createTestAuthContext({
			isPrivileged: true,
			isFullEditor: true,
			scopedGroupId: 'group-hq'
		});

		expect(canAccessAdvancedDuty(auth)).toBe(false);
	});
});

describe('requireAdvancedDutyTemplateManagement', () => {
	it('denies unscoped full editors who are not admins or owners', () => {
		const auth = createTestAuthContext({
			isPrivileged: false,
			isFullEditor: true,
			scopedGroupId: null
		});

		expect(() => requireAdvancedDutyTemplateManagement(auth)).toThrow(
			'Advanced duty templates can only be managed by organization admins and owners.'
		);
	});

	it('allows privileged full-organization users', () => {
		const auth = createTestAuthContext({
			isPrivileged: true,
			isFullEditor: false,
			scopedGroupId: null
		});

		expect(() => requireAdvancedDutyTemplateManagement(auth)).not.toThrow();
	});
});
