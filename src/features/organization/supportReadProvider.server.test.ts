import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createOrganizationSupportReader,
	createOrganizationSupportSuspensionCommands
} from './supportReadProvider.server';

function client(fetch: typeof globalThis.fetch) {
	return createClient('http://localhost:9', 'synthetic-service-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch }
	});
}

describe('Organization platform support aggregates', () => {
	it('returns distinct owner anomalies and aggregate memberships without inventing an owner', async () => {
		const reader = createOrganizationSupportReader(
			client(async (input, init) => {
				const request = new Request(input, init);
				const resource = new URL(request.url).pathname;
				const { p_org_ids: ids } = await request.json();
				const memberships = [
					{ organization_id: 'single', membership_count: '4' },
					{ organization_id: 'multiple', membership_count: 2 },
					{ organization_id: 'outside', membership_count: 99 }
				];
				const owners = [
					{ organization_id: 'single', owner_count: '1', owner_user_id: 'owner', owner_email: null },
					{ organization_id: 'multiple', owner_count: 2, owner_user_id: null, owner_email: null },
					{
						organization_id: 'outside',
						owner_count: 1,
						owner_user_id: 'foreign-owner',
						owner_email: 'outside@example.test'
					}
				];
				if (resource === '/rest/v1/rpc/count_memberships_by_organization')
					return Response.json(memberships.filter((row) => ids.includes(row.organization_id)));
				if (resource === '/rest/v1/rpc/list_platform_owner_membership_metrics')
					return Response.json(owners.filter((row) => ids.includes(row.organization_id)));
				return Response.json({ message: 'Source unavailable' }, { status: 404 });
			})
		);
		const ids = ['single', 'multiple', 'none'];
		await expect(reader.countMembershipsByOrganization(ids)).resolves.toEqual(
			new Map([
				['single', 4],
				['multiple', 2]
			])
		);
		await expect(reader.listOwnerMembershipMetricsByOrganization(ids)).resolves.toEqual([
			{
				organizationId: 'single',
				ownerCount: 1,
				singleOwner: { organizationId: 'single', userId: 'owner', email: null }
			},
			{ organizationId: 'multiple', ownerCount: 2, singleOwner: null }
		]);
	});

	it('does not report no owner when a single-owner response cannot identify its member', async () => {
		const reader = createOrganizationSupportReader(
			client(async () =>
				Response.json([{ organization_id: 'able', owner_count: 1, owner_user_id: null, owner_email: null }])
			)
		);
		await expect(reader.listOwnerMembershipMetricsByOrganization(['able'])).rejects.toThrow(
			'Owner membership could not be identified'
		);
	});

	it.each(['countMembershipsByOrganization', 'listOwnerMembershipMetricsByOrganization'] as const)(
		'propagates a failed %s aggregate',
		async (method) => {
			const reader = createOrganizationSupportReader(
				client(async () => Response.json({ message: 'Denied', code: '42501' }, { status: 403 }))
			);
			await expect(reader[method](['able'])).rejects.toMatchObject({ code: '42501' });
		}
	);

	it.each([null, 'unknown', -1, 1.5])(
		'does not turn invalid membership count %s into zero',
		async (membership_count) => {
			const reader = createOrganizationSupportReader(
				client(async () => Response.json([{ organization_id: 'able', membership_count }]))
			);
			await expect(reader.countMembershipsByOrganization(['able'])).rejects.toThrow(
				'Organization count was unavailable'
			);
		}
	);
});

describe('Organization membership support projections', () => {
	it('finishes membership pages for selected users and keeps complete joined Organization facts', async () => {
		const memberships = [
			...Array.from({ length: 1005 }, (_, index) => ({
				id: `membership-${String(index).padStart(4, '0')}`,
				user_id: index < 1002 ? 'user-a' : 'user-b',
				role: 'member',
				organizations: index === 0 ? null : { id: `org-${index}`, name: `Company ${index}` }
			})),
			{ id: 'outside', user_id: 'outside', role: 'owner', organizations: { id: 'outside-org', name: 'Outside' } }
		].reverse();
		const reader = createOrganizationSupportReader(
			client(async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.pathname !== '/rest/v1/organization_memberships')
					return Response.json({ message: 'Unknown source' }, { status: 404 });
				const q = url.searchParams;
				const userFilter = q.get('user_id') ?? '';
				const ids = userFilter.startsWith('eq.')
					? [userFilter.slice(3)]
					: userFilter.slice(4, -1).replaceAll('"', '').split(',');
				let rows = memberships.filter((row) => ids.includes(row.user_id));
				if (q.get('order') === 'id.asc') rows.sort((a, b) => a.id.localeCompare(b.id));
				const offset = Number(q.get('offset') ?? 0);
				const limit = Number(q.get('limit') ?? 1000);
				rows = rows.slice(offset, offset + limit);
				if (q.get('select') === 'user_id') return Response.json(rows.map((row) => ({ user_id: row.user_id })));
				if (q.get('select') === 'role,organizations(id,name)')
					return Response.json(rows.map((row) => ({ role: row.role, organizations: row.organizations })));
				return Response.json({ message: 'Unknown projection' }, { status: 400 });
			})
		);
		const users = await reader.listMembershipUserIds(['user-a', 'user-b']);
		expect(users).toHaveLength(1005);
		expect(users.filter((id) => id === 'user-a')).toHaveLength(1002);
		expect(users.filter((id) => id === 'user-b')).toHaveLength(3);
		const detail = await reader.listMembershipsForUser('user-a');
		expect(detail).toHaveLength(1002);
		expect(detail.find((row) => row.organization === null)).toEqual({
			userId: 'user-a',
			role: 'member',
			organization: null
		});
		expect(detail.find((row) => row.organization?.id === 'org-1001')).toEqual({
			userId: 'user-a',
			role: 'member',
			organization: { id: 'org-1001', name: 'Company 1001' }
		});
	});

	it.each(['listMembershipUserIds', 'listMembershipsForUser'] as const)(
		'propagates a failed %s read instead of hiding memberships',
		async (method) => {
			const reader = createOrganizationSupportReader(
				client(async () => Response.json({ message: 'Denied', code: '42501' }, { status: 403 }))
			);
			const read = method === 'listMembershipUserIds' ? reader[method](['user']) : reader[method]('user');
			await expect(read).rejects.toMatchObject({ code: '42501' });
		}
	);
});

describe('Organization support suspension acknowledgement', () => {
	it.each([true, false])('updates only the selected Organization and acknowledges suspended=%s', async (suspended) => {
		const rows = [
			{ id: 'able', suspended_at: suspended ? null : '2026-10-01T12:00:00.000Z' },
			{ id: 'baker', suspended_at: null as string | null }
		];
		const commands = createOrganizationSupportSuspensionCommands(
			client(async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (request.method !== 'PATCH' || url.pathname !== '/rest/v1/organizations')
					return Response.json({ message: 'Unknown effect' }, { status: 400 });
				const target = rows.find((row) => `eq.${row.id}` === url.searchParams.get('id'));
				const { suspended_at } = await request.json();
				if (target) target.suspended_at = suspended_at;
				return Response.json(target ? [{ id: target.id }] : []);
			})
		);
		if (suspended)
			await commands.suspendOrganization({ organizationId: 'able', suspendedAt: new Date('2026-10-03T12:00:00Z') });
		else await commands.unsuspendOrganization('able');
		expect(rows).toEqual([
			{ id: 'able', suspended_at: suspended ? '2026-10-03T12:00:00.000Z' : null },
			{ id: 'baker', suspended_at: null }
		]);
	});

	it.each([[], null, [{ id: 'baker' }], [{ id: 'able' }, { id: 'baker' }]])(
		'does not acknowledge a missing or ambiguous target: %j',
		async (response) => {
			const commands = createOrganizationSupportSuspensionCommands(client(async () => Response.json(response)));
			await expect(commands.suspendOrganization({ organizationId: 'able', suspendedAt: new Date() })).rejects.toThrow(
				'Suspension change could not be confirmed'
			);
			await expect(commands.unsuspendOrganization('able')).rejects.toThrow('Suspension change could not be confirmed');
		}
	);

	it('propagates a rejected write without claiming acknowledgement', async () => {
		const commands = createOrganizationSupportSuspensionCommands(
			client(async () => Response.json({ message: 'Denied', code: '42501' }, { status: 403 }))
		);
		await expect(commands.unsuspendOrganization('able')).rejects.toMatchObject({ code: '42501' });
	});
});
