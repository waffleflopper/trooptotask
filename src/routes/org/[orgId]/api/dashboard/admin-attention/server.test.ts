import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { buildRouteRequest } from '$lib/server/adapters/requestContexts.server';
import { GET } from './+server';

const { listUnexpiredPendingInvitations, readPendingApprovals } = vi.hoisted(() => ({
	listUnexpiredPendingInvitations: vi.fn(),
	readPendingApprovals: vi.fn()
}));
vi.mock('$lib/server/adapters/requestContexts.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/adapters/requestContexts.server')>()),
	buildRouteRequest: vi.fn(),
	createRequestAdminAttentionContext: (request: ReturnType<typeof createTestContext>) => ({
		auth: request.auth,
		audit: request.audit,
		organizationSettings: { listUnexpiredPendingInvitations },
		readPendingApprovals
	})
}));

const ORG_ID = 'test-org';
const failedInvite = {
	id: 'invite-1',
	email: 'a@example.invalid',
	expiresAt: '2999-01-01T00:00:00.000Z',
	latestDeliveryStatus: 'failed'
};
const archive = { kind: 'archive', count: 2, oldestCreatedAt: '2026-10-01T00:00:00Z' };

function admit(role: 'owner' | 'admin' | 'member') {
	const ctx = createTestContext({ auth: { orgId: ORG_ID, role, isPrivileged: role !== 'member' } });
	vi.mocked(buildRouteRequest).mockResolvedValue({ ...ctx, supabase: {}, session: null } as never);
}

function attentionEvent() {
	return {
		cookies: { get: () => undefined },
		params: { orgId: ORG_ID },
		locals: {},
		request: new Request(`http://localhost/org/${ORG_ID}/api/dashboard/admin-attention`)
	} as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
	listUnexpiredPendingInvitations.mockReset().mockResolvedValue([failedInvite]);
	readPendingApprovals.mockReset().mockResolvedValue([archive]);
});

describe('GET /org/[orgId]/api/dashboard/admin-attention', () => {
	it.each(['owner', 'admin'] as const)('returns what waits on the %s, uncached', async (role) => {
		admit(role);
		const response = await GET(attentionEvent());

		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		await expect(response.json()).resolves.toEqual({
			approvals: [archive],
			invitations: [
				{ id: 'invite-1', email: 'a@example.invalid', expiresAt: '2999-01-01T00:00:00.000Z', reason: 'deliveryFailed' }
			]
		});
	});

	it('answers null to a member without calling either reader', async () => {
		admit('member');

		await expect((await GET(attentionEvent())).json()).resolves.toBeNull();
		expect(listUnexpiredPendingInvitations).not.toHaveBeenCalled();
		expect(readPendingApprovals).not.toHaveBeenCalled();
	});

	it('fails when a reader fails, so the Dashboard can offer Retry', async () => {
		admit('admin');
		readPendingApprovals.mockRejectedValue(new Error('Approvals unavailable'));

		await expect(GET(attentionEvent())).rejects.toBeDefined();
	});
});
