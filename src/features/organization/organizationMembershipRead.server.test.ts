import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectEffectiveMemberAccess } from '$lib/access/memberAccessProjection';
import {
	countOrganizationMembers,
	readOrganizationMembershipAccess,
	readOrganizationMembershipForRequest
} from './organizationMembershipRead.server';

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
				if (headers.get('accept')?.includes('vnd.pgrst.object')) {
					if (page.length !== 1)
						return Response.json({ code: 'PGRST116', message: 'Expected one membership row' }, { status: 406 });
					return Response.json(page[0], { headers: responseHeaders });
				}
				return Response.json(page, { headers: responseHeaders });
			}
		}
	});
	return { client, requests, state };
}

afterEach(() => vi.restoreAllMocks());

const membershipReaders = [
	{ name: 'shell access', read: readOrganizationMembershipAccess },
	{ name: 'request admission', read: readOrganizationMembershipForRequest }
];

describe.each(membershipReaders)('$name membership read', ({ read }) => {
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
		const row = await read(client, 'actor', 'alpha');
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

	it.each([undefined, null, 'custom'])('rejects an invalid member preset %s before granting access', async (preset) => {
		const { client } = provider([
			{ user_id: 'actor', organization_id: 'alpha', role: 'member', member_preset: preset }
		]);
		await expect(read(client, 'actor', 'alpha')).rejects.toMatchObject({
			status: 500,
			body: { message: 'Membership row is missing normalized member access storage' }
		});
	});

	it.each(['owner', 'admin'] as const)('retains %s access without requiring a member preset', async (role) => {
		const { client } = provider([{ id: 'privileged', user_id: 'actor', organization_id: 'alpha', role }]);
		const row = await read(client, 'actor', 'alpha');
		expect(projectEffectiveMemberAccess(row)).toMatchObject({
			role,
			isPrivileged: true,
			canManageMembers: true,
			scopeSet: { kind: 'organization' },
			capabilityMap: { training: 'configure', calendar: 'configure', personnel: 'configure' }
		});
	});
});

describe('Organization membership failure delivery', () => {
	it.each([
		{ read: readOrganizationMembershipAccess, message: 'You are not a member of this organization' },
		{ read: readOrganizationMembershipForRequest, message: 'Not a member of this organization' }
	])('denies an absent membership with its existing copy: $message', async ({ read, message }) => {
		const { client } = provider([
			{ user_id: 'peer', organization_id: 'alpha', role: 'owner' },
			{ user_id: 'actor', organization_id: 'bravo', role: 'admin' }
		]);
		await expect(read(client, 'actor', 'alpha')).rejects.toMatchObject({ status: 403, body: { message } });
	});

	it('reports a shell provider failure as 500, distinct from an absent membership', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { client, state } = provider([]);
		state.fail = true;
		await expect(readOrganizationMembershipAccess(client, 'actor', 'alpha')).rejects.toMatchObject({
			status: 500,
			body: { message: 'Internal server error' }
		});
	});

	it('retains the request-admission 403 response when the provider returns an error without data', async () => {
		const { client, state } = provider([]);
		state.fail = true;
		await expect(readOrganizationMembershipForRequest(client, 'actor', 'alpha')).rejects.toMatchObject({
			status: 403,
			body: { message: 'Not a member of this organization' }
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
