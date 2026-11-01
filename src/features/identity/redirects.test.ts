import { describe, expect, it } from 'vitest';
import { sanitizeAuthNextPath, signInPathFor } from './redirects';

describe('sanitizeAuthNextPath', () => {
	it('keeps safe app-relative paths with query strings and hashes', () => {
		expect(sanitizeAuthNextPath('/')).toBe('/');
		expect(sanitizeAuthNextPath('/dashboard')).toBe('/dashboard');
		expect(sanitizeAuthNextPath('/org/local-dev-test/settings?tab=members#invitation')).toBe(
			'/org/local-dev-test/settings?tab=members#invitation'
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

	it.each([
		['/org/alpha/../bravo/calendar?view=month#today', '/org/bravo/calendar?view=month#today'],
		[
			'/account/security?label=A%26B&next=https%3A%2F%2Fexternal.invalid#devices',
			'/account/security?label=A%26B&next=https%3A%2F%2Fexternal.invalid#devices'
		],
		['/org/alpha/personnel?name=Jos%C3%A9', '/org/alpha/personnel?name=Jos%C3%A9'],
		['/%2Fexternal.invalid/path', '/%2Fexternal.invalid/path']
	])('preserves the local destination %s without decoding query or path separators', (input, expected) => {
		expect(sanitizeAuthNextPath(input)).toBe(expected);
	});

	it.each([
		'dashboard',
		'?next=/dashboard',
		'#dashboard',
		'javascript:alert(1)',
		'///external.invalid',
		'/a/..//external.invalid',
		'/%2e%2e//external.invalid',
		'/account\\security'
	])('rejects a non-app destination %s', (input) => expect(sanitizeAuthNextPath(input)).toBeNull());
});

describe('signInPathFor', () => {
	const visit = (path: string) => ({
		url: new URL(path, 'http://app.invalid'),
		method: 'GET',
		accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
		isDataRequest: false
	});

	it('carries a page visit and its query', () => {
		expect(signInPathFor(visit('/dashboard'))).toBe('/auth/login?next=%2Fdashboard');
		expect(signInPathFor(visit('/org/alpha/calendar?view=month&label=A%26B'))).toBe(
			'/auth/login?next=%2Forg%2Falpha%2Fcalendar%3Fview%3Dmonth%26label%3DA%2526B'
		);
	});

	it.each([
		['a data request', { ...visit('/dashboard'), isDataRequest: true }],
		['a form action', { ...visit('/dashboard?/create'), method: 'POST' }],
		['an API path opened in a tab', visit('/org/alpha/api/deletion-requests')],
		['a top-level API path', visit('/api/auth/mfa')],
		['an endpoint fetch', { ...visit('/org/alpha/training/views'), accept: '*/*' }],
		['an image request', { ...visit('/favicon.ico'), accept: 'image/avif,image/*' }],
		['a path that could leave the app', visit('http://app.invalid//evil.example')]
	])('records no destination for %s', (_name, request) => {
		expect(signInPathFor(request)).toBe('/auth/login');
	});
});
