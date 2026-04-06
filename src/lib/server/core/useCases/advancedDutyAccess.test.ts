import { describe, expect, it } from 'vitest';

import { createTestAuthContext } from '$lib/server/adapters/inMemory';

import { canAccessAdvancedDuty } from './advancedDutyAccess';

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
