import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));
const actorId = '10000000-0000-4000-8000-000000000001';
let operator: boolean;
let assurance: { currentLevel: 'aal1' | 'aal2'; nextLevel: 'aal1' | 'aal2' };
let activityRows: Array<Record<string, unknown>> | null;
let reads: URL[];
let activityBodies: Array<Record<string, unknown>>;

function event(search = '', authenticated = true): Parameters<typeof GET>[0] {
	const url = new URL(`/admin/api/activity${search}`, 'http://localhost:9');
	return {
		locals: {
			actor: authenticated ? { userId: actorId } : null,
			user: { id: actorId },
			supabase: { auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: assurance, error: null }) } } },
			session: null
		},
		url,
		request: new Request(url),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof GET>[0];
}

const row = {
	id: 'event-1',
	timestamp: '2026-10-22T12:00:00+00:00',
	user_id: actorId,
	org_id: null,
	org_name: null,
	action: 'suspend_user',
	resource_type: 'user',
	resource_id: null,
	ip_address: null,
	details: { actorEmail: 'robert@example.test' },
	severity: 'critical',
	total_count: 51,
	page_offset: 50
};

beforeEach(() => {
	operator = true;
	assurance = { currentLevel: 'aal2', nextLevel: 'aal2' };
	activityRows = [row];
	reads = [];
	activityBodies = [];
	vi.spyOn(console, 'error').mockImplementation(() => {});
	getAdminClient.mockReturnValue(
		createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					reads.push(url);
					const table = url.pathname.split('/').at(-1)!;
					if (table === 'platform_operators') return Response.json(operator ? { user_id: actorId } : null);
					if (table === 'list_platform_activity') {
						activityBodies.push(JSON.parse(String(init?.body)));
						return activityRows
							? Response.json(activityRows)
							: Response.json({ message: 'private provider detail' }, { status: 500 });
					}
					throw new Error(`Unexpected provider ${table}`);
				}
			}
		})
	);
});

describe('admitted operator Activity read', () => {
	it('returns one page of events for the chosen filters in the viewer time zone', async () => {
		const response = await GET(
			event('?category=accounts&q=%20pat%20&from=2026-10-20&to=2026-10-22&page=2&tz=America/Anchorage')
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			events: [
				{
					id: 'event-1',
					timestamp: '2026-10-22T12:00:00+00:00',
					action: 'suspend_user',
					severity: 'critical',
					userId: actorId,
					orgId: null,
					orgName: null,
					resourceType: 'user',
					resourceId: null,
					ipAddress: null,
					details: { actorEmail: 'robert@example.test' }
				}
			],
			page: 2,
			pageSize: 50,
			totalCount: 51
		});
		expect(activityBodies).toHaveLength(1);
		expect(activityBodies[0]).toMatchObject({
			p_search: 'pat',
			p_from: '2026-10-20T08:00:00.000Z',
			p_to: '2026-10-23T08:00:00.000Z',
			p_limit: 50,
			p_offset: 50
		});
		expect(activityBodies[0].p_actions).toEqual(
			expect.arrayContaining(['suspend_user', 'unsuspend_user', 'admin.user.password_reset'])
		);
		expect(activityBodies[0].p_actions).not.toContain('suspend_org');
	});

	it('treats an unknown time zone and an invalid filter as the defaults', async () => {
		await GET(event('?category=bogus&from=nonsense&tz=Not/AZone'));

		expect(activityBodies[0]).toMatchObject({ p_search: null, p_from: null, p_to: null, p_offset: 0 });
		expect(activityBodies[0].p_actions).toEqual(expect.arrayContaining(['suspend_user', 'suspend_org']));
	});

	it('denies a non-operator before reading Activity', async () => {
		operator = false;
		await expect(GET(event())).rejects.toMatchObject({ status: 403 });
		expect(activityBodies).toEqual([]);
	});

	it('sends an operator without a verified second factor to MFA before reading Activity', async () => {
		assurance = { currentLevel: 'aal1', nextLevel: 'aal2' };
		await expect(GET(event())).rejects.toMatchObject({
			status: 403,
			body: { requiresStepUp: true, stepUpPath: '/auth/mfa-verify' }
		});
		expect(activityBodies).toEqual([]);
	});

	it('refuses a missing verified actor before any provider read', async () => {
		await expect(GET(event('', false))).rejects.toMatchObject({ status: 403 });
		expect(reads).toEqual([]);
	});

	it('fails the request instead of publishing an empty list when the read fails', async () => {
		activityRows = null;
		await expect(GET(event())).rejects.toMatchObject({ status: 500, body: { message: 'Unable to load Activity' } });
	});
});
