// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readLastOrganizationId, rememberLastOrganization } from './lastOrganization';

afterEach(() => {
	document.cookie = 'last_organization=; Path=/; Max-Age=0';
});

function stored(): string | undefined {
	return document.cookie
		.split('; ')
		.find((cookie) => cookie.startsWith('last_organization='))
		?.slice('last_organization='.length);
}

describe('last Organization memory', () => {
	it('gives back what the same person remembered', () => {
		rememberLastOrganization({ userId: 'user-1', organizationId: 'org-9' });

		expect(readLastOrganizationId(stored(), 'user-1')).toBe('org-9');
	});

	it('moves to the Organization opened next', () => {
		rememberLastOrganization({ userId: 'user-1', organizationId: 'org-1' });
		rememberLastOrganization({ userId: 'user-1', organizationId: 'org-2' });

		expect(stored()).toBe('user-1:org-2');
	});

	it.each([
		['another person on the same browser', 'user-1:org-9', 'user-2'],
		['a user id that only starts the same', 'user-10:org-9', 'user-1'],
		['no cookie', undefined, 'user-1'],
		['a value with no Organization', 'user-1:', 'user-1'],
		['a value with no separator', 'user-1', 'user-1']
	])('reads nothing for %s', (_name, value, userId) => {
		expect(readLastOrganizationId(value, userId)).toBeNull();
	});
});
