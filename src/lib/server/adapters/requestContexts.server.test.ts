import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { listNotificationExportRows } from '$features/notifications/index.server';
import type { OrganizationMembershipFacts } from '$lib/access/memberAccessProjection';
import {
	buildRouteRequest,
	buildLayoutRequest,
	createRequestSensitiveActionContext,
	createRequestOrganizationExportContext
} from './requestContexts.server';

const { getAdminClient } = vi.hoisted(() => ({
	getAdminClient: vi.fn(() => {
		throw new Error('Privileged client forbidden in request communications export');
	})
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

function createMembershipSupabase(membership: OrganizationMembershipFacts) {
	const query = {
		eq: vi.fn(),
		single: vi.fn().mockResolvedValue({ data: membership })
	};
	query.eq.mockReturnValue(query);
	return { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }) };
}

function buildRequest(kind: 'route' | 'layout', locals: App.Locals) {
	return kind === 'layout'
		? buildLayoutRequest(locals, ORG_ID)
		: buildRouteRequest({
				locals,
				cookies: {},
				params: { orgId: ORG_ID },
				request: new Request('http://localhost'),
				getClientAddress: () => '127.0.0.1'
			} as never);
}

describe('request-bound sensitive-action authorization', () => {
	it.each(['route', 'layout'] as const)(
		'binds the %s authorizer to the admitted request actor and token',
		async (kind) => {
			const supabase = createMembershipSupabase({ role: 'owner' });
			const assurance = vi.fn().mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
			Object.assign(supabase, {
				auth: { mfa: { getAuthenticatorAssuranceLevel: assurance } },
				rpc: vi.fn().mockResolvedValue({ data: false, error: null })
			});
			const locals = {
				supabase,
				actor: { userId: USER_ID },
				user: { id: USER_ID },
				session: {
					access_token: 'verified-token',
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					user: { id: USER_ID }
				}
			} as unknown as App.Locals;
			const ctx = createRequestSensitiveActionContext(await buildRequest(kind, locals));
			await expect(
				ctx.sensitiveActionAuthorizer.authorize({
					action: 'organization.deleteOrganization',
					actorUserId: OTHER_USER_ID
				})
			).resolves.toMatchObject({ allowed: false, reason: 'denied.unauthenticated' });
			expect(assurance).not.toHaveBeenCalled();
			await expect(
				ctx.sensitiveActionAuthorizer.authorize({ action: 'organization.deleteOrganization', actorUserId: USER_ID })
			).resolves.toMatchObject({ allowed: true, reason: 'allowed.mfaAssurance' });
			expect(assurance).toHaveBeenCalledWith('verified-token');
		}
	);
});

describe('request-bound communications exports', () => {
	it.each(['route', 'layout'] as const)(
		'uses the ordinary request client and admitted user/Organization in the %s request',
		async (kind) => {
			getAdminClient.mockClear();
			const own = { id: 'own', user_id: USER_ID, organization_id: ORG_ID };
			const rows = [
				own,
				{ ...own, id: 'peer', user_id: OTHER_USER_ID },
				{ ...own, id: 'foreign', organization_id: OTHER_ORG_ID }
			];
			const supabase = createClient('http://127.0.0.1:9', 'synthetic-request-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: {
					fetch: async (input) => {
						const url = new URL(String(input));
						const table = url.pathname.split('/').at(-1)!;
						if (table === 'organization_memberships') {
							if (
								url.searchParams.get('user_id') !== `eq.${USER_ID}` ||
								url.searchParams.get('organization_id') !== `eq.${ORG_ID}`
							)
								return Response.json({ code: 'PGRST116' }, { status: 406 });
							return Response.json({ role: 'owner' });
						}
						if (!['notifications', 'beta_feedback'].includes(table)) {
							throw new Error('Unexpected request client read');
						}
						return Response.json(
							rows.filter(
								(row) =>
									row.user_id === USER_ID &&
									(!url.searchParams.has('organization_id') ||
										url.searchParams.get('organization_id') === `eq.${row.organization_id}`) &&
									(!url.searchParams.has('user_id') || url.searchParams.get('user_id') === `eq.${row.user_id}`)
							)
						);
					}
				}
			});
			const locals = { actor: { userId: USER_ID }, supabase, session: null } as unknown as App.Locals;
			const ctx = createRequestOrganizationExportContext(await buildRequest(kind, locals));

			await expect(listNotificationExportRows(ctx.notificationSelf)).resolves.toEqual([own]);
			await expect(ctx.feedbackExport.listRows(ctx.auth.orgId)).resolves.toEqual([own]);
			expect(getAdminClient).not.toHaveBeenCalled();
		}
	);
});
