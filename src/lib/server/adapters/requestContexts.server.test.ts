import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { listNotificationExportRows } from '$features/notifications/index.server';
import type { OrganizationMembershipFacts } from '$lib/access/memberAccessProjection';
import {
	buildRouteRequest,
	buildLayoutRequest,
	createRequestSensitiveActionContext,
	createRequestOrganizationExportContext,
	createRequestPersonnelWorkspaceContext,
	createRequestUnitCountsContext,
	type AdmittedOrganizationRequest
} from './requestContexts.server';
import { readUnitCounts } from '$features/organization/index.server';
import { createRequestTrainingRosterContext } from './featureRequestContexts.server';

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
		single: vi.fn().mockResolvedValue({ data: membership }),
		maybeSingle: vi.fn().mockResolvedValue({ data: { id: ORG_ID, suspended_at: null }, error: null })
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

describe('request-bound rank catalogs', () => {
	it('keeps deferred Personnel and Training catalog reads on their admitted Organization and client', async () => {
		getAdminClient.mockClear();
		const ranks = [
			{
				id: 'rank-a',
				organization_id: ORG_ID,
				code: 'A-ONLY',
				label: 'A rank',
				service: 'custom',
				category: 'custom',
				pay_grade: 'ungraded',
				state: 'active',
				source: 'custom',
				sort_order: 1
			},
			{
				id: 'rank-b',
				organization_id: OTHER_ORG_ID,
				code: 'B-ONLY',
				label: 'B rank',
				service: 'custom',
				category: 'custom',
				pay_grade: 'ungraded',
				state: 'active',
				source: 'custom',
				sort_order: 1
			}
		];
		const supabase = createClient('http://catalog.invalid', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					if (request.headers.get('authorization') !== 'Bearer synthetic-request-key')
						return Response.json({ message: 'Ordinary authority required' }, { status: 403 });
					if (url.pathname === '/rest/v1/organizations') return Response.json({ id: ORG_ID, suspended_at: null });
					if (url.pathname === '/rest/v1/organization_memberships') return Response.json({ role: 'owner' });
					if (url.pathname !== '/rest/v1/organization_rank_catalog')
						return Response.json({ message: 'Unexpected catalog read' }, { status: 400 });
					return Response.json(
						ranks.filter((row) => url.searchParams.get('organization_id') === `eq.${row.organization_id}`)
					);
				}
			}
		});
		const admitted = await buildRequest('route', {
			actor: { userId: USER_ID },
			supabase,
			session: null
		} as unknown as App.Locals);
		const personnel = createRequestPersonnelWorkspaceContext(admitted);
		const training = createRequestTrainingRosterContext(admitted);
		const later = { ...admitted, auth: { ...admitted.auth, orgId: OTHER_ORG_ID } };
		await expect(createRequestPersonnelWorkspaceContext(later).loadRankCatalog()).resolves.toEqual([
			{
				organizationId: OTHER_ORG_ID,
				code: 'B-ONLY',
				label: 'B rank',
				service: 'custom',
				category: 'custom',
				payGrade: 'ungraded',
				state: 'active',
				source: 'custom',
				sortOrder: 1
			}
		]);
		const expected = [
			{
				organizationId: ORG_ID,
				code: 'A-ONLY',
				label: 'A rank',
				service: 'custom',
				category: 'custom',
				payGrade: 'ungraded',
				state: 'active',
				source: 'custom',
				sortOrder: 1
			}
		];
		await expect(personnel.loadRankCatalog()).resolves.toEqual(expected);
		await expect(training.loadRankCatalog()).resolves.toEqual(expected);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});

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

describe('request-bound export lifecycle persistence', () => {
	it('writes through the admitted ordinary client and leaves foreign history unchanged', async () => {
		const rows: Record<string, unknown>[] = [
			{ id: 'foreign-export', org_id: OTHER_ORG_ID, requested_by: OTHER_USER_ID, status: 'processing' }
		];
		const supabase = createClient('http://lifecycle.invalid', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					if (request.headers.get('authorization') !== 'Bearer synthetic-request-key')
						return Response.json({ message: 'Ordinary authority required' }, { status: 403 });
					if (url.pathname === '/rest/v1/organizations') return Response.json({ id: ORG_ID, suspended_at: null });
					if (url.pathname === '/rest/v1/organization_memberships' && request.method === 'GET')
						return Response.json({ role: 'owner' });
					if (url.pathname !== '/rest/v1/data_exports') throw new Error('Unexpected lifecycle transport');
					if (request.method === 'POST') {
						const row = { ...(await request.json()), id: 'export-a' };
						rows.push(row);
						return Response.json({ id: row.id });
					}
					if (request.method !== 'PATCH') throw new Error('Unexpected lifecycle method');
					const visible = rows.filter((row) =>
						[...url.searchParams].every(([column, filter]) =>
							column === 'select' ? true : filter === `eq.${row[column]}`
						)
					);
					if (visible.length !== 1)
						return Response.json({ code: 'PGRST116', message: 'No matching export' }, { status: 406 });
					Object.assign(visible[0], await request.json());
					return Response.json({ id: visible[0].id });
				}
			}
		});
		const locals = { actor: { userId: USER_ID }, supabase, session: null } as unknown as App.Locals;
		const ctx = createRequestOrganizationExportContext(await buildRequest('route', locals));
		const createdAt = '2026-10-05T18:00:00.000Z';
		const completedAt = '2026-10-05T18:00:01.000Z';
		const { exportId } = await ctx.exportLifecycle.createProcessing({ requestedBy: USER_ID, createdAt });
		await ctx.exportLifecycle.markCompleted({ exportId, completedAt, fileSizeBytes: 512 });
		await expect(ctx.exportLifecycle.markFailed({ exportId: 'foreign-export', completedAt })).rejects.toThrow(
			'No matching export'
		);
		expect(rows).toEqual([
			{ id: 'foreign-export', org_id: OTHER_ORG_ID, requested_by: OTHER_USER_ID, status: 'processing' },
			{
				id: 'export-a',
				org_id: ORG_ID,
				requested_by: USER_ID,
				status: 'completed',
				created_at: createdAt,
				completed_at: completedAt,
				file_size_bytes: 512
			}
		]);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
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
						if (table === 'organizations') return Response.json({ id: ORG_ID, suspended_at: null });
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

describe('request-bound unit counts', () => {
	it('counts the admitted Organization through the request client, Rating Scheme included', async () => {
		getAdminClient.mockClear();
		const seen: Array<{ table: string; organization: string | null; authorization: string | null }> = [];
		const supabase = createClient('http://counts.invalid', 'ordinary-request-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					seen.push({
						table: url.pathname.replace('/rest/v1/', ''),
						organization: url.searchParams.get('organization_id'),
						authorization: request.headers.get('authorization')
					});
					return new Response(request.method === 'HEAD' ? null : '[]', {
						status: 200,
						headers: { 'Content-Range': '*/7', 'Content-Type': 'application/json' }
					});
				}
			}
		});
		const ctx = createRequestUnitCountsContext({
			auth: { orgId: ORG_ID },
			supabase
		} as unknown as AdmittedOrganizationRequest);

		expect(await readUnitCounts(ctx.unitCounts, ['members', 'ratingSchemeEntries'])).toEqual({
			members: 7,
			ratingSchemeEntries: 7
		});
		expect(seen.map(({ table }) => table).sort()).toEqual(['organization_memberships', 'rating_scheme_entries']);
		expect(seen.every(({ organization }) => organization === `eq.${ORG_ID}`)).toBe(true);
		expect(seen.every(({ authorization }) => authorization === 'Bearer ordinary-request-key')).toBe(true);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});
