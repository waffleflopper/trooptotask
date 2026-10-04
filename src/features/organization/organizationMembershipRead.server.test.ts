import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectEffectiveMemberAccess } from '$lib/access/memberAccessProjection';
import { countOrganizationMembers, readOrganizationMembershipAccess } from './organizationMembershipRead.server';

function provider(rows: Array<Record<string, unknown>>) {
	const state = { fail: false, includeCount: true };
	const requests: Array<{ url: URL; headers: Headers; returnedRows: number }> = [];
	const client = createClient('http://organization-membership.invalid', 'synthetic-user-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				if (url.pathname !== '/rest/v1/organization_memberships' || init?.method !== 'GET')
					throw new Error('Unexpected provider request');
				if (state.fail)
					return Response.json(
						{ message: 'membership provider unavailable' },
						{ status: 503, headers: { 'retry-after': '0' } }
					);
				const selected = rows.filter((row) =>
					['user_id', 'organization_id'].every(
						(column) => !url.searchParams.has(column) || url.searchParams.get(column) === `eq.${row[column]}`
					)
				);
				const offset = Number(url.searchParams.get('offset') ?? 0);
				const limit = Number(url.searchParams.get('limit') ?? selected.length);
				const columns = (url.searchParams.get('select') ?? '*').split(',').map((column) => column.trim());
				const page = selected
					.slice(offset, offset + limit)
					.map((row) =>
						Object.fromEntries(
							Object.entries(row).filter(([column]) => columns.includes('*') || columns.includes(column))
						)
					);
				const headers = new Headers(init?.headers);
				requests.push({ url, headers, returnedRows: page.length });
				const responseHeaders = new Headers();
				if (state.includeCount && headers.get('prefer')?.includes('count='))
					responseHeaders.set('content-range', `${selected.length ? '0-0' : '*'}/${selected.length}`);
				return Response.json(page, { headers: responseHeaders });
			}
		}
	});
	return { client, requests, state };
}

afterEach(() => vi.restoreAllMocks());

describe('Organization membership access read', () => {
	it('uses only the requested account and Organization, preserving normalized access for the request cache', async () => {
		const { client } = provider([
			{ id: 'peer-owner', user_id: 'peer', organization_id: 'alpha', role: 'owner' },
			{ id: 'foreign-admin', user_id: 'actor', organization_id: 'bravo', role: 'admin' },
			{
				id: 'actor-alpha',
				user_id: 'actor',
				organization_id: 'alpha',
				email: 'private@example.invalid',
				role: 'member',
				member_preset: 'operator',
				capability_overrides: { training: 'view', calendar: 'none' },
				access_scope_kind: 'groups',
				access_scope_group_ids: ['clinic', 'clinic', 'aid-station']
			}
		]);
		const row = await readOrganizationMembershipAccess(client, 'actor', 'alpha');
		expect(row).toEqual({
			id: 'actor-alpha',
			role: 'member',
			member_preset: 'operator',
			capability_overrides: { training: 'view', calendar: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['clinic', 'clinic', 'aid-station']
		});
		expect(projectEffectiveMemberAccess(row)).toMatchObject({
			role: 'member',
			memberPreset: 'operator',
			canManageMembers: false,
			capabilityMap: { calendar: 'none', training: 'view', personnel: 'operate' },
			scopeSet: { kind: 'groups', groupIds: ['clinic', 'aid-station'] }
		});
	});

	it('denies an absent membership instead of using a peer or a foreign Organization grant', async () => {
		const { client } = provider([
			{ user_id: 'peer', organization_id: 'alpha', role: 'owner' },
			{ user_id: 'actor', organization_id: 'bravo', role: 'admin' }
		]);
		await expect(readOrganizationMembershipAccess(client, 'actor', 'alpha')).rejects.toMatchObject({ status: 403 });
	});

	it('reports provider failure as 500, distinct from an absent membership', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { client, state } = provider([]);
		state.fail = true;
		await expect(readOrganizationMembershipAccess(client, 'actor', 'alpha')).rejects.toMatchObject({
			status: 500,
			body: { message: 'Internal server error' }
		});
	});

	it('rejects members whose replacement access preset is missing', async () => {
		const { client } = provider([{ user_id: 'actor', organization_id: 'alpha', role: 'member', member_preset: null }]);
		await expect(readOrganizationMembershipAccess(client, 'actor', 'alpha')).rejects.toMatchObject({ status: 500 });
	});

	it.each(['owner', 'admin'] as const)('retains %s access without requiring a member preset', async (role) => {
		const { client } = provider([{ id: 'privileged', user_id: 'actor', organization_id: 'alpha', role }]);
		const row = await readOrganizationMembershipAccess(client, 'actor', 'alpha');
		expect(projectEffectiveMemberAccess(row)).toMatchObject({
			role,
			isPrivileged: true,
			canManageMembers: true,
			scopeSet: { kind: 'organization' },
			capabilityMap: { training: 'configure', calendar: 'configure', personnel: 'configure' }
		});
	});
});

describe('Organization setup member count', () => {
	it('counts all visible Organization members while transferring only one ID with an estimated count', async () => {
		const { client, requests } = provider([
			{
				id: 'local-owner',
				organization_id: 'alpha',
				user_id: 'actor',
				role: 'owner',
				email: 'private@example.invalid'
			},
			{ id: 'local-member', organization_id: 'alpha', user_id: 'peer', role: 'member' },
			{ id: 'local-admin', organization_id: 'alpha', user_id: 'leader', role: 'admin' },
			{ id: 'foreign', organization_id: 'bravo', user_id: 'actor', role: 'owner' }
		]);
		await expect(countOrganizationMembers(client, 'alpha')).resolves.toBe(3);
		expect(requests[0].returnedRows).toBe(1);
		expect(requests[0].url.searchParams.get('select')).toBe('id');
		expect(requests[0].headers.get('prefer')).toContain('count=estimated');
		await expect(countOrganizationMembers(client, 'empty')).resolves.toBe(0);
	});

	it('keeps the existing zero fallback when the provider omits its count', async () => {
		const { client, state } = provider([{ id: 'local', organization_id: 'alpha' }]);
		state.includeCount = false;
		await expect(countOrganizationMembers(client, 'alpha')).resolves.toBe(0);
	});

	it('rejects a failed count instead of treating unavailable support as an empty Organization', async () => {
		const { client, state } = provider([]);
		state.fail = true;
		await expect(countOrganizationMembers(client, 'alpha')).rejects.toThrow('membership provider unavailable');
	});
});
