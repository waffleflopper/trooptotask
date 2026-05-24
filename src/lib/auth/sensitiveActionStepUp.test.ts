import { describe, expect, it } from 'vitest';
import { buildSensitiveActionStepUpUrl, isSensitiveActionStepUpPayload } from '$lib/auth/sensitiveActionStepUp';

const currentLocation = {
	origin: 'https://app.example.test',
	pathname: '/org/local-test/settings',
	search: '?tab=members'
} as Location;

describe('sensitiveActionStepUp', () => {
	it('builds a reauth login URL with the current route as the safe return path', () => {
		expect(buildSensitiveActionStepUpUrl({ requiresStepUp: true, stepUpPath: '/auth/login' }, currentLocation)).toBe(
			'https://app.example.test/auth/login?reauth=1&next=%2Forg%2Flocal-test%2Fsettings%3Ftab%3Dmembers'
		);
	});

	it('builds an MFA handoff URL with the current route as the safe return path', () => {
		expect(
			buildSensitiveActionStepUpUrl({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' }, currentLocation)
		).toBe('https://app.example.test/auth/mfa-verify?next=%2Forg%2Flocal-test%2Fsettings%3Ftab%3Dmembers');
	});

	it('falls back to login when a producer sends an unsafe step-up path', () => {
		expect(
			buildSensitiveActionStepUpUrl({ requiresStepUp: true, stepUpPath: 'https://evil.example.test' }, currentLocation)
		).toBe('https://app.example.test/auth/login?reauth=1&next=%2Forg%2Flocal-test%2Fsettings%3Ftab%3Dmembers');
	});

	it('falls back to login when a producer omits the step-up path', () => {
		expect(buildSensitiveActionStepUpUrl({ requiresStepUp: true }, currentLocation)).toBe(
			'https://app.example.test/auth/login?reauth=1&next=%2Forg%2Flocal-test%2Fsettings%3Ftab%3Dmembers'
		);
		expect(buildSensitiveActionStepUpUrl({ requiresStepUp: true, stepUpPath: null }, currentLocation)).toBe(
			'https://app.example.test/auth/login?reauth=1&next=%2Forg%2Flocal-test%2Fsettings%3Ftab%3Dmembers'
		);
	});

	it('recognizes only explicit step-up payloads', () => {
		expect(isSensitiveActionStepUpPayload({ requiresStepUp: true })).toBe(true);
		expect(isSensitiveActionStepUpPayload({ requiresStepUp: false })).toBe(false);
		expect(isSensitiveActionStepUpPayload(null)).toBe(false);
	});
});
