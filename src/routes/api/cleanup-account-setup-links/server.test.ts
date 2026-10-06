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

function setupProvider(
	options: {
		failure?: 'mutation' | 'history' | 'active';
		rows?: ReturnType<typeof setupLink>[];
		countResponse?: { operation: 'mutation' | 'history' | 'active'; value: string | null };
	} = {}
) {
	const initialRows = options.rows ?? [
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
	const disclosedTokenHashes: string[] = [];
	function matches(row: Record<string, string | null>, column: string, filter: string) {
		const separator = filter.indexOf('.');
		const operator = filter.slice(0, separator);
		const value = filter.slice(separator + 1);
		if (operator === 'is' && value === 'null') return row[column] === null;
		if (operator === 'not' && value === 'is.null') return row[column] !== null;
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
				const operation = method === 'PATCH' ? 'mutation' : url.searchParams.has('or') ? 'history' : 'active';
				if (operation === options.failure) {
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
				const headers = new Headers();
				if (new Headers(init?.headers).get('prefer')?.includes('count=exact')) {
					const count =
						options.countResponse?.operation === operation ? options.countResponse.value : String(rows.length);
					if (count !== null) headers.set('content-range', `*/${count}`);
				}
				if (method === 'HEAD' || (method === 'PATCH' && !url.searchParams.has('select'))) {
					return new Response(null, { status: method === 'HEAD' ? 200 : 204, headers });
				}
				const columns = url.searchParams
					.get('select')
					?.split(',')
					.map((column) => column.trim());
				const payload = rows.slice(0, 1000).map((row) => {
					if (!columns || columns.includes('*') || columns.includes('token_hash')) {
						disclosedTokenHashes.push(row.token_hash);
					}
					return columns && !columns.includes('*')
						? Object.fromEntries(columns.map((column) => [column, row[column as keyof typeof row]]))
						: row;
				});
				return Response.json(payload, { headers });
			}
		}
	});
	return { client, state, initialRows, disclosedTokenHashes };
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

	it.each(['mutation', 'history', 'active'] as const)(
		'propagates a %s provider failure without reporting successful cleanup or erasing history',
		async (failure) => {
			const provider = setupProvider({ failure });
			getAdminClient.mockReturnValue(provider.client);

			await expect(GET(request('Bearer synthetic-setup-cron-secret'))).rejects.toThrow(
				'synthetic setup provider failure'
			);

			expect(provider.state.rows.slice(2)).toEqual(provider.initialRows.slice(2));
			expect(provider.state.rows.slice(0, 2)).toEqual(
				failure === 'mutation'
					? provider.initialRows.slice(0, 2)
					: provider.initialRows.slice(0, 2).map((row) => ({
							...row,
							revoked_at: NOW,
							revocation_reason: 'cleanup'
						}))
			);
		}
	);

	it('reports exact mutation and overlapping history counts beyond the provider representation cap', async () => {
		const rows = [
			...Array.from({ length: 1001 }, (_, index) => setupLink(`expired-${index}`)),
			...Array.from({ length: 1001 }, (_, index) =>
				setupLink(`history-${index}`, {
					claimed_at: '2026-05-19T11:59:00.000Z',
					used_at: '2026-05-19T12:00:00.000Z',
					revoked_at: '2026-05-20T12:00:00.000Z',
					revocation_reason: 'manual',
					failed_at: '2026-05-21T12:00:00.000Z',
					failure_reason: 'account-create-failed'
				})
			),
			setupLink('expires-now', { expires_at: NOW }),
			setupLink('claimed-recovery', { claimed_at: '2026-05-19T11:59:00.000Z' }),
			setupLink('active', { expires_at: '2026-06-20T12:00:00.000Z' }),
			setupLink('foreign-history', {
				access_request_id: 'foreign-request',
				claimed_at: '2026-05-19T11:59:00.000Z',
				used_at: NOW
			})
		];
		const provider = setupProvider({ rows });
		getAdminClient.mockReturnValue(provider.client);

		expect(await (await GET(request('Bearer synthetic-setup-cron-secret'))).json()).toEqual({
			revokedExpiredUnusedCount: 1002,
			staleRevokedCount: 2003,
			completedSetupHistoryCount: 1002,
			failedSetupHistoryCount: 1001,
			activeLinkCount: 1,
			deletedAccessRequestCount: 0,
			deletedUserAccountCount: 0
		});
		expect(provider.state.rows.slice(1001, 2002)).toEqual(rows.slice(1001, 2002));
		expect(provider.state.rows.slice(2003)).toEqual(rows.slice(2003));
		const saved = structuredClone(provider.state.rows);

		expect(await (await GET(request('Bearer synthetic-setup-cron-secret'))).json()).toEqual({
			revokedExpiredUnusedCount: 0,
			staleRevokedCount: 2003,
			completedSetupHistoryCount: 1002,
			failedSetupHistoryCount: 1001,
			activeLinkCount: 1,
			deletedAccessRequestCount: 0,
			deletedUserAccountCount: 0
		});
		expect(provider.state.rows).toEqual(saved);
		expect(provider.disclosedTokenHashes).toEqual([]);
	});

	it('uses the whole cutoff union before testing each history category, including newly revoked links', async () => {
		const cutoff = '2026-06-01T12:00:00.000Z';
		const later = '2026-06-05T12:00:00.000Z';
		const future = '2026-06-20T12:00:00.000Z';
		const rows = [
			setupLink('expires-at-cutoff'),
			setupLink('used-at-cutoff', { expires_at: future, claimed_at: cutoff, used_at: cutoff, revoked_at: later }),
			setupLink('revoked-at-cutoff', { expires_at: future, claimed_at: cutoff, revoked_at: cutoff, failed_at: later }),
			setupLink('failed-at-cutoff', { expires_at: future, claimed_at: cutoff, failed_at: cutoff, used_at: later }),
			setupLink('later-history', {
				expires_at: future,
				claimed_at: cutoff,
				used_at: later,
				failed_at: later,
				revoked_at: later
			}),
			setupLink('claimed-recovery', { claimed_at: cutoff }),
			setupLink('active', { expires_at: future })
		];
		const provider = setupProvider({ rows });
		getAdminClient.mockReturnValue(provider.client);
		vi.setSystemTime(new Date(cutoff));

		expect(await (await GET(request('Bearer synthetic-setup-cron-secret'))).json()).toEqual({
			revokedExpiredUnusedCount: 1,
			staleRevokedCount: 3,
			completedSetupHistoryCount: 2,
			failedSetupHistoryCount: 2,
			activeLinkCount: 1,
			deletedAccessRequestCount: 0,
			deletedUserAccountCount: 0
		});
		expect(provider.state.rows).toEqual([
			{ ...rows[0], revoked_at: cutoff, revocation_reason: 'cleanup' },
			...rows.slice(1)
		]);
	});

	it.each(['mutation', 'history', 'active'] as const)(
		'fails closed when the %s count is unavailable',
		async (operation) => {
			const provider = setupProvider({ countResponse: { operation, value: null } });
			getAdminClient.mockReturnValue(provider.client);
			await expect(GET(request('Bearer synthetic-setup-cron-secret'))).rejects.toThrow(
				'Invalid account setup link count'
			);
		}
	);

	it.each(['unknown', '-1', '9007199254740992'])(
		'fails closed when the provider returns malformed count %s',
		async (value) => {
			const provider = setupProvider({ countResponse: { operation: 'history', value } });
			getAdminClient.mockReturnValue(provider.client);
			await expect(GET(request('Bearer synthetic-setup-cron-secret'))).rejects.toThrow(
				'Invalid account setup link count'
			);
		}
	);
});
