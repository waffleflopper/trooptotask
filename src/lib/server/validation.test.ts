import { describe, it, expect } from 'vitest';
import {
	sanitizeString,
	validateEmail,
	validateUUID,
	validateEnum,
	requireString,
	validatePassword
} from './validation';

describe('sanitizeString', () => {
	it('trims whitespace', () => {
		expect(sanitizeString('  hello  ')).toBe('hello');
	});

	it('collapses internal whitespace', () => {
		expect(sanitizeString('hello   world')).toBe('hello world');
	});

	it('caps at maxLength', () => {
		expect(sanitizeString('abcdef', 3)).toBe('abc');
	});

	it('returns empty string for null', () => {
		expect(sanitizeString(null)).toBe('');
	});

	it('returns empty string for undefined', () => {
		expect(sanitizeString(undefined)).toBe('');
	});

	it('handles tabs and newlines', () => {
		expect(sanitizeString('hello\t\nworld')).toBe('hello world');
	});
});

describe('validateEmail', () => {
	it('accepts valid emails', () => {
		expect(validateEmail('user@example.com')).toBe(true);
		expect(validateEmail('test.user+tag@domain.co.uk')).toBe(true);
	});

	it('rejects invalid emails', () => {
		expect(validateEmail('')).toBe(false);
		expect(validateEmail('not-an-email')).toBe(false);
		expect(validateEmail('@missing-local.com')).toBe(false);
		expect(validateEmail('missing-domain@')).toBe(false);
	});

	it('rejects emails over 254 characters', () => {
		const longEmail = 'a'.repeat(246) + '@test.com';
		expect(validateEmail(longEmail)).toBe(false);
	});
});

describe('validateUUID', () => {
	it('accepts valid UUIDs', () => {
		expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
		expect(validateUUID('00000000-0000-0000-0000-000000000000')).toBe(true);
	});

	it('rejects invalid UUIDs', () => {
		expect(validateUUID('not-a-uuid')).toBe(false);
		expect(validateUUID('550e8400-e29b-41d4-a716')).toBe(false);
		expect(validateUUID('')).toBe(false);
	});

	it('rejects null and undefined', () => {
		expect(validateUUID(null)).toBe(false);
		expect(validateUUID(undefined)).toBe(false);
	});
});

describe('validateEnum', () => {
	const roles = ['owner', 'admin', 'member'] as const;

	it('returns value when valid', () => {
		expect(validateEnum('owner', roles)).toBe('owner');
		expect(validateEnum('admin', roles)).toBe('admin');
	});

	it('returns null for invalid values', () => {
		expect(validateEnum('superadmin', roles)).toBeNull();
		expect(validateEnum('', roles)).toBeNull();
	});

	it('returns null for null/undefined', () => {
		expect(validateEnum(null, roles)).toBeNull();
		expect(validateEnum(undefined, roles)).toBeNull();
	});
});

describe('requireString', () => {
	it('returns sanitized string when non-empty', () => {
		expect(requireString('  hello  ')).toBe('hello');
	});

	it('returns null for empty string', () => {
		expect(requireString('')).toBeNull();
		expect(requireString('   ')).toBeNull();
	});

	it('returns null for null', () => {
		expect(requireString(null)).toBeNull();
	});

	it('respects maxLength', () => {
		expect(requireString('abcdef', 3)).toBe('abc');
	});
});

describe('validatePassword', () => {
	it('accepts valid password with 12+ chars, mixed case, and digit', () => {
		expect(validatePassword('SecurePass12')).toBeNull();
		expect(validatePassword('MyPassword123!')).toBeNull();
	});

	it('rejects password shorter than 12 characters', () => {
		expect(validatePassword('Short1Aa')).toBe('Password must be at least 12 characters');
	});

	it('rejects password without lowercase letter', () => {
		expect(validatePassword('ALLUPPERCASE1')).toBe('Password must include uppercase, lowercase, and a number');
	});

	it('rejects password without uppercase letter', () => {
		expect(validatePassword('alllowercase1')).toBe('Password must include uppercase, lowercase, and a number');
	});

	it('rejects password without digit', () => {
		expect(validatePassword('NoDigitsHereAbc')).toBe('Password must include uppercase, lowercase, and a number');
	});

	it('rejects empty password', () => {
		expect(validatePassword('')).toBe('Password must be at least 12 characters');
	});
});
