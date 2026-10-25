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
				mfaEnabled: false,
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

	it('pages People in one SQL read without downloading Auth accounts', async () => {
		const reader = createIdentityPlatformSupportReader(
			client(async (input, init) => {
				const request = new Request(input, init);
				expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/platform_account_directory');
				expect(await request.json()).toEqual({
					p_search: 'Dana',
					p_filter: 'notSetUp',
					p_sort: 'person',
					p_dir: 'asc',
					p_page: 3,
					p_limit: 20
				});
				return Response.json({ people: [], totalCount: 0, page: 1, limit: 20 });
			})
		);
		await expect(
			reader.listPeople({
				search: 'Dana',
				filter: 'notSetUp',
				sort: { key: 'person', direction: 'asc' },
				page: 3,
				limit: 20
			})
		).resolves.toEqual({
			people: [],
			totalCount: 0,
			page: 1,
			limit: 20
		});
	});
	it('rejects a failed directory read rather than showing an empty directory', async () => {
		const reader = createIdentityPlatformSupportReader(
			client(async () => Response.json({ message: 'unavailable' }, { status: 500 }))
		);
		await expect(
			reader.listPeople({ search: '', filter: 'all', sort: { key: 'added', direction: 'desc' }, page: 1, limit: 20 })
		).rejects.toThrow('Unable to load People');
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

	it('loads every inviter label within Auth concurrency and profile filter budgets', async () => {
		const ids = Array.from({ length: 401 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
		const expected = new Map(
			ids.map((id, index) => [
				id,
				{ email: `inviter-${index}@example.test`, firstName: 'Inviter', lastName: String(index) }
			])
		);
		let activeAccounts = 0;
		let peakAccounts = 0;
		const reader = createIdentityPlatformSupportReader(
			client(async (input) => {
				const url = new URL(input.toString());
				if (url.pathname.startsWith('/auth/v1/admin/users/')) {
					activeAccounts++;
					peakAccounts = Math.max(peakAccounts, activeAccounts);
					const withinBudget = activeAccounts <= 10;
					await Promise.resolve();
					activeAccounts--;
					if (!withinBudget) return Response.json({ message: 'Account request limit' }, { status: 429 });
					const id = url.pathname.split('/').at(-1)!;
					return Response.json({ id, email: expected.get(id)!.email, created_at: '2026-06-01' });
				}
				expect(url.pathname).toBe('/rest/v1/user_profiles');
				const requested = url.searchParams.get('user_id')!.slice(4, -1).split(',');
				if (requested.length > 200) return Response.json({ message: 'Filter too large' }, { status: 414 });
				return Response.json(
					requested.map((user_id) => ({
						user_id,
						first_name: 'Inviter',
						last_name: expected.get(user_id)!.lastName
					}))
				);
			})
		);
		await expect(reader.loadUserLabels([...ids, ids[0]])).resolves.toEqual(expected);
		expect(peakAccounts).toBeLessThanOrEqual(10);
	});

	it('returns no inviter labels without contacting the provider for empty input', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('No provider request is needed'));
		const reader = createIdentityPlatformSupportReader(client(fetch));
		await expect(reader.loadUserLabels([])).resolves.toEqual(new Map());
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('Identity platform suspension facts and effects', () => {
	it('rejects a suspension detail row belonging to another account', async () => {
		const reader = createIdentityPlatformSupportReader(
			client(async () =>
				Response.json({ user_id: OTHER, suspended_at: '2026-06-01', suspended_by: ADMIN, reason: null })
			)
		);
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

	it('propagates suspension detail failures instead of verified unsuspended state', async () => {
		const reader = createIdentityPlatformSupportReader(
			client(async () => Response.json({ message: 'private-provider-detail' }, { status: 500 }))
		);
		await expect(reader.getSuspensionForUser(USER)).rejects.toThrow();
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
