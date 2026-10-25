import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

const { getAdminClient, rpc } = vi.hoisted(() => ({ getAdminClient: vi.fn(), rpc: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));
const actorId = '10000000-0000-4000-8000-000000000001';
const orgId = '20000000-0000-4000-8000-000000000001';
let operator: boolean;
let assurance: { currentLevel: 'aal1' | 'aal2'; nextLevel: 'aal1' | 'aal2' };

function event(path = '/admin/organizations', authenticated = true): Parameters<typeof load>[0] {
	const url = new URL(path, 'http://localhost:9');
	return {
		locals: {
			actor: authenticated ? { userId: actorId } : null,
			user: { id: 'untrusted-other-user' },
			supabase: { auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: assurance, error: null }) } } },
			session: null
		},
		url,
		request: new Request(url),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof load>[0];
}

async function loaded(path = '/admin/organizations') {
	const result = await load(event(path));
	if (!result) throw new Error('The load returned no data');
	return result;
}

function directoryRow(overrides: Record<string, unknown> = {}) {
	return {
		total_count: 1,
		all_count: 38,
		active_week_count: 31,
		quiet_count: 4,
		suspended_count: 1,
		organization_id: orgId,
		name: 'Able Clinic',
		created_at: '2026-06-01T00:00:00.000Z',
		status: 'active',
		last_active_at: '2026-10-20T00:00:00.000Z',
		member_count: 4,
		personnel_count: 31,
		owner_count: 1,
		owner_email: 'owner@example.test',
		...overrides
	};
}

beforeEach(() => {
	operator = true;
	assurance = { currentLevel: 'aal2', nextLevel: 'aal2' };
	rpc.mockReset();
	rpc.mockResolvedValue({ data: [directoryRow()], error: null });
	getAdminClient.mockReturnValue({
		from: () => {
			const query = {
				select: () => query,
				eq: () => query,
				maybeSingle: async () => ({ data: operator ? { user_id: actorId } : null, error: null })
			};
			return query;
		},
		rpc
	});
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('Organizations list load', () => {
	it('asks the database for every row up to the requested page with a cleaned search and filter', async () => {
		await load(event('/admin/organizations?pages=3&q=%20Able%20&filter=quiet'));
		expect(rpc).toHaveBeenCalledTimes(1);
		expect(rpc).toHaveBeenCalledWith('platform_list_organizations', {
			p_search: 'Able',
			p_filter: 'quiet',
			p_page: 1,
			p_page_size: 75
		});
	});

	it.each([
		['/admin/organizations?filter=everything&pages=-4', { filter: 'all', pages: 1 }],
		['/admin/organizations?pages=abc', { filter: 'all', pages: 1 }],
		['/admin/organizations?pages=999', { filter: 'all', pages: 20 }],
		['/admin/organizations?filter=SUSPENDED', { filter: 'suspended', pages: 1 }]
	])('reads %s as a valid query', async (path, expected) => {
		const result = await loaded(path);
		expect(result.query).toMatchObject(expected);
	});

	it('streams the page of Organizations with every list fact in one database call', async () => {
		const result = await loaded();
		expect(result.query).toEqual({ pages: 1, q: '', filter: 'all' });
		await expect(result.directory).resolves.toEqual({
			status: 'ready',
			page: {
				counts: { all: 38, activeWeek: 31, quiet: 4, suspended: 1 },
				organizations: [
					{
						id: orgId,
						name: 'Able Clinic',
						createdAt: '2026-06-01T00:00:00.000Z',
						status: 'active',
						lastActiveAt: '2026-10-20T00:00:00.000Z',
						memberCount: 4,
						personnelCount: 31,
						ownerCount: 1,
						ownerEmail: 'owner@example.test'
					}
				],
				totalCount: 1
			}
		});
		expect(rpc).toHaveBeenCalledTimes(1);
	});

	it('returns an empty page with its total when nothing matches', async () => {
		rpc.mockResolvedValue({ data: [directoryRow({ total_count: 0, organization_id: null })], error: null });
		const result = await loaded('/admin/organizations?q=zzz');
		await expect(result.directory).resolves.toMatchObject({
			status: 'ready',
			page: { organizations: [], totalCount: 0 }
		});
	});

	it('reports a failed read as a state the page can retry, without leaking the cause', async () => {
		rpc.mockResolvedValue({ data: null, error: { message: 'private provider detail' } });
		const result = await loaded();
		await expect(result.directory).resolves.toEqual({ status: 'failed' });
	});

	it('denies a non-operator before any directory read', async () => {
		operator = false;
		await expect(load(event())).rejects.toMatchObject({ status: 403 });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('sends an operator at aal1 to MFA enrollment before any directory read', async () => {
		assurance = { currentLevel: 'aal1', nextLevel: 'aal1' };
		await expect(load(event())).rejects.toMatchObject({
			status: 303,
			location: '/auth/mfa-setup?next=%2Fadmin%2Forganizations'
		});
		expect(rpc).not.toHaveBeenCalled();
	});

	it('refuses a missing verified actor before any directory read', async () => {
		await expect(load(event('/admin/organizations', false))).rejects.toMatchObject({ status: 403 });
		expect(rpc).not.toHaveBeenCalled();
	});
});
