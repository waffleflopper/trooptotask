import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminClientMock } = vi.hoisted(() => ({
	getAdminClientMock: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({
	env: {}
}));

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: getAdminClientMock
}));

import { POST } from './+server';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG_ID = '33333333-3333-4333-8333-333333333333';

function makeRequest(body: Record<string, unknown> = {}) {
	return new Request('https://trooptotask.test/api/feedback', {
		method: 'POST',
		body: JSON.stringify({
			category: 'general',
			message: 'This workflow needs a little polish.',
			...body
		})
	});
}

function makeEvent({
	body,
	user = { id: USER_ID, email: 'member@example.com' }
}: {
	body?: Record<string, unknown>;
	user?: { id: string; email?: string } | null;
} = {}) {
	return {
		request: makeRequest(body),
		locals: {
			user
		}
	} as unknown as Parameters<typeof POST>[0];
}

function createQueryBuilder(result: { data: unknown; error: unknown }) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue(result)
	};
}

function createAdminClient(membershipResult: { data: unknown; error: unknown } = { data: null, error: null }) {
	const membershipQuery = createQueryBuilder(membershipResult);
	const insert = vi.fn().mockResolvedValue({ error: null });
	const from = vi.fn((table: string) => {
		if (table === 'organization_memberships') return membershipQuery;
		if (table === 'beta_feedback') return { insert };
		throw new Error(`Unexpected table ${table}`);
	});

	return {
		client: { from },
		from,
		membershipQuery,
		insert
	};
}

describe('POST /api/feedback', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('rejects unauthenticated requests', async () => {
		const adminClient = createAdminClient();
		getAdminClientMock.mockReturnValue(adminClient.client);

		await expect(POST(makeEvent({ user: null }))).rejects.toMatchObject({
			status: 401,
			body: {
				message: 'Authentication required'
			}
		});
		expect(getAdminClientMock).not.toHaveBeenCalled();
	});

	it('inserts null organization fields when no organization id is supplied', async () => {
		const adminClient = createAdminClient();
		getAdminClientMock.mockReturnValue(adminClient.client);

		const response = await POST(
			makeEvent({
				body: {
					pageUrl: '/feedback',
					organizationName: 'Spoofed Organization'
				}
			})
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true, githubIssue: null });
		expect(adminClient.from).not.toHaveBeenCalledWith('organization_memberships');
		expect(adminClient.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				user_id: USER_ID,
				organization_id: null,
				organization_name: null,
				page_url: '/feedback'
			})
		);
	});

	it('derives organization name from membership and ignores spoofed organization names', async () => {
		const adminClient = createAdminClient({
			data: {
				organizations: {
					id: ORG_ID,
					name: 'Alpha Company'
				}
			},
			error: null
		});
		getAdminClientMock.mockReturnValue(adminClient.client);

		const response = await POST(
			makeEvent({
				body: {
					organizationId: ORG_ID,
					organizationName: 'Spoofed Organization',
					pageUrl: `https://malicious.example/org/${ORG_ID}/training?tab=matrix`
				}
			})
		);

		expect(response.status).toBe(200);
		expect(adminClient.membershipQuery.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
		expect(adminClient.membershipQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
		expect(adminClient.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				organization_id: ORG_ID,
				organization_name: 'Alpha Company',
				page_url: `/org/${ORG_ID}/training?tab=matrix`,
				page_section: 'Training'
			})
		);
		expect(JSON.stringify(adminClient.insert.mock.calls[0][0])).not.toContain('Spoofed Organization');
	});

	it('preserves page context when feedback comes from the organization URL slug', async () => {
		const adminClient = createAdminClient({
			data: {
				organizations: {
					id: ORG_ID,
					name: 'Alpha Company',
					url_slug: 'alpha-company'
				}
			},
			error: null
		});
		getAdminClientMock.mockReturnValue(adminClient.client);

		const response = await POST(
			makeEvent({
				body: {
					organizationId: ORG_ID,
					pageUrl: '/org/alpha-company/training?tab=matrix'
				}
			})
		);

		expect(response.status).toBe(200);
		expect(adminClient.membershipQuery.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
		expect(adminClient.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				organization_id: ORG_ID,
				organization_name: 'Alpha Company',
				page_url: '/org/alpha-company/training?tab=matrix',
				page_section: 'Training'
			})
		);
	});

	it('rejects organization ids the user does not belong to without inserting', async () => {
		const adminClient = createAdminClient({ data: null, error: null });
		getAdminClientMock.mockReturnValue(adminClient.client);

		await expect(
			POST(
				makeEvent({
					body: {
						organizationId: OTHER_ORG_ID,
						pageUrl: `/org/${OTHER_ORG_ID}/calendar`
					}
				})
			)
		).rejects.toMatchObject({
			status: 403,
			body: {
				message: 'Organization access denied'
			}
		});
		expect(adminClient.insert).not.toHaveBeenCalled();
	});

	it('rejects invalid organization UUIDs without inserting', async () => {
		const adminClient = createAdminClient();
		getAdminClientMock.mockReturnValue(adminClient.client);

		await expect(
			POST(
				makeEvent({
					body: {
						organizationId: 'not-a-uuid'
					}
				})
			)
		).rejects.toMatchObject({
			status: 400,
			body: {
				message: 'Invalid organization ID'
			}
		});
		expect(adminClient.from).not.toHaveBeenCalledWith('organization_memberships');
		expect(adminClient.insert).not.toHaveBeenCalled();
	});
});
