import { describe, expect, it } from 'vitest';
import { readLastOrganizationId, rememberLastOrganization } from './lastOrganization.server';

function jar(initial?: string) {
	let value = initial;
	const options: unknown[] = [];
	return {
		options,
		get: () => value,
		set: (_name: string, next: string, opts: unknown) => {
			value = next;
			options.push(opts);
		}
	};
}

describe('last Organization memory', () => {
	it('gives back what the same person remembered', () => {
		const cookies = jar();
		rememberLastOrganization(cookies, { userId: 'user-1', organizationId: 'org-9' });

		expect(readLastOrganizationId(cookies, 'user-1')).toBe('org-9');
	});

	it.each([
		['another person on the same browser', 'user-1:org-9', 'user-2'],
		['a user id that only starts the same', 'user-10:org-9', 'user-1'],
		['no cookie', undefined, 'user-1'],
		['a value with no Organization', 'user-1:', 'user-1'],
		['a value with no separator', 'user-1', 'user-1']
	])('reads nothing for %s', (_name, stored, userId) => {
		expect(readLastOrganizationId(jar(stored), userId)).toBeNull();
	});

	it('writes a long-lived, script-proof cookie for the whole site', () => {
		const cookies = jar();
		rememberLastOrganization(cookies, { userId: 'user-1', organizationId: 'org-9' });

		expect(cookies.options).toEqual([
			{ path: '/', httpOnly: true, sameSite: 'lax', secure: !import.meta.env.DEV, maxAge: 31_536_000 }
		]);
	});

	it('skips the write when the value is unchanged', () => {
		const cookies = jar('user-1:org-9');
		rememberLastOrganization(cookies, { userId: 'user-1', organizationId: 'org-9' });

		expect(cookies.options).toEqual([]);
	});
});
