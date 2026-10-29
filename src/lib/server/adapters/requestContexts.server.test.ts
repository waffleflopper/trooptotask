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
	return {
		from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }),
		rpc: vi.fn().mockReturnValue({ single: query.single })
	};
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
					if (url.pathname === '/rest/v1/rpc/read_request_member_access') return Response.json({ role: 'owner' });
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
				rpc: vi.fn((name: string) =>
					name === 'read_request_member_access'
						? { single: async () => ({ data: { role: 'owner' }, error: null }) }
						: Promise.resolve({ data: false, error: null })
				)
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
					if (url.pathname === '/rest/v1/rpc/read_request_member_access' && request.method === 'POST')
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
						if (table === 'read_request_member_access') return Response.json({ role: 'owner' });
						if (!['notifications', 'beta_feedback'].includes(table)) {
							throw new Error('Unexpected request client read');
						}
						return Response.json(
							rows.filter(
								(row) =>
									row.user_id === USER_ID &&
									(!url.searchParams.has('organization_id') ||
										url.searchParams.get('organization_id') === `eq.${row.organization_id}`) &&
									(!url.searchParams.has('or') ||
										row.organization_id === null ||
										url.searchParams.get('or')?.includes(`organization_id.eq.${row.organization_id},`)) &&
									(!url.searchParams.has('user_id') || url.searchParams.get('user_id') === `eq.${row.user_id}`)
							)
						);
					}
				}
			});
			const locals = { actor: { userId: USER_ID }, supabase, session: null } as unknown as App.Locals;
			const ctx = createRequestOrganizationExportContext(await buildRequest(kind, locals));

			await expect(listNotificationExportRows(ctx.notificationSelf)).resolves.toEqual([own]);
			await expect(ctx.feedbackExport.listRows(ctx.auth.orgId)).resolves.toEqual([{ ...own, admin_notes: null }]);
			expect(getAdminClient).not.toHaveBeenCalled();
		}
	);
});

describe('governance unit counts', () => {
	it('count what the Organization retains through the trusted client, a turned-off feature included', async () => {
		getAdminClient.mockClear();
		const tables: Record<string, Array<{ organization_id: string }>> = {
			organization_memberships: [
				...Array.from({ length: 3 }, () => ({ organization_id: ORG_ID })),
				...Array.from({ length: 9 }, () => ({ organization_id: OTHER_ORG_ID }))
			],
			personnel_trainings: [
				...Array.from({ length: 4 }, () => ({ organization_id: ORG_ID })),
				...Array.from({ length: 6 }, () => ({ organization_id: OTHER_ORG_ID }))
			],
			rating_scheme_entries: [
				...Array.from({ length: 5 }, () => ({ organization_id: ORG_ID })),
				...Array.from({ length: 2 }, () => ({ organization_id: OTHER_ORG_ID }))
			]
		};
		const seen: Array<{ table: string; exact: boolean | undefined; authorization: string | null }> = [];
		const options = (fetch: typeof globalThis.fetch) => ({
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch }
		});
		const adminClient = createClient(
			'http://counts.invalid',
			'service-key',
			options(async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				const table = url.pathname.replace('/rest/v1/', '');
				seen.push({
					table,
					exact: request.headers.get('prefer')?.includes('count=exact'),
					authorization: request.headers.get('authorization')
				});
				const matching = (tables[table] ?? []).filter(
					(row) => url.searchParams.get('organization_id') === `eq.${row.organization_id}`
				);
				return new Response(null, { status: 200, headers: { 'Content-Range': `*/${matching.length}` } });
			})
		);
		getAdminClient.mockImplementationOnce(() => adminClient as never);
		const supabase = createClient(
			'http://counts.invalid',
			'ordinary-request-key',
			options(async () => new Response(null, { status: 200, headers: { 'Content-Range': '*/0' } }))
		);
		const ctx = createRequestUnitCountsContext({
			auth: { orgId: ORG_ID },
			supabase,
			disabledFeatures: ['training', 'evaluations']
		} as unknown as AdmittedOrganizationRequest);
		expect(getAdminClient).not.toHaveBeenCalled();

		expect(await readUnitCounts(ctx.unitCounts, ['members', 'trainingRecords', 'ratingSchemeEntries'])).toEqual({
			members: 3,
			trainingRecords: 4,
			ratingSchemeEntries: 5
		});
		expect(seen.sort((a, b) => a.table.localeCompare(b.table))).toEqual([
			{ table: 'organization_memberships', exact: true, authorization: 'Bearer service-key' },
			{ table: 'personnel_trainings', exact: true, authorization: 'Bearer service-key' },
			{ table: 'rating_scheme_entries', exact: true, authorization: 'Bearer service-key' }
		]);
		expect(getAdminClient).toHaveBeenCalledTimes(1);
	});
});
