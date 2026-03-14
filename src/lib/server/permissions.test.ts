import { describe, it, expect } from 'vitest';
import { isPrivilegedRole } from './permissions';

describe('isPrivilegedRole', () => {
	it('returns true for owner', () => {
		expect(isPrivilegedRole('owner')).toBe(true);
	});

	it('returns true for admin', () => {
		expect(isPrivilegedRole('admin')).toBe(true);
	});

	it('returns false for member', () => {
		expect(isPrivilegedRole('member')).toBe(false);
	});

	it('returns false for empty string', () => {
		expect(isPrivilegedRole('')).toBe(false);
	});

	it('returns false for unknown roles', () => {
		expect(isPrivilegedRole('superadmin')).toBe(false);
		expect(isPrivilegedRole('viewer')).toBe(false);
	});
});
