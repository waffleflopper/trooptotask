import { describe, expect, it, vi } from 'vitest';
import {
	createSupabaseAccountSetupAuthAdapter,
	createSupabaseAccountSetupCompletionStore
} from './accountSetupCompletionSupabase.server';
import { normalizeUserEmailIdentity } from '$lib/server/userEmailIdentities';

type Call = { method: string; args: unknown[] };

function createIdentityLookupBuilder(
	result: { data: { user_id: string; normalized_email: string } | null; error: unknown } = {
		data: { user_id: 'existing-user-1', normalized_email: 'soldier@example.mil' },
		error: null
	}
) {
	const calls: Call[] = [];

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		select: track('select'),
		eq: track('eq'),
		maybeSingle: (...args: unknown[]) => {
			calls.push({ method: 'maybeSingle', args });
			return result;
		}
	};

	return { builder, calls };
}

function createIdentityUpsertBuilder(result: { error: unknown } = { error: null }) {
	const calls: Call[] = [];
	const builder = {
		upsert: (...args: unknown[]) => {
			calls.push({ method: 'upsert', args });
			return result;
		}
	};

	return { builder, calls };
}

function makeAdminClient(
	options: {
		createUserResult?: unknown;
		updateUserResult?: unknown;
		tableBuilders?: unknown[];
	} = {}
) {
	const tableBuilders = [...(options.tableBuilders ?? [])];

	return {
		from: vi.fn((table: string) => {
			if (table !== 'user_email_identities') {
				throw new Error(`Unexpected table ${table}`);
			}

			const builder = tableBuilders.shift();
			if (!builder) {
				throw new Error('Missing user email identity table builder');
			}

			return builder;
		}),
		auth: {
			admin: {
				createUser: vi.fn().mockResolvedValue(
					options.createUserResult ?? {
						data: { user: null },
						error: { code: 'user_already_exists', message: 'User already exists' }
					}
				),
				updateUserById: vi.fn().mockResolvedValue(
					options.updateUserResult ?? {
						data: { user: { id: 'existing-user-1' } },
						error: null
					}
				)
			}
		}
	};
}

function makeSessionClient() {
	return {
		auth: {
			signInWithPassword: vi.fn().mockResolvedValue({ error: null })
		}
	};
}

describe('Supabase Account Setup auth adapter', () => {
	it('normalizes User Account email identities', () => {
		expect(normalizeUserEmailIdentity(' Soldier@Example.MIL ')).toBe('soldier@example.mil');
	});

	it('records an indexed identity when creating a new confirmed User Account', async () => {
		const { builder: upsertBuilder, calls: upsertCalls } = createIdentityUpsertBuilder();
		const adminClient = makeAdminClient({
			createUserResult: {
				data: { user: { id: 'new-user-1' } },
				error: null
			},
			tableBuilders: [upsertBuilder]
		});
		const adapter = createSupabaseAccountSetupAuthAdapter(adminClient as never, makeSessionClient() as never);

		const result = await adapter.createOrActivateConfirmedUser({
			email: ' Soldier@Example.MIL ',
			password: 'ValidPassword123!'
		});

		expect(result).toEqual({ userId: 'new-user-1' });
		expect(adminClient.auth.admin.createUser).toHaveBeenCalledWith({
			email: 'soldier@example.mil',
			password: 'ValidPassword123!',
			email_confirm: true
		});
		expect(upsertCalls).toContainEqual({
			method: 'upsert',
			args: [{ user_id: 'new-user-1', normalized_email: 'soldier@example.mil' }, { onConflict: 'user_id' }]
		});
		expect(adminClient.auth.admin.updateUserById).not.toHaveBeenCalled();
	});

	it.each([
		{ code: 'user_already_exists', status: 422, message: 'User already exists' },
		{ code: 'email_exists', status: 422, message: 'Email already exists' },
		{ status: 422, message: 'A user with this email address has already been registered' }
	])('activates an existing User Account by indexed identity lookup for %j', async (providerError) => {
		const { builder: lookupBuilder, calls: lookupCalls } = createIdentityLookupBuilder({
			data: { user_id: 'existing-user-2', normalized_email: 'soldier@example.mil' },
			error: null
		});
		const { builder: upsertBuilder, calls: upsertCalls } = createIdentityUpsertBuilder();
		const adminClient = makeAdminClient({
			createUserResult: { data: { user: null }, error: providerError },
			tableBuilders: [lookupBuilder, upsertBuilder]
		});
		const adapter = createSupabaseAccountSetupAuthAdapter(adminClient as never, makeSessionClient() as never);

		const result = await adapter.createOrActivateConfirmedUser({
			email: ' Soldier@Example.MIL ',
			password: 'ValidPassword123!'
		});

		expect(result).toEqual({ userId: 'existing-user-2' });
		expect(adminClient.from).toHaveBeenNthCalledWith(1, 'user_email_identities');
		expect(lookupCalls).toContainEqual({ method: 'select', args: ['user_id, normalized_email'] });
		expect(lookupCalls).toContainEqual({ method: 'eq', args: ['normalized_email', 'soldier@example.mil'] });
		expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith('existing-user-2', {
			password: 'ValidPassword123!',
			email_confirm: true
		});
		expect(upsertCalls).toContainEqual({
			method: 'upsert',
			args: [{ user_id: 'existing-user-2', normalized_email: 'soldier@example.mil' }, { onConflict: 'user_id' }]
		});
	});

	it.each([
		{ code: 'weak_password', status: 422, message: 'Password is known to be weak and easy to guess' },
		{ code: 'weak_password', status: 422, message: 'Password already exists in a leaked password database' },
		{ status: 422, message: 'Unable to validate email address' }
	])('preserves a non-duplicate provider rejection without activating an account for %j', async (providerError) => {
		const { builder: lookupBuilder } = createIdentityLookupBuilder({ data: null, error: null });
		const adminClient = makeAdminClient({
			createUserResult: { data: { user: null }, error: providerError },
			tableBuilders: [lookupBuilder]
		});
		const adapter = createSupabaseAccountSetupAuthAdapter(adminClient as never, makeSessionClient() as never);

		await expect(
			adapter.createOrActivateConfirmedUser({ email: 'soldier@example.mil', password: 'ValidPassword123!' })
		).rejects.toBe(providerError);
		expect(adminClient.from).not.toHaveBeenCalled();
		expect(adminClient.auth.admin.updateUserById).not.toHaveBeenCalled();
	});

	it('fails clearly when an existing-user error has no indexed identity', async () => {
		const { builder: lookupBuilder } = createIdentityLookupBuilder({ data: null, error: null });
		const adminClient = makeAdminClient({ tableBuilders: [lookupBuilder] });
		const adapter = createSupabaseAccountSetupAuthAdapter(adminClient as never, makeSessionClient() as never);

		await expect(
			adapter.createOrActivateConfirmedUser({
				email: 'soldier@example.mil',
				password: 'ValidPassword123!'
			})
		).rejects.toThrow('Could not find existing User Account email identity');
		expect(adminClient.auth.admin.updateUserById).not.toHaveBeenCalled();
	});

	it('surfaces password update failures for existing User Accounts', async () => {
		const { builder: lookupBuilder } = createIdentityLookupBuilder();
		const adminClient = makeAdminClient({
			tableBuilders: [lookupBuilder],
			updateUserResult: {
				data: { user: null },
				error: { message: 'Password should be at least 12 characters' }
			}
		});
		const adapter = createSupabaseAccountSetupAuthAdapter(adminClient as never, makeSessionClient() as never);

		await expect(
			adapter.createOrActivateConfirmedUser({
				email: 'soldier@example.mil',
				password: 'short'
			})
		).rejects.toEqual({ message: 'Password should be at least 12 characters' });
		expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith('existing-user-1', {
			password: 'short',
			email_confirm: true
		});
	});

	it('records setup completion without creating an Organization Membership', async () => {
		const from = vi.fn((table: string) => {
			if (table === 'access_requests') {
				return {
					update: vi.fn(() => ({
						eq: vi.fn(() => ({
							is: vi.fn(() => ({
								select: vi.fn(() => ({
									maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'request-1' }, error: null })
								}))
							}))
						}))
					}))
				};
			}

			if (table === 'user_profiles') {
				return {
					upsert: vi.fn().mockResolvedValue({ error: null })
				};
			}

			throw new Error(`Unexpected setup persistence effect: ${table}`);
		});
		const store = createSupabaseAccountSetupCompletionStore({ from } as never);

		await store.upsertUserProfile({ userId: 'user-123', firstName: 'Person', lastName: 'Example' });
		await store.markAccessRequestSetupCompleted('request-1', 'user-123', new Date('2026-05-22T12:00:00.000Z'));

		expect(from).toHaveBeenCalledWith('user_profiles');
		expect(from).toHaveBeenCalledWith('access_requests');
		expect(from).not.toHaveBeenCalledWith('organization_members');
	});

	it('rejects a zero-row Access Request completion update', async () => {
		const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
		const from = vi.fn(() => ({
			update: () => ({
				eq: () => ({
					is: () => ({ select: () => ({ maybeSingle }) })
				})
			})
		}));
		const store = createSupabaseAccountSetupCompletionStore({ from } as never);

		await expect(
			store.markAccessRequestSetupCompleted('request-1', 'user-123', new Date('2026-05-22T12:00:00.000Z'))
		).rejects.toThrow('Access Request setup completion was not recorded');
		expect(from).toHaveBeenCalledWith('access_requests');
		expect(maybeSingle).toHaveBeenCalledOnce();
	});

	it('claims setup sessions through the database-owned transition RPC', async () => {
		const rpc = vi.fn().mockReturnValue({
			single: vi.fn().mockResolvedValue({
				data: {
					claim_status: 'claim-started',
					setup_link_id: 'link-1',
					access_request_id: 'request-1',
					expires_at: '2026-06-05T12:00:00.000Z',
					created_at: '2026-05-22T12:00:00.000Z',
					claimed_at: '2026-05-22T12:01:00.000Z',
					failed_at: null,
					failure_reason: null,
					used_at: null,
					revoked_at: null,
					revocation_reason: null
				},
				error: null
			})
		});
		const store = createSupabaseAccountSetupCompletionStore({
			rpc,
			from: vi.fn()
		} as never);

		const result = await store.claimSetupLinkForSession({
			setupLinkId: 'link-1',
			accessRequestId: 'request-1',
			claimedAt: new Date('2026-05-22T12:01:00.000Z')
		});

		expect(result).toMatchObject({
			status: 'claim-started',
			accessRequestId: 'request-1',
			link: { id: 'link-1', accessRequestId: 'request-1' }
		});
		expect(rpc).toHaveBeenCalledWith('claim_account_setup_link_for_session', {
			p_setup_link_id: 'link-1',
			p_access_request_id: 'request-1',
			p_claimed_at: '2026-05-22T12:01:00.000Z'
		});
	});
});
