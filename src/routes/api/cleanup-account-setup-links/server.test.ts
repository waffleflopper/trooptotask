import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { GET } from './+server';

const { getAdminClient, env } = vi.hoisted(() => ({
	getAdminClient: vi.fn(),
	env: {
		CLEANUP_SECRET: 'synthetic-setup-cleanup-secret' as string | undefined,
		CRON_SECRET: 'synthetic-setup-cron-secret' as string | undefined
	}
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));
vi.mock('$env/dynamic/private', () => ({ env }));

const NOW = '2026-06-10T12:00:00.000Z';

function request(authorization?: string) {
	return {
		request: new Request('https://example.test/api/cleanup-account-setup-links', {
			headers: authorization ? { authorization } : {}
		})
	} as RequestEvent;
}

function setupLink(id: string, overrides: Record<string, string | null> = {}) {
	return {
		id,
		access_request_id: `request-${id}`,
		token_hash: `synthetic-${id}-hash`,
		expires_at: '2026-06-01T12:00:00.000Z',
		created_at: '2026-05-18T12:00:00.000Z',
		claimed_at: null,
		failed_at: null,
		failure_reason: null,
		used_at: null,
		revoked_at: null,
		revocation_reason: null,
		...overrides
	};
}

function setupProvider(failure?: 'PATCH' | 'GET' | 'HEAD') {
	const initialRows = [
		setupLink('expired-unused'),
		setupLink('expires-now', { expires_at: NOW }),
		setupLink('active', { expires_at: '2026-06-20T12:00:00.000Z' }),
		setupLink('claimed-recovery', { claimed_at: '2026-05-19T11:59:00.000Z' }),
		setupLink('used', { claimed_at: '2026-05-19T11:59:00.000Z', used_at: '2026-05-19T12:00:00.000Z' }),
		setupLink('failed', {
			claimed_at: '2026-05-19T11:59:00.000Z',
			failed_at: '2026-05-19T12:00:00.000Z',
			failure_reason: 'account-create-failed'
		}),
		setupLink('revoked', { revoked_at: '2026-06-02T12:00:00.000Z', revocation_reason: 'replaced' })
	];
	const state = { rows: structuredClone(initialRows) };
	function matches(row: Record<string, string | null>, column: string, filter: string) {
		const separator = filter.indexOf('.');
		const operator = filter.slice(0, separator);
		const value = filter.slice(separator + 1);
		if (operator === 'is' && value === 'null') return row[column] === null;
		if (operator === 'lte') return row[column] !== null && row[column] <= value;
		if (operator === 'gt') return row[column] !== null && row[column] > value;
		throw new Error(`Unexpected setup-link filter: ${column} ${filter}`);
	}
	const client = createClient('http://127.0.0.1:9', 'synthetic-service-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const method = init?.method ?? 'GET';
				if (url.pathname !== '/rest/v1/account_setup_links' || !['PATCH', 'GET', 'HEAD'].includes(method)) {
					throw new Error(`Cleanup must preserve Access Requests and User Accounts: ${method} ${url.pathname}`);
				}
				if (method === failure) {
					return Response.json({ code: '42501', message: 'synthetic setup provider failure' }, { status: 403 });
				}
				const rows = state.rows.filter((row) =>
					[...url.searchParams].every(([column, filter]) => {
						if (column === 'select') return true;
						if (column === 'or') {
							return filter
								.slice(1, -1)
								.split(',')
								.some((predicate) => {
									const separator = predicate.indexOf('.');
									return matches(row, predicate.slice(0, separator), predicate.slice(separator + 1));
								});
						}
						return matches(row, column, filter);
					})
				);
				if (method === 'PATCH') {
					const update = JSON.parse(String(init?.body));
					for (const row of rows) Object.assign(row, update);
				}
				if (method === 'HEAD') {
					return new Response(null, { status: 200, headers: { 'content-range': `*/${rows.length}` } });
				}
				return Response.json(rows);
			}
		}
	});
	return { client, state, initialRows };
}

describe('scheduled account-setup cleanup', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(NOW));
		getAdminClient.mockReset();
		env.CLEANUP_SECRET = 'synthetic-setup-cleanup-secret';
		env.CRON_SECRET = 'synthetic-setup-cron-secret';
	});
	afterEach(() => vi.useRealTimers());

	it.each([undefined, 'Bearer incorrect-secret'])('rejects %s before opening the provider', async (header) => {
		await expect(GET(request(header))).rejects.toMatchObject({ status: 401 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('fails closed without either configured credential', async () => {
		env.CLEANUP_SECRET = undefined;
		env.CRON_SECRET = undefined;
		await expect(GET(request('Bearer incorrect-secret'))).rejects.toMatchObject({ status: 500 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it.each(['synthetic-setup-cleanup-secret', 'synthetic-setup-cron-secret'])(
		'accepts %s, preserves recovery/history and reports only newly revoked links on retry',
		async (secret) => {
			const provider = setupProvider();
			getAdminClient.mockReturnValue(provider.client);

			const response = await GET(request(`Bearer ${secret}`));

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				revokedExpiredUnusedCount: 2,
				staleRevokedCount: 3,
				completedSetupHistoryCount: 1,
				failedSetupHistoryCount: 1,
				activeLinkCount: 1,
				deletedAccessRequestCount: 0,
				deletedUserAccountCount: 0
			});
			expect(provider.state.rows).toEqual([
				{ ...provider.initialRows[0], revoked_at: NOW, revocation_reason: 'cleanup' },
				{ ...provider.initialRows[1], revoked_at: NOW, revocation_reason: 'cleanup' },
				...provider.initialRows.slice(2)
			]);
			const saved = structuredClone(provider.state.rows);

			const repeated = await GET(request(`Bearer ${secret}`));

			expect(await repeated.json()).toEqual({
				revokedExpiredUnusedCount: 0,
				staleRevokedCount: 3,
				completedSetupHistoryCount: 1,
				failedSetupHistoryCount: 1,
				activeLinkCount: 1,
				deletedAccessRequestCount: 0,
				deletedUserAccountCount: 0
			});
			expect(provider.state.rows).toEqual(saved);
		}
	);

	it.each(['PATCH', 'GET', 'HEAD'] as const)(
		'propagates a %s provider failure without reporting successful cleanup or erasing history',
		async (failure) => {
			const provider = setupProvider(failure);
			getAdminClient.mockReturnValue(provider.client);

			await expect(GET(request('Bearer synthetic-setup-cron-secret'))).rejects.toThrow(
				'synthetic setup provider failure'
			);

			expect(provider.state.rows.slice(2)).toEqual(provider.initialRows.slice(2));
			expect(provider.state.rows.slice(0, 2)).toEqual(
				failure === 'PATCH'
					? provider.initialRows.slice(0, 2)
					: provider.initialRows.slice(0, 2).map((row) => ({
							...row,
							revoked_at: NOW,
							revocation_reason: 'cleanup'
						}))
			);
		}
	);
});
