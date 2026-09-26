import { describe, expect, it, vi } from 'vitest';
import {
	createSupabaseAccountSetupAuthAdapter,
	createSupabaseAccountSetupCompletionStore
} from './accountSetupCompletionSupabase.server';
import { AccountSetupIdentityMismatchError, AccountSetupPasswordRejectedError } from './accountSetupCompletion.server';
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
	it('treats an incomplete database reconciliation result as support-only', async () => {
		const store = createSupabaseAccountSetupCompletionStore({
			rpc: vi.fn().mockResolvedValue({ data: { state: 'committed' }, error: null })
		} as never);

		await expect(store.reconcileClaim({ setupLinkId: 'link-1', accessRequestId: 'request-1' })).resolves.toEqual({
			state: 'support-required'
		});
	});

	it('updates an indexed existing User Account with the admitted setup attempt', async () => {
		const { builder: lookupBuilder } = createIdentityLookupBuilder();
		const adminClient = makeAdminClient({ tableBuilders: [lookupBuilder] });
		const adapter = createSupabaseAccountSetupAuthAdapter(adminClient as never, makeSessionClient() as never);

		await adapter.createOrActivateConfirmedUser({
			email: ' Soldier@Example.MIL ',
			password: 'ValidPassword123!',
			attemptId: 'admitted-attempt-1'
		});

		expect(adminClient.auth.admin.createUser).not.toHaveBeenCalled();
		expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith('existing-user-1', {
			password: 'ValidPassword123!',
			email_confirm: true,
			user_metadata: { ttt_setup_attempt: 'admitted-attempt-1' }
		});
	});

	it('normalizes User Account email identities', () => {
		expect(normalizeUserEmailIdentity(' Soldier@Example.MIL ')).toBe('soldier@example.mil');
	});

	it('creates a confirmed User Account with the admitted setup attempt', async () => {
		const { builder: lookupBuilder } = createIdentityLookupBuilder({ data: null, error: null });
		const adminClient = makeAdminClient({
			createUserResult: {
				data: { user: { id: 'new-user-1' } },
				error: null
			},
			tableBuilders: [lookupBuilder]
		});
		const adapter = createSupabaseAccountSetupAuthAdapter(adminClient as never, makeSessionClient() as never);

		const result = await adapter.createOrActivateConfirmedUser({
			email: ' Soldier@Example.MIL ',
			password: 'ValidPassword123!',
			attemptId: 'admitted-attempt-1'
		});

		expect(result).toEqual({ userId: 'new-user-1' });
		expect(adminClient.auth.admin.createUser).toHaveBeenCalledWith({
			email: 'soldier@example.mil',
			password: 'ValidPassword123!',
			email_confirm: true,
			user_metadata: { ttt_setup_attempt: 'admitted-attempt-1' }
		});
		expect(adminClient.auth.admin.updateUserById).not.toHaveBeenCalled();
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

		const attempt = adapter.createOrActivateConfirmedUser({
			email: 'soldier@example.mil',
			password: 'ValidPassword123!',
			attemptId: 'admitted-attempt-1'
		});
		if ('code' in providerError) {
			await expect(attempt).rejects.toBeInstanceOf(AccountSetupPasswordRejectedError);
		} else {
			await expect(attempt).rejects.toBe(providerError);
		}
		expect(adminClient.auth.admin.updateUserById).not.toHaveBeenCalled();
	});

	it.each([
		{ code: 'user_already_exists', message: 'User already exists' },
		{ message: 'A user with this email address has already been registered' }
	])('does not update an unindexed Auth user after duplicate create result %j', async (providerError) => {
		const { builder: lookupBuilder } = createIdentityLookupBuilder({ data: null, error: null });
		const adminClient = makeAdminClient({
			createUserResult: { data: { user: null }, error: providerError },
			tableBuilders: [lookupBuilder]
		});
		const adapter = createSupabaseAccountSetupAuthAdapter(adminClient as never, makeSessionClient() as never);

		await expect(
			adapter.createOrActivateConfirmedUser({
				email: 'soldier@example.mil',
				password: 'ValidPassword123!',
				attemptId: 'admitted-attempt-1'
			})
		).rejects.toBeInstanceOf(AccountSetupIdentityMismatchError);
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
				password: 'short',
				attemptId: 'admitted-attempt-1'
			})
		).rejects.toEqual({ message: 'Password should be at least 12 characters' });
		expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith('existing-user-1', {
			password: 'short',
			email_confirm: true,
			user_metadata: { ttt_setup_attempt: 'admitted-attempt-1' }
		});
	});

	it('classifies a structured password rejection on an existing User Account', async () => {
		const { builder: lookupBuilder } = createIdentityLookupBuilder();
		const adminClient = makeAdminClient({
			tableBuilders: [lookupBuilder],
			updateUserResult: {
				data: { user: null },
				error: { code: 'weak_password', message: 'Password is known to be weak', status: 422 }
			}
		});
		const adapter = createSupabaseAccountSetupAuthAdapter(adminClient as never, makeSessionClient() as never);

		await expect(
			adapter.createOrActivateConfirmedUser({
				email: 'soldier@example.mil',
				password: 'RejectedPassword123!',
				attemptId: 'admitted-attempt-1'
			})
		).rejects.toBeInstanceOf(AccountSetupPasswordRejectedError);
		expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledOnce();
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

	it('preserves the email claim denial returned by the database', async () => {
		const rpc = vi.fn().mockReturnValue({
			single: vi.fn().mockResolvedValue({ data: { claim_status: 'claim-in-progress' }, error: null })
		});
		const store = createSupabaseAccountSetupCompletionStore({ rpc } as never);

		await expect(
			store.claimSetupLinkForSession({
				setupLinkId: 'link-2',
				accessRequestId: 'request-1',
				claimedAt: new Date('2026-05-22T12:01:00.000Z')
			})
		).resolves.toEqual({ status: 'claim-in-progress' });
	});
});
