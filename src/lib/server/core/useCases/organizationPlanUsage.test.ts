import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { readOrganizationPlanUsage } from './organizationPlanUsage';

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
});
