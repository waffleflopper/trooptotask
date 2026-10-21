import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { loadMembersSettings, loadOwnershipTransferCandidates } from '$features/organization/index.server';
import { fetchCriticalTasksSettings } from '$features/critical-tasks/index.server';
import {
	createSettingsMembersContext,
	createSettingsDangerContext
} from '../../../routes/org/[orgId]/settings/settingsRequestContexts.server';
import { createRequestCriticalTasksReadContext } from './featureRequestContexts.server';
import { createTestContext } from './inMemory';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

function request(role: 'owner' | 'admin' = 'owner') {
	const ctx = createTestContext({ auth: { role } });
	const calls: URL[] = [];
	const supabase = createClient('http://settings.invalid', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input) => {
				const url = new URL(String(input));
				calls.push(url);
				if (url.pathname === '/rest/v1/organizations') {
					expect(url.searchParams.get('id')).toBe(`eq.${ctx.auth.orgId}`);
					return Response.json({
						critical_tasks_default_expiration_months: 18,
						critical_tasks_expiring_soon_warning_days: 45
					});
				}
				expect(url.searchParams.get('organization_id')).toBe(`eq.${ctx.auth.orgId}`);
				if (url.pathname === '/rest/v1/organization_memberships')
					return Response.json([
						{
							id: 'owner-id',
							organization_id: ctx.auth.orgId,
							user_id: 'owner-user',
							email: 'owner@example.test',
							role: 'owner',
							member_preset: 'viewer',
							capability_overrides: {},
							access_scope_kind: 'organization',
							access_scope_group_ids: [],
							created_at: '2026-10-01'
						},
						{
							id: 'admin-id',
							organization_id: ctx.auth.orgId,
							user_id: 'admin-user',
							email: '  admin@example.test  ',
							role: 'admin',
							member_preset: 'viewer',
							capability_overrides: {},
							access_scope_kind: 'organization',
							access_scope_group_ids: [],
							created_at: '2026-10-02'
						},
						{
							id: 'blank-email',
							organization_id: ctx.auth.orgId,
							user_id: 'blank-user',
							email: '  ',
							role: 'member',
							member_preset: 'viewer',
							capability_overrides: {},
							access_scope_kind: 'organization',
							access_scope_group_ids: [],
							created_at: '2026-10-03'
						},
						{
							id: 'no-account',
							organization_id: ctx.auth.orgId,
							user_id: null,
							email: 'pending@example.test',
							role: 'member',
							member_preset: 'viewer',
							capability_overrides: {},
							access_scope_kind: 'organization',
							access_scope_group_ids: [],
							created_at: '2026-10-04'
						}
					]);
				if (
					url.pathname === '/rest/v1/organization_invitations' ||
					url.pathname === '/rest/v1/organization_invitation_email_outbox'
				)
					return Response.json([]);
				throw new Error('Unexpected ordinary settings read');
			}
		}
	});
	ctx.store.findOne = async () => {
		throw new Error('Generic settings reads are unavailable');
	};
	ctx.store.findMany = async () => {
		throw new Error('Generic settings reads are unavailable');
	};
	return { request: { ...ctx, supabase, session: null }, calls };
}

describe('residual settings through actual admitted request factories', () => {
	it('constructs lazily and reads Members and owner candidates using the captured ordinary client', async () => {
		getAdminClient.mockClear();
		const fixture = request();
		const members = createSettingsMembersContext(fixture.request);
		const danger = createSettingsDangerContext(fixture.request);
		expect(fixture.calls).toEqual([]);
		expect(getAdminClient).not.toHaveBeenCalled();
		const data = await loadMembersSettings(members, {
			isAdmin: true,
			groups: Promise.resolve([]),
			closedInvitations: Promise.resolve([])
		});
		expect(data.sections.members.rows.map((row) => [row.id, row.userId, row.membershipRole])).toEqual([
			['owner-id', 'owner-user', 'owner'],
			['admin-id', 'admin-user', 'admin'],
			['blank-email', 'blank-user', 'member'],
			['no-account', '', 'member']
		]);
		expect(data.sections.members.invitations).toEqual([]);
		expect(await loadOwnershipTransferCandidates(danger)).toEqual([
			{ id: 'admin-id', userId: 'admin-user', email: '  admin@example.test  ', membershipRole: 'admin' }
		]);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
	it('returns no candidates for a non-owner without any ordinary or privileged read', async () => {
		getAdminClient.mockClear();
		const fixture = request('admin');
		expect(await loadOwnershipTransferCandidates(createSettingsDangerContext(fixture.request))).toEqual([]);
		expect(fixture.calls).toEqual([]);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
	it('uses the same ordinary client for the Critical Tasks pair without the generic store', async () => {
		const fixture = request();
		const ctx = createRequestCriticalTasksReadContext(fixture.request);
		expect(fixture.calls).toEqual([]);
		expect(await fetchCriticalTasksSettings(ctx)).toEqual({ defaultExpirationMonths: 18, expiringSoonWarningDays: 45 });
		expect(fixture.calls).toHaveLength(1);
	});
});
