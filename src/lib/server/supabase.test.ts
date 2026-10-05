import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAdminClient } from './supabase';

vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://service.invalid' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key' } }));

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('service connection through the installed SDK', () => {
	it('does not leave user-session refresh work scheduled after initialization', async () => {
		vi.useFakeTimers();
		const client = getAdminClient();
		try {
			await client.auth.initialize();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			await client.auth.stopAutoRefresh();
		}
	});

	it('sends the service credential to the configured provider without a user session', async () => {
		vi.useFakeTimers();
		const requests: Request[] = [];
		vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
			requests.push(new Request(input, init));
			return Response.json(null);
		});
		const client = getAdminClient();
		try {
			await client.rpc('service_probe');
			expect(requests).toHaveLength(1);
			expect(requests[0].url).toBe('http://service.invalid/rest/v1/rpc/service_probe');
			expect(requests[0].headers.get('authorization')).toBe('Bearer synthetic-service-key');
			expect(requests[0].headers.get('apikey')).toBe('synthetic-service-key');
		} finally {
			await client.auth.stopAutoRefresh();
		}
	});
});
