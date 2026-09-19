import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-09-17T12:00:00Z');
let checkRateLimit: typeof import('./rateLimit').checkRateLimit;

beforeEach(async () => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	vi.resetModules();
	({ checkRateLimit } = await import('./rateLimit'));
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe('global in-memory rate limits', () => {
	it('leaves Access Request submission to the route-level durable limiter', () => {
		const ip = '198.51.100.42';

		for (let attempt = 0; attempt < 6; attempt += 1) {
			expect(checkRateLimit(ip, '/api/access-requests', 'POST')).toEqual({ limited: false });
		}
	});
});

// These examples specify retained budgets independently of the production rule table.
const policies = [
	{ name: 'invitation renewal', path: '/auth/renew-invite', method: 'POST', limit: 5, windowMs: 3_600_000 },
	{ name: 'auth forms', path: '/auth/login', method: 'POST', limit: 10, windowMs: 900_000 },
	{ name: 'Organization exports', path: '/org/org-a/api/export-excel', method: 'POST', limit: 10, windowMs: 3_600_000 },
	{
		name: 'getting started',
		path: '/org/org-a/api/getting-started/item',
		method: 'DELETE',
		limit: 20,
		windowMs: 60_000
	},
	{ name: 'Organization writes', path: '/org/org-a/api/personnel', method: 'PUT', limit: 30, windowMs: 60_000 },
	{ name: 'admin search', path: '/admin/api/search', method: 'GET', limit: 30, windowMs: 60_000 },
	{ name: 'admin suspension', path: '/admin/api/suspend', method: 'POST', limit: 10, windowMs: 900_000 },
	{ name: 'admin announcements', path: '/admin/announcements', method: 'POST', limit: 20, windowMs: 60_000 },
	{ name: 'announcement dismissal', path: '/api/announcements/dismiss', method: 'POST', limit: 20, windowMs: 60_000 },
	{
		name: 'password confirmation fallback',
		path: '/api/auth/confirm-sensitive-action',
		method: 'POST',
		limit: 60,
		windowMs: 60_000
	}
];

it.each(policies)(
	'$name allows its budget, denies excess and resets exactly at expiry',
	({ path, method, limit, windowMs }) => {
		for (let attempt = 0; attempt < limit; attempt++) {
			expect(checkRateLimit('198.51.100.1', path, method)).toEqual({ limited: false });
		}
		expect(checkRateLimit('198.51.100.1', path, method)).toEqual({ limited: true, retryAfterMs: windowMs });
		vi.setSystemTime(NOW.getTime() + windowMs - 1);
		expect(checkRateLimit('198.51.100.1', path, method)).toEqual({ limited: true, retryAfterMs: 1 });
		vi.setSystemTime(NOW.getTime() + windowMs);
		expect(checkRateLimit('198.51.100.1', path, method)).toEqual({ limited: false });
		for (let attempt = 1; attempt < limit; attempt++) {
			expect(checkRateLimit('198.51.100.1', path, method)).toEqual({ limited: false });
		}
		expect(checkRateLimit('198.51.100.1', path, method)).toEqual({ limited: true, retryAfterMs: windowMs });
	}
);

it('shares a client budget across auth paths but separates clients, policies and read methods', () => {
	for (let attempt = 0; attempt < 10; attempt++) {
		expect(checkRateLimit('198.51.100.1', '/auth/login', 'POST')).toEqual({ limited: false });
	}
	expect(checkRateLimit('198.51.100.1', '/auth/forgot-password', 'POST')).toEqual({
		limited: true,
		retryAfterMs: 900_000
	});
	expect(checkRateLimit('198.51.100.2', '/auth/login', 'POST')).toEqual({ limited: false });
	expect(checkRateLimit('198.51.100.1', '/auth/renew-invite', 'POST')).toEqual({ limited: false });
	expect(checkRateLimit('198.51.100.1', '/auth/login', 'GET')).toEqual({ limited: false });
	vi.setSystemTime(NOW.getTime() + 1_234);
	expect(checkRateLimit('198.51.100.1', '/auth/login', 'POST')).toEqual({ limited: true, retryAfterMs: 898_766 });
});

it('rotating Organization paths and write methods cannot evade the client budget', () => {
	for (let attempt = 0; attempt < 30; attempt++) {
		expect(checkRateLimit('198.51.100.1', '/org/org-a/api/personnel', 'POST')).toEqual({ limited: false });
	}
	expect(checkRateLimit('198.51.100.1', '/org/org-b/api/training', 'DELETE')).toEqual({
		limited: true,
		retryAfterMs: 60_000
	});
	expect(checkRateLimit('198.51.100.2', '/org/org-b/api/training', 'DELETE')).toEqual({ limited: false });
	expect(checkRateLimit('198.51.100.1', '/org/org-a/api/personnel', 'GET')).toEqual({ limited: false });
});

it('method mismatches use the shared fallback budget without spending write budgets', () => {
	for (let attempt = 0; attempt < 60; attempt++) {
		expect(checkRateLimit('198.51.100.1', '/auth/renew-invite', 'GET')).toEqual({ limited: false });
	}
	expect(checkRateLimit('198.51.100.1', '/api/auth/confirm-sensitive-action', 'POST')).toEqual({
		limited: true,
		retryAfterMs: 60_000
	});
	expect(checkRateLimit('198.51.100.1', '/auth/renew-invite', 'POST')).toEqual({ limited: false });
});
