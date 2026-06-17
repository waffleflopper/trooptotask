import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { readOrganizationPlanUsage } from './organizationPlanUsage';
import type { DataStore } from '../ports';

const NOW = new Date('2026-05-24T12:00:00.000Z');

function buildContext() {
	return createTestContext({ auth: { orgId: 'org-1' } });
}

describe('organization plan usage read model', () => {
	it('counts active personnel and excludes archived personnel', async () => {
		const ctx = buildContext();
		ctx.rawStore.seed('personnel', [
			{ id: 'p-1', organization_id: 'org-1', archived_at: null },
			{ id: 'p-2', organization_id: 'org-1', archived_at: null },
			{ id: 'p-archived', organization_id: 'org-1', archived_at: '2026-05-01T00:00:00.000Z' },
			{ id: 'p-other-org', organization_id: 'org-2', archived_at: null }
		]);

		const usage = await readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore }, { now: NOW });

		expect(usage.organizationId).toBe('org-1');
		expect(usage.asOf).toBe(NOW.toISOString());
		expect(usage.activePersonnelCount).toBe(2);
		expect(usage.sources.activePersonnel).toMatchObject({
			table: 'personnel',
			excluded: ['archived_at IS NOT NULL']
		});
	});

	it('counts active organization members toward member usage', async () => {
		const ctx = buildContext();
		ctx.rawStore.seed('organization_memberships', [
			{ id: 'm-owner', organization_id: 'org-1', user_id: 'owner-1', role: 'owner' },
			{ id: 'm-admin', organization_id: 'org-1', user_id: 'admin-1', role: 'admin' },
			{ id: 'm-other-org', organization_id: 'org-2', user_id: 'other-1', role: 'member' }
		]);

		const usage = await readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore }, { now: NOW });

		expect(usage.activeOrganizationMemberCount).toBe(2);
		expect(usage.sources.activeOrganizationMembers.table).toBe('organization_memberships');
	});

	it('counts only pending unexpired invitations and deduplicates pending invitation history by email', async () => {
		const ctx = buildContext();
		ctx.rawStore.seed('organization_invitations', [
			{
				id: 'invite-current-a',
				organization_id: 'org-1',
				email: 'New.Member@example.com',
				normalized_email: 'new.member@example.com',
				status: 'pending',
				expires_at: '2026-06-01T00:00:00.000Z',
				created_at: '2026-05-20T00:00:00.000Z'
			},
			{
				id: 'invite-duplicate-a',
				organization_id: 'org-1',
				email: ' new.member@example.com ',
				normalized_email: 'new.member@example.com',
				status: 'pending',
				expires_at: '2026-06-02T00:00:00.000Z',
				created_at: '2026-05-21T00:00:00.000Z'
			},
			{
				id: 'invite-current-b',
				organization_id: 'org-1',
				email: 'second@example.com',
				normalized_email: 'second@example.com',
				status: 'pending',
				expires_at: '2026-06-03T00:00:00.000Z',
				created_at: '2026-05-22T00:00:00.000Z'
			},
			{
				id: 'invite-no-expiry',
				organization_id: 'org-1',
				email: 'noexpiry@example.com',
				normalized_email: 'noexpiry@example.com',
				status: 'pending',
				expires_at: null
			},
			{
				id: 'invite-missing-email',
				organization_id: 'org-1',
				email: null,
				normalized_email: null,
				status: 'pending',
				expires_at: '2026-06-04T00:00:00.000Z'
			},
			{
				id: 'invite-expired-time',
				organization_id: 'org-1',
				email: 'expired-time@example.com',
				normalized_email: 'expired-time@example.com',
				status: 'pending',
				expires_at: '2026-05-01T00:00:00.000Z'
			},
			{
				id: 'invite-accepted',
				organization_id: 'org-1',
				email: 'accepted@example.com',
				normalized_email: 'accepted@example.com',
				status: 'accepted',
				expires_at: '2026-06-01T00:00:00.000Z'
			},
			{
				id: 'invite-declined',
				organization_id: 'org-1',
				email: 'declined@example.com',
				normalized_email: 'declined@example.com',
				status: 'declined',
				expires_at: '2026-06-01T00:00:00.000Z'
			},
			{
				id: 'invite-revoked',
				organization_id: 'org-1',
				email: 'revoked@example.com',
				normalized_email: 'revoked@example.com',
				status: 'revoked',
				expires_at: '2026-06-01T00:00:00.000Z'
			},
			{
				id: 'invite-expired-status',
				organization_id: 'org-1',
				email: 'expired-status@example.com',
				normalized_email: 'expired-status@example.com',
				status: 'expired',
				expires_at: '2026-06-01T00:00:00.000Z'
			},
			{
				id: 'invite-blocked',
				organization_id: 'org-1',
				email: 'blocked@example.com',
				normalized_email: 'blocked@example.com',
				status: 'blocked',
				expires_at: '2026-06-01T00:00:00.000Z'
			}
		]);

		const usage = await readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore }, { now: NOW });

		expect(usage.pendingUnexpiredInvitationCount).toBe(3);
		expect(usage.sources.pendingUnexpiredInvitations).toMatchObject({
			table: 'organization_invitations',
			included: ['status = pending', 'expires_at IS NULL OR expires_at > 2026-05-24T12:00:00.000Z'],
			excluded: expect.arrayContaining(['expired', 'declined', 'revoked', 'blocked', 'accepted', 'duplicate_email'])
		});
	});

	it('counts export usage only inside the current calendar month', async () => {
		const ctx = buildContext();
		ctx.rawStore.seed('data_exports', [
			{ id: 'export-current-a', org_id: 'org-1', created_at: '2026-05-01T00:00:00.000Z', status: 'completed' },
			{ id: 'export-current-b', org_id: 'org-1', created_at: '2026-05-24T11:00:00.000Z', status: 'failed' },
			{ id: 'export-current-c', org_id: 'org-1', created_at: '2026-05-24T11:30:00.000Z', status: 'processing' },
			{ id: 'export-prior-month', org_id: 'org-1', created_at: '2026-04-30T23:59:59.999Z', status: 'completed' },
			{ id: 'export-other-org', org_id: 'org-2', created_at: '2026-05-24T11:00:00.000Z', status: 'completed' }
		]);

		const usage = await readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore }, { now: NOW });

		expect(usage.monthlyExportCount).toBe(3);
		expect(usage.sources.monthlyExports.period).toEqual({
			start: '2026-05-01T00:00:00.000Z',
			endExclusive: '2026-06-01T00:00:00.000Z'
		});
		expect(usage.sources.monthlyExports.included).toContain('status = any export attempt');
	});

	it('uses count queries for simple totals and skinny pending invitation reads', async () => {
		const ctx = buildContext();
		ctx.rawStore.seed('personnel', [
			{ id: 'p-active', organization_id: 'org-1', archived_at: null },
			{ id: 'p-archived', organization_id: 'org-1', archived_at: '2026-05-01T00:00:00.000Z' }
		]);
		ctx.rawStore.seed('organization_memberships', [
			{ id: 'm-owner', organization_id: 'org-1', user_id: 'owner-1', role: 'owner' }
		]);
		ctx.rawStore.seed('organization_invitations', [
			{
				id: 'invite-no-expiry',
				organization_id: 'org-1',
				email: 'NoExpiry@example.com',
				normalized_email: 'noexpiry@example.com',
				status: 'pending',
				expires_at: null
			},
			{
				id: 'invite-future',
				organization_id: 'org-1',
				email: 'future@example.com',
				normalized_email: 'future@example.com',
				status: 'pending',
				expires_at: '2026-06-01T00:00:00.000Z'
			},
			{
				id: 'invite-expired',
				organization_id: 'org-1',
				email: 'expired@example.com',
				normalized_email: 'expired@example.com',
				status: 'pending',
				expires_at: '2026-05-01T00:00:00.000Z'
			},
			{
				id: 'invite-accepted',
				organization_id: 'org-1',
				email: 'accepted@example.com',
				normalized_email: 'accepted@example.com',
				status: 'accepted',
				expires_at: '2026-06-01T00:00:00.000Z'
			}
		]);
		ctx.rawStore.seed('data_exports', [
			{ id: 'export-current', org_id: 'org-1', created_at: '2026-05-24T11:00:00.000Z', status: 'completed' },
			{ id: 'export-prior-month', org_id: 'org-1', created_at: '2026-04-30T23:59:59.999Z', status: 'completed' }
		]);
		const findManySpy = vi.spyOn(ctx.rawStore, 'findMany');
		const findManyWithCountSpy = vi.spyOn(ctx.rawStore, 'findManyWithCount');

		const usage = await readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore }, { now: NOW });

		expect(usage.activePersonnelCount).toBe(1);
		expect(usage.activeOrganizationMemberCount).toBe(1);
		expect(usage.pendingUnexpiredInvitationCount).toBe(2);
		expect(usage.monthlyExportCount).toBe(1);
		expect(findManyWithCountSpy).toHaveBeenCalledTimes(3);
		expect(findManySpy.mock.calls.some(([table]) => table !== 'organization_invitations')).toBe(false);

		const countCallsByTable = new Map(findManyWithCountSpy.mock.calls.map((call) => [call[0], call]));
		expect(countCallsByTable.get('personnel')?.[3]).toEqual({
			isNull: { archived_at: true },
			select: 'id',
			range: { from: 0, to: 0 },
			count: 'exact'
		});
		expect(countCallsByTable.get('organization_memberships')?.[3]).toEqual({
			select: 'id',
			range: { from: 0, to: 0 },
			count: 'exact'
		});
		expect(countCallsByTable.get('data_exports')?.[3]).toEqual({
			rangeFilters: [
				{ column: 'created_at', op: 'gte', value: '2026-05-01T00:00:00.000Z' },
				{ column: 'created_at', op: 'lt', value: '2026-06-01T00:00:00.000Z' }
			],
			select: 'id',
			range: { from: 0, to: 0 },
			count: 'exact'
		});

		const invitationCalls = findManySpy.mock.calls.filter(([table]) => table === 'organization_invitations');
		expect(invitationCalls).toHaveLength(2);
		for (const call of invitationCalls) {
			expect(call[2]).toEqual({ status: 'pending' });
			expect(call[3]?.select).toBe('email, normalized_email, expires_at');
			expect(call[3]?.select).not.toBe('*');
		}
		expect(invitationCalls).toEqual(
			expect.arrayContaining([
				expect.arrayContaining([
					'organization_invitations',
					'org-1',
					{ status: 'pending' },
					expect.objectContaining({ isNull: { expires_at: true } })
				]),
				expect.arrayContaining([
					'organization_invitations',
					'org-1',
					{ status: 'pending' },
					expect.objectContaining({
						rangeFilters: [{ column: 'expires_at', op: 'gt', value: '2026-05-24T12:00:00.000Z' }]
					})
				])
			])
		);
	});

	it('fails fast when a count query does not return a count', async () => {
		const store = {
			findManyWithCount: vi.fn(async () => ({ data: [{ id: 'only-returned-row' }], count: null })),
			findMany: vi.fn(async () => [])
		} as unknown as DataStore;

		await expect(readOrganizationPlanUsage({ auth: { orgId: 'org-1' }, store }, { now: NOW })).rejects.toThrow(
			/organizationPlanUsage\.countRows expected a count for table "(personnel|organization_memberships|data_exports)" and org "org-1"/
		);
	});
});
