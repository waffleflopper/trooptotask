import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseOrganizationSettingsReader } from './settingsProvider.server';
import type { OrganizationSettingsReader } from './settingsTypes';

const ORG = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const FOREIGN = '22222222-2222-4222-8222-222222222222';
const contracts = [
	{
		method: 'listMemberAccess',
		table: 'organization_memberships',
		fields:
			'id,organization_id,user_id,email,role,created_at,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids',
		row: {
			id: 'member',
			organization_id: ORG,
			user_id: 'account',
			email: null,
			role: 'member',
			created_at: '2026-10-01',
			member_preset: null,
			capability_overrides: null,
			access_scope_kind: null,
			access_scope_group_ids: null
		}
	},
	{
		method: 'listInvitations',
		table: 'organization_invitations',
		fields:
			'id,email,role,status,created_at,expires_at,accepted_at,declined_at,revoked_at,expired_at,blocked_at,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids',
		row: {
			id: 'invitation',
			email: 'invite@example.test',
			role: 'member',
			status: 'pending',
			created_at: '2026-10-01',
			expires_at: null,
			accepted_at: null,
			declined_at: null,
			revoked_at: null,
			expired_at: null,
			blocked_at: null,
			member_preset: null,
			capability_overrides: null,
			access_scope_kind: null,
			access_scope_group_ids: null
		}
	},
	{
		method: 'listInvitationDeliveries',
		table: 'organization_invitation_email_outbox',
		fields: 'id,invitation_id,status,attempt_count,last_error,updated_at,sent_at',
		row: {
			id: 'delivery',
			invitation_id: 'invitation',
			status: 'failed',
			attempt_count: 2,
			last_error: 'Email unavailable',
			updated_at: '2026-10-01',
			sent_at: null
		}
	},
	{
		method: 'listOwnershipCandidateMemberships',
		table: 'organization_memberships',
		fields: 'id,user_id,email,role',
		row: { id: 'candidate', user_id: 'account', email: '  candidate@example.test  ', role: 'admin' }
	}
] satisfies Array<{
	method: 'listMemberAccess' | 'listInvitations' | 'listInvitationDeliveries' | 'listOwnershipCandidateMemberships';
	table: string;
	fields: string;
	row: object;
}>;

function read(
	reader: ReturnType<typeof createSupabaseOrganizationSettingsReader>,
	method: (typeof contracts)[number]['method'],
	orgId: string
) {
	return method === 'listInvitations' ? reader.listInvitations(orgId, 'pending') : reader[method](orgId);
}

function sdkFixture(
	contract: (typeof contracts)[number],
	count: number,
	fault?: 'null' | 'terminal-null' | 'first' | 'late' | 'unstructured'
) {
	const requests: URL[] = [];
	const rows = Array.from({ length: count }, (_, index) => ({
		...contract.row,
		id: `saved-${String(index).padStart(4, '0')}`,
		organization_id: ORG,
		provider_private: 'must not escape'
	}));
	const foreign = { ...contract.row, id: 'foreign', organization_id: FOREIGN };
	const client = createClient('http://settings.invalid', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				requests.push(url);
				expect(init?.method).toBe('GET');
				expect(url.pathname).toBe(`/rest/v1/${contract.table}`);
				expect(url.searchParams.get('select')).toBe(contract.fields);
				const from = Number(url.searchParams.get('offset') ?? 0);
				expect(url.searchParams.get('limit')).toBe('1000');
				if (fault === 'unstructured') return Response.json('Read refused', { status: 403 });
				if (fault === 'first' || (fault === 'late' && from === 1000))
					return Response.json({ message: 'Provider refused read', code: '42501' }, { status: 403 });
				if (fault === 'null' || (fault === 'terminal-null' && from === 1000)) return Response.json(null);
				const orderedRows = [...rows, foreign].filter(
					(row) => url.searchParams.get('organization_id') === `eq.${row.organization_id}`
				);
				if (url.searchParams.get('order')?.split(',').includes('id.asc'))
					orderedRows.sort((left, right) => left.id.localeCompare(right.id));
				else if (from > 0) orderedRows.reverse();
				return Response.json(orderedRows.slice(from, from + 1000));
			}
		}
	});
	return { reader: createSupabaseOrganizationSettingsReader(client), requests };
}

describe('five ordinary Organization settings reads with the installed SDK', () => {
	it.each(contracts)(
		'$method returns each saved row once despite unstable page ordering and excludes foreign/provider metadata',
		async (contract) => {
			const { reader, requests } = sdkFixture(contract, 1001);
			expect(requests).toEqual([]);
			const rows = await read(reader, contract.method, ORG.toUpperCase());
			const expected = Array.from({ length: 1001 }, (_, index) => ({
				...contract.row,
				id: `saved-${String(index).padStart(4, '0')}`
			}));
			expect(rows).toEqual(expected);
			expect(requests.map((url) => url.searchParams.get('offset'))).toEqual(['0', '1000']);
		}
	);
	it.each(contracts)('$method completes an exact full page and accepts a null terminal page', async (contract) => {
		const full = sdkFixture(contract, 1000, 'terminal-null');
		expect(await read(full.reader, contract.method, ORG)).toHaveLength(1000);
		expect(full.requests.map((url) => url.searchParams.get('offset'))).toEqual(['0', '1000']);
		const empty = sdkFixture(contract, 0, 'null');
		expect(await read(empty.reader, contract.method, ORG)).toEqual([]);
		expect(empty.requests).toHaveLength(1);
	});
	it.each(contracts)('$method identifies unit settings when a provider failure has no message', async (contract) => {
		const { reader } = sdkFixture(contract, 0, 'unstructured');

		await expect(read(reader, contract.method, ORG)).rejects.toEqual(new Error('Unit settings read failed'));
	});
	it.each(contracts)(
		'$method rejects first and later provider errors without returning partial data',
		async (contract) => {
			for (const fault of ['first', 'late'] as const) {
				const fixture = sdkFixture(contract, 1001, fault);
				await expect(read(fixture.reader, contract.method, ORG)).rejects.toEqual(new Error('Provider refused read'));
			}
		}
	);
	it.each(contracts.filter(({ method }) => method === 'listInvitations' || method === 'listInvitationDeliveries'))(
		'$method keeps newest rows first and resolves timestamp ties by ID',
		async (contract) => {
			const rows = [
				{ ...contract.row, id: 'a-old', created_at: '2026-10-01' },
				{ ...contract.row, id: 'c-new', created_at: '2026-10-02' },
				{ ...contract.row, id: 'b-new', created_at: '2026-10-02' }
			];
			const client = createClient('http://settings.invalid', 'synthetic-request-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: {
					fetch: async (input) => {
						const order = new URL(String(input)).searchParams.get('order')?.split(',') ?? [];
						return Response.json(
							[...rows].sort((left, right) => {
								for (const field of order) {
									const comparison =
										field === 'created_at.desc'
											? right.created_at.localeCompare(left.created_at)
											: field === 'id.asc'
												? left.id.localeCompare(right.id)
												: 0;
									if (comparison) return comparison;
								}
								return 0;
							})
						);
					}
				}
			});
			const reader = createSupabaseOrganizationSettingsReader(client);
			expect((await read(reader, contract.method, ORG)).map(({ id }) => id)).toEqual(['b-new', 'c-new', 'a-old']);
		}
	);
	it('filters invitations to pending or every other status', async () => {
		const filters: Array<string | null> = [];
		const client = createClient('http://settings.invalid', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input) => {
					filters.push(new URL(String(input)).searchParams.get('status'));
					return Response.json([]);
				}
			}
		});
		const reader = createSupabaseOrganizationSettingsReader(client);
		await reader.listInvitations(ORG, 'pending');
		await reader.listInvitations(ORG, 'closed');
		expect(filters).toEqual(['eq.pending', 'neq.pending']);
	});
	it('keeps omitted access fields omitted and present nulls intact', async () => {
		const client = createClient('http://settings.invalid', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch: async () => Response.json([{ id: 'sparse', email: null, provider_private: true }]) }
		});
		const reader = createSupabaseOrganizationSettingsReader(client);
		expect(await reader.listMemberAccess(ORG)).toEqual([{ id: 'sparse', email: null }]);
		expect(await reader.listInvitations(ORG, 'pending')).toEqual([{ id: 'sparse', email: null }]);
	});
	it('reads the pair once with single semantics, preserving null/omission and plain errors', async () => {
		const calls: { url: URL; accept: string | null }[] = [];
		let response = Response.json({
			critical_tasks_default_expiration_months: null,
			critical_tasks_expiring_soon_warning_days: 45,
			secret: true
		});
		const client = createClient('http://settings.invalid', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					calls.push({ url: new URL(String(input)), accept: new Headers(init?.headers).get('accept') });
					return response.clone();
				}
			}
		});
		const reader: OrganizationSettingsReader = createSupabaseOrganizationSettingsReader(client);
		expect(calls).toEqual([]);
		expect(await reader.findCriticalTasksDefaults(ORG.toUpperCase())).toEqual({
			defaultExpirationMonths: null,
			expiringSoonWarningDays: 45
		});
		expect(calls).toHaveLength(1);
		expect(calls[0].url.searchParams.get('id')).toBe(`eq.${ORG}`);
		expect(calls[0].url.searchParams.get('select')).toBe(
			'critical_tasks_default_expiration_months,critical_tasks_expiring_soon_warning_days'
		);
		expect(calls[0].accept).toBe('application/vnd.pgrst.object+json');
		response = Response.json({ critical_tasks_default_expiration_months: 18 });
		expect(await reader.findCriticalTasksDefaults(ORG)).toEqual({ defaultExpirationMonths: 18 });
		response = Response.json({ code: 'PGRST116', message: 'No row' }, { status: 406 });
		expect(await reader.findCriticalTasksDefaults(ORG)).toBeNull();
		response = Response.json({ code: '42501', message: 'Not admitted', status: 403 }, { status: 403 });
		const failed = reader.findCriticalTasksDefaults(ORG);
		await expect(failed).rejects.toEqual(new Error('Not admitted'));
		await expect(failed).rejects.not.toHaveProperty('status');
		await expect(failed).rejects.not.toHaveProperty('code');
	});
});
