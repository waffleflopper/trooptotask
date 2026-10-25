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

describe('Organization support suspension commands', () => {
	function rpcClient(result: unknown, calls: Array<{ name: string; body: Record<string, unknown> }> = []) {
		return client(async (input, init) => {
			const request = new Request(input, init);
			calls.push({ name: new URL(request.url).pathname.split('/').pop() ?? '', body: await request.json() });
			return Response.json(result);
		});
	}

	it('suspends through one command that carries the reason, the actor and the time', async () => {
		const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
		const commands = createOrganizationSupportSuspensionCommands(rpcClient('suspended', calls));
		await expect(
			commands.suspendOrganization({
				organizationId: 'able',
				suspendedBy: 'operator',
				reason: 'Abuse report',
				suspendedAt: new Date('2026-10-03T12:00:00Z')
			})
		).resolves.toBe('suspended');
		expect(calls).toEqual([
			{
				name: 'platform_suspend_organization',
				body: {
					p_actor_user_id: 'operator',
					p_organization_id: 'able',
					p_reason: 'Abuse report',
					p_suspended_at: '2026-10-03T12:00:00.000Z'
				}
			}
		]);
	});

	it('reports a repeat suspension as already suspended', async () => {
		const commands = createOrganizationSupportSuspensionCommands(rpcClient('already_suspended'));
		await expect(
			commands.suspendOrganization({
				organizationId: 'able',
				suspendedBy: 'operator',
				reason: 'Second request',
				suspendedAt: new Date()
			})
		).resolves.toBe('already_suspended');
	});

	it('unsuspends through one command that names the actor', async () => {
		const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
		const commands = createOrganizationSupportSuspensionCommands(rpcClient(true, calls));
		await commands.unsuspendOrganization({ organizationId: 'able', unsuspendedBy: 'operator' });
		expect(calls).toEqual([
			{ name: 'platform_unsuspend_organization', body: { p_actor_user_id: 'operator', p_organization_id: 'able' } }
		]);
	});

	it.each([false, 'not_found', null, 1, [{ id: 'able' }]])(
		'does not acknowledge a missing target: %j',
		async (response) => {
			const commands = createOrganizationSupportSuspensionCommands(rpcClient(response));
			await expect(
				commands.suspendOrganization({
					organizationId: 'able',
					suspendedBy: 'operator',
					reason: 'Reason',
					suspendedAt: new Date()
				})
			).rejects.toThrow('Suspension change could not be confirmed');
			await expect(
				commands.unsuspendOrganization({ organizationId: 'able', unsuspendedBy: 'operator' })
			).rejects.toThrow('Suspension change could not be confirmed');
		}
	);

	it('propagates a rejected write without claiming acknowledgement', async () => {
		const commands = createOrganizationSupportSuspensionCommands(
			client(async () => Response.json({ message: 'Denied', code: '42501' }, { status: 403 }))
		);
		await expect(
			commands.unsuspendOrganization({ organizationId: 'able', unsuspendedBy: 'operator' })
		).rejects.toMatchObject({ code: '42501' });
	});
});
