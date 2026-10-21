import { describe, expect, it } from 'vitest';
import { buildMembersSettingsSection } from './membersSettings.server';
import { createTestContext } from '$lib/server/adapters/inMemory';

describe('Organization settings ordering in test contexts', () => {
	it.each(['listMemberAccess', 'listOwnershipCandidateMemberships'] satisfies Array<
		'listMemberAccess' | 'listOwnershipCandidateMemberships'
	>)('%s returns memberships in ascending ID order within the requested Organization', async (method) => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organization_memberships', [
			{ id: 'c', organization_id: ctx.auth.orgId },
			{ id: 'a', organization_id: ctx.auth.orgId },
			{ id: 'b', organization_id: ctx.auth.orgId },
			{ id: '0-foreign', organization_id: 'foreign-org' }
		]);
		expect((await ctx.organizationSettings[method](ctx.auth.orgId.toUpperCase())).map(({ id }) => id)).toEqual([
			'a',
			'b',
			'c'
		]);
	});
	it.each([
		{
			table: 'organization_invitations',
			read: (ctx: ReturnType<typeof createTestContext>, orgId: string) =>
				ctx.organizationSettings.listInvitations(orgId, 'pending')
		},
		{
			table: 'organization_invitation_email_outbox',
			read: (ctx: ReturnType<typeof createTestContext>, orgId: string) =>
				ctx.organizationSettings.listInvitationDeliveries(orgId)
		}
	])('$table reads newest rows first and orders timestamp ties by ID', async ({ table, read }) => {
		const ctx = createTestContext();
		ctx.rawStore.seed(table, [
			{ id: 'a-old', organization_id: ctx.auth.orgId, status: 'pending', created_at: '2026-10-01' },
			{ id: 'c-new', organization_id: ctx.auth.orgId, status: 'pending', created_at: '2026-10-02' },
			{ id: 'b-new', organization_id: ctx.auth.orgId, status: 'pending', created_at: '2026-10-02' },
			{ id: '0-foreign', organization_id: 'foreign-org', status: 'pending', created_at: '2026-10-03' }
		]);
		expect((await read(ctx, ctx.auth.orgId.toUpperCase())).map(({ id }) => id)).toEqual(['b-new', 'c-new', 'a-old']);
	});
	it('listInvitations reads pending and closed invitations apart', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organization_invitations', [
			{ id: 'pending', organization_id: ctx.auth.orgId, status: 'pending', created_at: '2026-10-01' },
			{ id: 'accepted', organization_id: ctx.auth.orgId, status: 'accepted', created_at: '2026-10-02' },
			{ id: 'revoked', organization_id: ctx.auth.orgId, status: 'revoked', created_at: '2026-10-03' }
		]);
		const ids = async (status: 'pending' | 'closed') =>
			(await ctx.organizationSettings.listInvitations(ctx.auth.orgId, status)).map(({ id }) => id);
		expect(await ids('pending')).toEqual(['pending']);
		expect(await ids('closed')).toEqual(['revoked', 'accepted']);
	});
	it('Members uses the same delivery status when newer attempts share a timestamp', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organization_invitations', [
			{
				id: 'invite',
				organization_id: ctx.auth.orgId,
				email: 'invite@example.test',
				role: 'member',
				status: 'pending',
				member_preset: 'viewer',
				capability_overrides: {},
				access_scope_kind: 'organization',
				access_scope_group_ids: [],
				created_at: '2026-10-01',
				expires_at: '2026-10-15'
			}
		]);
		ctx.rawStore.seed('organization_invitation_email_outbox', [
			{
				id: 'c-new',
				organization_id: ctx.auth.orgId,
				invitation_id: 'invite',
				created_at: '2026-10-02',
				status: 'failed'
			},
			{
				id: 'a-old',
				organization_id: ctx.auth.orgId,
				invitation_id: 'invite',
				created_at: '2026-10-01',
				status: 'pending'
			},
			{
				id: 'b-new',
				organization_id: ctx.auth.orgId,
				invitation_id: 'invite',
				created_at: '2026-10-02',
				status: 'sent'
			}
		]);
		const section = buildMembersSettingsSection({
			currentMemberRole: 'owner',
			canManageMembers: true,
			isAdmin: true,
			members: [],
			invitations: await ctx.organizationSettings.listInvitations(ctx.auth.orgId, 'pending'),
			closedInvitations: Promise.resolve([]),
			invitationDeliveries: await ctx.organizationSettings.listInvitationDeliveries(ctx.auth.orgId),
			groups: [],
			disabledFeatures: [],
			now: new Date('2026-10-07T00:00:00Z')
		});
		expect(section.invitations.map(({ id, deliveryStatus }) => ({ id, deliveryStatus }))).toEqual([
			{ id: 'invite', deliveryStatus: 'sent' }
		]);
	});
});
