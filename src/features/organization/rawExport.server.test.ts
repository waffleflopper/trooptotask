import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseOrganizationRawExportReader } from './rawExport.server';
import type { OrganizationRawExportTable } from './rawExportTypes';

const profile = {
	id: 'org-a',
	name: 'Clinic',
	created_by: 'owner-a',
	created_at: '2020-01-01T00:00:00Z',
	url_slug: null,
	archive_retention_months: null,
	suspended_at: '2026-01-01T00:00:00Z',
	critical_tasks_default_expiration_months: 12,
	critical_tasks_expiring_soon_warning_days: 30,
	loss_warning_window_days: 0,
	personnel_document_storage_cap_bytes: 0,
	training_readiness_goal_percent: 85
};
const tables = [
	'organizations',
	'organization_memberships',
	'organization_invitations',
	'organization_invitation_email_outbox',
	'access_request_organization_invitation_links'
] as const;

function provider(table: OrganizationRawExportTable, count = 1, platformAdministrator = false) {
	const savedFacts: Record<OrganizationRawExportTable, Record<string, unknown>> = {
		organizations: profile,
		organization_memberships: {
			user_id: 'member-a',
			role: 'member',
			email: null,
			member_preset: null,
			capability_overrides: { 'personnel.view': true },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-a']
		},
		organization_invitations: {
			email: 'invitee@synthetic.test',
			role: 'admin',
			status: 'pending',
			accepted_at: null,
			capability_overrides: {},
			access_scope_group_ids: [],
			expires_at: '2026-10-01T00:00:00Z'
		},
		organization_invitation_email_outbox: {
			invitation_id: 'invite-a',
			recipient: 'invitee@synthetic.test',
			purpose: 'organization_invitation',
			status: 'failed',
			attempt_count: 0,
			last_error: null,
			sent_at: null
		},
		access_request_organization_invitation_links: {
			access_request_id: 'request-a',
			organization_invitation_id: 'invite-a',
			invited_by: 'owner-a',
			invited_at: '2026-09-01T00:00:00Z',
			intended_membership_role: 'member',
			intended_permissions: { can_manage_members: false },
			intended_member_preset: null,
			intended_capability_overrides: {},
			intended_access_scope_kind: 'groups',
			intended_access_scope_group_ids: ['group-a']
		}
	};
	const ownRows: Record<string, unknown>[] =
		table === 'organizations'
			? [profile]
			: Array.from({ length: count }, (_, index) => ({
					id: String(index + 1).padStart(5, '0'),
					organization_id: 'org-a',
					...savedFacts[table],
					created_at: '2026-09-01T00:00:00Z'
				}));
	const foreign =
		table === 'organizations'
			? { ...profile, id: 'org-b' }
			: { ...ownRows[0], id: 'foreign', organization_id: 'org-b' };
	const rows = [...ownRows].reverse().concat(foreign);
	const state = { requests: [] as string[], failFrom: null as number | null, nullData: false };
	const client = createClient('http://127.0.0.1:9', 'synthetic-ordinary-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				state.requests.push(url.href);
				if (url.pathname !== `/rest/v1/${table}` || (init?.method ?? 'GET') !== 'GET')
					throw new Error('Ordinary export may read only its selected Organization table');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.failFrom !== null && offset >= state.failFrom)
					return Response.json({ message: 'Saved Organization rows unavailable', code: '42501' }, { status: 403 });
				if (state.nullData) return Response.json(null);
				if (table === 'access_request_organization_invitation_links' && !platformAdministrator)
					return Response.json([]);
				const scopeColumn = table === 'organizations' ? 'id' : 'organization_id';
				let scoped = rows.filter((row) => url.searchParams.get(scopeColumn) === `eq.${row[scopeColumn]}`);
				if (url.searchParams.get('order') === 'id.asc')
					scoped = scoped.sort((left, right) => String(left.id).localeCompare(String(right.id)));
				const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000);
				const fields = url.searchParams.get('select');
				return Response.json(
					scoped.slice(offset, offset + limit).map((row) => {
						const saved = table === 'organizations' ? { ...row, provider_internal_column: 'not exported' } : row;
						return !fields || fields === '*'
							? saved
							: Object.fromEntries(fields.split(',').map((field) => [field, saved[field as keyof typeof saved]]));
					})
				);
			}
		}
	});
	return { reader: createSupabaseOrganizationRawExportReader(client), ownRows, state };
}

describe('ordinary Organization raw export provider', () => {
	it.each(tables)('preserves saved %s rows and excludes another Organization', async (table) => {
		const fixture = provider(table, 1, true);
		expect(fixture.state.requests).toEqual([]);
		await expect(fixture.reader.listRows('org-a', table)).resolves.toEqual(fixture.ownRows);
	});

	it('retains the ordinary client’s empty invitation provenance visibility', async () => {
		const fixture = provider('access_request_organization_invitation_links');
		await expect(fixture.reader.listRows('org-a', 'access_request_organization_invitation_links')).resolves.toEqual([]);
	});

	it.each(tables.filter((table) => table !== 'organizations'))('reads every ordered page of %s', async (table) => {
		const fixture = provider(table, 1001, true);
		await expect(fixture.reader.listRows('org-a', table)).resolves.toEqual(fixture.ownRows);
	});

	it.each(tables)('propagates a %s provider error', async (table) => {
		const fixture = provider(table, 1, true);
		fixture.state.failFrom = 0;
		await expect(fixture.reader.listRows('org-a', table)).rejects.toThrow('Saved Organization rows unavailable');
	});

	it.each(tables.filter((table) => table !== 'organizations'))(
		'rejects a late %s page instead of returning partial rows',
		async (table) => {
			const fixture = provider(table, 1001, true);
			fixture.state.failFrom = 1000;
			await expect(fixture.reader.listRows('org-a', table)).rejects.toThrow('Saved Organization rows unavailable');
		}
	);

	it('keeps an error-free missing profile empty', async () => {
		const fixture = provider('organizations');
		fixture.state.nullData = true;
		await expect(fixture.reader.listRows('org-a', 'organizations')).resolves.toEqual([]);
	});

	it('rejects unrelated raw platform tables before provider access', async () => {
		const fixture = provider('organizations');
		await expect(
			fixture.reader.listRows('org-a', 'access_requests' as OrganizationRawExportTable)
		).rejects.toMatchObject({ status: 400 });
		expect(fixture.state.requests).toEqual([]);
	});
});
