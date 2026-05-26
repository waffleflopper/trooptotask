import { describe, expect, it } from 'vitest';

import { createTestAuthContext } from '$lib/server/adapters/inMemory';

import { canAccessAdvancedDuty, requireAdvancedDutyTemplateManagement } from './advancedDutyAccess';

describe('canAccessAdvancedDuty', () => {
	it('allows unscoped privileged users to reload advanced duty data', () => {
		const auth = createTestAuthContext({
			role: 'admin',
			isPrivileged: true,
			scopeSet: { kind: 'organization' }
		});

		expect(canAccessAdvancedDuty(auth)).toBe(true);
	});

	it('denies scoped users even when they are privileged', () => {
		const auth = createTestAuthContext({
			role: 'admin',
			isPrivileged: true,
			scopeSet: { kind: 'groups', groupIds: ['group-hq'] }
		});

		expect(canAccessAdvancedDuty(auth)).toBe(false);
	});
});

describe('requireAdvancedDutyTemplateManagement', () => {
	it('denies unscoped operators who are not admins or owners', () => {
		const auth = createTestAuthContext({
			role: 'member',
			isPrivileged: false,
			capabilityMap: {
				calendar: 'configure',
				personnel: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet: { kind: 'organization' }
		});

		expect(() => requireAdvancedDutyTemplateManagement(auth)).toThrow(
			'Advanced duty templates can only be managed by organization admins and owners.'
		);
	});

	it('allows privileged full-organization users', () => {
		const auth = createTestAuthContext({
			role: 'admin',
			isPrivileged: true,
			scopeSet: { kind: 'organization' }
		});

		expect(() => requireAdvancedDutyTemplateManagement(auth)).not.toThrow();
	});
});
