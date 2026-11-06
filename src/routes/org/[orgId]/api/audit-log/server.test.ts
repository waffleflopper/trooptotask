import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { OrganizationAuditRow, OrganizationAuditStore } from '$lib/audit/index.server';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

const CURSOR_ID = '33333333-3333-4333-8333-333333333333';
const NONE = async () => new Map<string, string>();

const ROW = {
	id: '10000000-0000-4000-8000-000000000000',
	user_id: 'u-1',
	action: 'personnel.updated',
	timestamp: '2026-10-02T12:00:00Z'
};

function contextFor(role: 'owner' | 'admin' | 'member') {
	const requested: Parameters<OrganizationAuditStore['listLogs']>[0][] = [];
	const auditStore: OrganizationAuditStore = {
		listLogs: async (request) => {
			requested.push(request);
			return { logs: [ROW as OrganizationAuditRow], hasMore: false };
		},
		listActions: async () => []
	};
	const ctx = createTestContext({
		auth: {
			orgId: 'org-1',
			role,
			isPrivileged: role !== 'member',
			capabilityMap: {
				calendar: 'none',
				personnel: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet: { kind: 'organization' }
		}
	});
	return {
		ctx,
		requested,
		route: {
			auth: ctx.auth,
			auditStore,
			auditLabels: { personnelNames: NONE, trainingTypeNames: NONE, statusTypeNames: NONE, actorEmails: NONE }
		}
	};
}

const read = (role: 'owner' | 'admin' | 'member', input: unknown) => {
	const { ctx, route, requested } = contextFor(role);
	return { requested, page: handleUseCaseRequest(_getConfig, ctx, input, () => route as never) };
};

describe('GET /api/audit-log', () => {
	it('is readable only through the Audit log policy action', () => {
		expect(_getConfig.policyAction).toBe(POLICY_ACTION_CATALOG.organization.accessAuditLogs);
		expect(_getConfig.policyResource).toEqual({ kind: 'organization' });
	});

	it('reads the filters, the cursor and the viewer time zone from the request', async () => {
		const parsed = await _getConfig.parseInput!({
			url: new URL(
				`https://app.test/org/test-org/api/audit-log?member=22222222-2222-4222-8222-222222222222&from=2026-10-01&after=2026-10-01T12:00:00.000000%2B00:00_${CURSOR_ID}`
			),
			cookies: { get: (name: string) => (name === 't2t_tz' ? 'America/New_York' : undefined) }
		} as never);

		expect(parsed).toEqual({
			after: `2026-10-01T12:00:00.000000+00:00_${CURSOR_ID}`,
			filters: { userId: '22222222-2222-4222-8222-222222222222', from: '2026-10-01' },
			timeZone: 'America/New_York'
		});
	});

	it.each(['owner', 'admin'] as const)(
		'gives an %s the page after the cursor, read under the filters',
		async (role) => {
			const cursor = `2026-10-03T12:00:00.000000+00:00_${CURSOR_ID}`;
			const { page, requested } = read(role, {
				after: cursor,
				filters: { kind: 'availability.deleted', from: '2026-10-01', to: '2026-10-01' },
				timeZone: 'America/New_York'
			});

			await expect(page).resolves.toMatchObject({ logs: [{ createdAt: '2026-10-02T12:00:00Z' }], nextCursor: null });
			expect(requested).toEqual([
				expect.objectContaining({
					orgId: 'org-1',
					after: { timestamp: '2026-10-03T12:00:00.000000+00:00', id: CURSOR_ID },
					filters: expect.objectContaining({
						action: 'availability.deleted',
						since: '2026-10-01T04:00:00.000Z',
						until: '2026-10-02T04:00:00.000Z'
					})
				})
			]);
		}
	);

	it('refuses a member without admin', async () => {
		const { page, requested } = read('member', {
			after: `2026-10-03T12:00:00.000000+00:00_${CURSOR_ID}`,
			filters: {},
			timeZone: 'UTC'
		});

		await expect(page).rejects.toMatchObject({ status: 403 });
		expect(requested).toEqual([]);
	});

	it('refuses a cursor that no page returned before reading anything', async () => {
		const { page, requested } = read('admin', { after: 'not-a-cursor', filters: {}, timeZone: 'UTC' });

		await expect(page).rejects.toMatchObject({ status: 400 });
		expect(requested).toEqual([]);
	});
});
