import { describe, expect, it } from 'vitest';
import { sanitizeAuthNextPath } from './redirects';

describe('sanitizeAuthNextPath', () => {
	it('keeps safe app-relative paths with query strings and hashes', () => {
		expect(sanitizeAuthNextPath('/')).toBe('/');
		expect(sanitizeAuthNextPath('/dashboard')).toBe('/dashboard');
		expect(sanitizeAuthNextPath('/org/local-dev-test/billing?tab=plan#checkout')).toBe(
			'/org/local-dev-test/billing?tab=plan#checkout'
		);
	});

	it('drops missing and non-string values', () => {
		expect(sanitizeAuthNextPath(null)).toBeNull();
		expect(sanitizeAuthNextPath(undefined)).toBeNull();
		expect(sanitizeAuthNextPath(new File(['ignored'], 'next.txt'))).toBeNull();
	});

	it('drops absolute and protocol-relative redirects', () => {
		expect(sanitizeAuthNextPath('https://evil.example/phish')).toBeNull();
		expect(sanitizeAuthNextPath('//evil.example/phish')).toBeNull();
	});

	it('drops values that normalize outside the app path shape', () => {
		expect(sanitizeAuthNextPath('/\\evil.example/phish')).toBeNull();
		expect(sanitizeAuthNextPath('/..//admin')).toBeNull();
		expect(sanitizeAuthNextPath('/%2e%2e//admin')).toBeNull();
	});
});
