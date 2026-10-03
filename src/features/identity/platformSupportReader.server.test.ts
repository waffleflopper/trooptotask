import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createIdentityPlatformSupportReader } from './platformSupportReader.server';
import { createIdentityPlatformSuspensionCommands } from './platformSuspensionCommands.server';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';

function client(fetch: typeof globalThis.fetch) {
	return createClient('http://127.0.0.1:9', 'synthetic-service-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch }
	});
}

describe('Identity platform account facts', () => {
	it('projects only the requested account facts and preserves provider confirmation fallback', async () => {
		const reader = createIdentityPlatformSupportReader(
			client(async (input) => {
				expect(new URL(input.toString()).pathname).toBe(`/auth/v1/admin/users/${USER}`);
				return Response.json({
					id: USER,
					email: 'soldier@example.test',
					created_at: '2026-06-01',
					last_sign_in_at: '2026-06-08',
					confirmed_at: '2026-06-02',
					app_metadata: { secret: 'private' },
					user_metadata: { phone: 'private' }
				});
			})
		);
		await expect(reader.getAuthUser(USER)).resolves.toEqual({
			status: 'ok',
			user: {
				id: USER,
				email: 'soldier@example.test',
				createdAt: '2026-06-01',
				lastSignInAt: '2026-06-08',
				emailConfirmedAt: '2026-06-02'
			}
		});
	});

	it.each([
		{
			name: 'wrong account',
			body: { id: OTHER, email: 'foreign@example.test', created_at: '2026-06-01' },
			status: 200
		},
		{ name: 'provider outage', body: { message: 'private-provider-detail' }, status: 500 },
		{ name: 'malformed account', body: { id: USER }, status: 200 }
	])('keeps $name unavailable rather than reporting a trusted account', async ({ body, status }) => {
		const reader = createIdentityPlatformSupportReader(client(async () => Response.json(body, { status })));
		await expect(reader.getAuthUser(USER)).resolves.toEqual({
			status: 'auth_error',
			message: 'Unable to load user identity'
		});
	});

	it('distinguishes a missing account from an unrelated provider error', async () => {
		const reader = createIdentityPlatformSupportReader(
			client(async () => Response.json({ message: 'User not found' }, { status: 404 }))
		);
		await expect(reader.getAuthUser(USER)).resolves.toEqual({ status: 'not_found' });
	});

	it('follows provider continuation even when a page is short and keeps page ten monotonic', async () => {
		const pages: number[] = [];
		const listUsers = vi.fn(async ({ page }: { page: number }) => {
			pages.push(page);
			return {
				data: {
					users: [{ id: `user-${page}`, email: null, created_at: '2026-06-01' }],
					nextPage: page < 10 ? page + 1 : page === 10 ? 1 : null
				},
				error: null
			};
		});
		const reader = createIdentityPlatformSupportReader({ auth: { admin: { listUsers } } } as never);
		const result = await reader.listAuthUsers();
		expect(pages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
		expect(result.status === 'ok' && result.users.map((user) => user.id)).toEqual([
			'user-1',
			'user-2',
			'user-3',
			'user-4',
			'user-5',
			'user-6',
			'user-7',
			'user-8',
			'user-9',
			'user-10',
			'user-11'
		]);
	});

	it('rejects a later account-page failure rather than returning the first page as a complete directory', async () => {
		const listUsers = vi
			.fn()
			.mockResolvedValueOnce({ data: { users: [{ id: USER, created_at: '2026-06-01' }], nextPage: 2 }, error: null })
			.mockResolvedValueOnce({ data: { users: [] }, error: { message: 'private-provider-detail' } });
		const reader = createIdentityPlatformSupportReader({ auth: { admin: { listUsers } } } as never);
		await expect(reader.listAuthUsers()).resolves.toEqual({
			status: 'auth_error',
			message: 'Unable to load platform accounts'
		});
	});

	it('keeps account email search source-owned and excludes provider-only fields', async () => {
		const reader = createIdentityPlatformSupportReader(
			client(async (input, init) => {
				const request = new Request(input, init);
				expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/search_users_by_email');
				expect(await request.json()).toEqual({ search_query: 'soldier', max_results: 5 });
				return Response.json([{ id: USER, email: 'soldier@example.test', secret: 'private' }]);
			})
		);
		await expect(reader.searchUsersByEmail({ query: 'soldier', maxResults: 5 })).resolves.toEqual([
			{ id: USER, email: 'soldier@example.test' }
		]);
	});

	it.each([
		{ body: { message: 'private-provider-detail' }, status: 500 },
		{ body: null, status: 200 },
		{ body: [{ id: USER, email: { secret: 'private' } }], status: 200 }
	])('rejects unavailable or malformed account search facts', async ({ body, status }) => {
		const reader = createIdentityPlatformSupportReader(client(async () => Response.json(body, { status })));
		await expect(reader.searchUsersByEmail({ query: 'soldier', maxResults: 5 })).rejects.toThrow('Unable to search');
	});

	it('uses profile labels when available and retains account email when optional profile lookup fails', async () => {
		const makeReader = (profilesFail: boolean) =>
			createIdentityPlatformSupportReader(
				client(async (input) => {
					const url = new URL(input.toString());
					if (url.pathname.startsWith('/auth/v1/admin/users/'))
						return Response.json({ id: USER, email: 'leader@example.test', created_at: '2026-06-01' });
					if (profilesFail) return Response.json({ message: 'unavailable' }, { status: 500 });
					return Response.json([{ user_id: USER, first_name: 'Avery', last_name: 'Jones' }]);
				})
			);
		await expect(makeReader(false).loadUserLabels([USER, USER])).resolves.toEqual(
			new Map([[USER, { email: 'leader@example.test', firstName: 'Avery', lastName: 'Jones' }]])
		);
		await expect(makeReader(true).loadUserLabels([USER])).resolves.toEqual(
			new Map([[USER, { email: 'leader@example.test', firstName: null, lastName: null }]])
		);
	});
});

describe('Identity platform suspension facts and effects', () => {
	it('reads the complete requested account suspension set and does not trust a foreign detail row', async () => {
		const ids = Array.from({ length: 1001 }, (_, index) => `user-${index}`);
		const rows = ids.map((user_id) => ({ user_id }));
		const reader = createIdentityPlatformSupportReader(
			client(async (input) => {
				const url = new URL(input.toString());
				expect(url.pathname).toBe('/rest/v1/user_suspensions');
				if (url.searchParams.has('user_id') && url.searchParams.get('user_id')?.startsWith('eq.'))
					return Response.json({ user_id: OTHER, suspended_at: '2026-06-01', suspended_by: ADMIN, reason: null });
				const requestedIds = new Set(url.searchParams.get('user_id')?.slice(4, -1).split(','));
				const scopedRows = rows.filter((row) => requestedIds.has(row.user_id));
				const offset = Number(url.searchParams.get('offset') ?? 0);
				return Response.json(scopedRows.slice(offset, offset + Number(url.searchParams.get('limit'))));
			})
		);
		await expect(reader.listSuspendedUserIds(ids)).resolves.toEqual(ids);
		await expect(reader.getSuspensionForUser(USER)).rejects.toThrow('could not be verified');
	});

	it('maps the exact account suspension and distinguishes a legitimate absent row', async () => {
		const makeReader = (body: unknown) =>
			createIdentityPlatformSupportReader(
				client(async (input) => {
					const url = new URL(input.toString());
					expect(url.pathname).toBe('/rest/v1/user_suspensions');
					expect(url.searchParams.get('user_id')).toBe(`eq.${USER}`);
					return Response.json(body);
				})
			);
		await expect(
			makeReader({
				user_id: USER,
				suspended_at: '2026-06-01',
				suspended_by: ADMIN,
				reason: 'Synthetic reason'
			}).getSuspensionForUser(USER)
		).resolves.toEqual({
			userId: USER,
			suspendedAt: '2026-06-01',
			suspendedBy: ADMIN,
			reason: 'Synthetic reason'
		});
		await expect(makeReader(null).getSuspensionForUser(USER)).resolves.toBeNull();
	});

	it.each(['list', 'detail'] as const)(
		'propagates %s suspension failures instead of verified unsuspended state',
		async (kind) => {
			const reader = createIdentityPlatformSupportReader(
				client(async () => Response.json({ message: 'private-provider-detail' }, { status: 500 }))
			);
			await expect(
				kind === 'list' ? reader.listSuspendedUserIds([USER]) : reader.getSuspensionForUser(USER)
			).rejects.toThrow();
		}
	);

	it('does not treat a missing list representation as proof that no requested accounts are suspended', async () => {
		const reader = createIdentityPlatformSupportReader(client(async () => Response.json(null)));
		await expect(reader.listSuspendedUserIds([USER])).rejects.toThrow('Unable to read');
	});

	for (const action of ['suspend', 'unsuspend'] as const) {
		const run = (commands: ReturnType<typeof createIdentityPlatformSuspensionCommands>) =>
			action === 'suspend'
				? commands.suspendUser({ userId: USER, suspendedBy: ADMIN, reason: 'Synthetic reason' })
				: commands.unsuspendUser(USER);
		it(`${action} acknowledges exactly the intended account`, async () => {
			const commands = createIdentityPlatformSuspensionCommands(
				client(async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					expect(request.method).toBe(action === 'suspend' ? 'POST' : 'DELETE');
					expect(url.pathname).toBe('/rest/v1/user_suspensions');
					if (action === 'suspend')
						expect(await request.json()).toEqual({ user_id: USER, suspended_by: ADMIN, reason: 'Synthetic reason' });
					else expect(url.searchParams.get('user_id')).toBe(`eq.${USER}`);
					return Response.json([{ user_id: USER }]);
				})
			);
			await expect(run(commands)).resolves.toBeUndefined();
		});
		it.each([null, [], [{ user_id: OTHER }], [{ user_id: USER }, { user_id: USER }], [{ user_id: [USER] }]])(
			`${action} rejects missing or ambiguous acknowledgment %j`,
			async (body) => {
				const commands = createIdentityPlatformSuspensionCommands(client(async () => Response.json(body)));
				await expect(run(commands)).rejects.toThrow('could not be confirmed');
			}
		);
	}
});
