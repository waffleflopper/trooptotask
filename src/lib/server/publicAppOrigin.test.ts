import { afterEach, describe, expect, it, vi } from 'vitest';
import { makePublicAppUrl, resolvePublicAppOrigin } from './publicAppOrigin';

describe('public app origin resolver', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('uses the configured official origin instead of a spoofed inbound production host', () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.org');
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://preview.trooptotask.dev');

		expect(
			makePublicAppUrl('/auth/setup-account?token=redacted', {
				inboundOrigin: 'https://evil.example'
			})
		).toBe('https://trooptotask.org/auth/setup-account?token=redacted');
	});

	it('supports local loopback origins without production config', () => {
		expect(resolvePublicAppOrigin({ inboundOrigin: 'http://localhost:4173' })).toBe('http://localhost:4173');
		expect(resolvePublicAppOrigin({ inboundOrigin: 'http://127.0.0.1:5173' })).toBe('http://127.0.0.1:5173');
		expect(resolvePublicAppOrigin({ inboundOrigin: 'http://[::1]:5173' })).toBe('http://[::1]:5173');
	});

	it('supports preview origins only when explicitly allowlisted without an official origin', () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN_ALLOWLIST', 'https://preview.trooptotask.dev');

		expect(resolvePublicAppOrigin({ inboundOrigin: 'https://preview.trooptotask.dev' })).toBe(
			'https://preview.trooptotask.dev'
		);
	});

	it('rejects non-local inbound hosts when no official origin or allowlist match is configured', () => {
		expect(() => resolvePublicAppOrigin({ inboundOrigin: 'https://admin.trooptotask.org' })).toThrow(
			'Official public app origin is not configured for this host'
		);
	});

	it('requires HTTPS outside local development', () => {
		expect(() => resolvePublicAppOrigin({ inboundOrigin: 'http://trooptotask.org' })).toThrow(
			'Public app origin must use HTTPS outside local development'
		);
	});

	it('reports malformed public origin configuration as a controlled app error', () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'trooptotask.com');

		expect(() => resolvePublicAppOrigin({ inboundOrigin: 'https://trooptotask.org' })).toThrow(
			'Public app origin must be a valid URL'
		);
	});
});
