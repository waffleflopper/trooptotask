import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Cookies } from '@sveltejs/kit';
import { createAppShellRequest } from './appShellRequestDelivery';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

describe('AppShell admitted request composition', () => {
	it('shares in-flight membership only within a request while another account and Organization complete independently', async () => {
		let release!: () => void;
		let started!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const memberStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		const memberReads: string[] = [];
		const rows = [
			{
				id: 'member-a',
				user_id: 'account-a',
				organization_id: ORG_A,
				role: 'member',
				member_preset: 'viewer',
				capability_overrides: { training: 'operate' },
				access_scope_kind: 'groups',
				access_scope_group_ids: ['clinic']
			},
			{ id: 'member-b', user_id: 'account-b', organization_id: ORG_B, role: 'owner' }
		];
		const client = createClient('http://shell-request.invalid', 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					if (init?.method !== 'GET' && !url.pathname.endsWith('/rpc/read_request_member_access'))
						throw new Error('Only read requests are permitted');
					if (url.pathname.endsWith('/organizations')) {
						const id = url.searchParams.get('id')?.slice(3);
						return Response.json([{ id, name: id === ORG_A ? 'Alpha' : 'Bravo', url_slug: null, suspended_at: null }]);
					}
					if (url.pathname.endsWith('/rpc/read_request_member_access')) {
						const { p_organization_id: orgId } = JSON.parse(String(init?.body));
						const userId = orgId === ORG_A ? 'account-a' : 'account-b';
						memberReads.push(`${userId}:${orgId}`);
						if (userId === 'account-a') {
							started();
							await held;
						}
						return Response.json(
							rows
								.filter((row) => row.user_id === userId && row.organization_id === orgId)
								.map((row) => ({
									...row,
									covered_group_ids: 'access_scope_group_ids' in row ? row.access_scope_group_ids : []
								}))[0]
						);
					}
					if (url.pathname.endsWith('/user_org_preferences')) return Response.json(null);
					if (url.pathname.endsWith('/user_profiles')) return Response.json([]);
					if (
						url.pathname.endsWith('/platform_announcements') ||
						url.pathname.endsWith('/announcement_dismissals') ||
						url.pathname.endsWith('/whats_new_entries')
					)
						return Response.json([]);
					throw new Error(`Unexpected first-paint read: ${url.pathname}`);
				}
			}
		});
		const localsA = { actor: { userId: 'account-a' }, supabase: client } as unknown as App.Locals;
		const localsB = { actor: { userId: 'account-b' }, supabase: client } as unknown as App.Locals;
		const bind = (locals: App.Locals, orgId: string) =>
			createAppShellRequest(
				{ locals, cookies: {} as Cookies, orgSegment: orgId, url: new URL(`http://app.invalid/org/${orgId}/training`) },
				{ getAdmittedRequestClient: () => ({ supabase: client, userId: locals.actor!.userId }) }
			);
		const firstA = bind(localsA, ORG_A).loadFirstPaint();
		const secondA = bind(localsA, ORG_A).loadFirstPaint();
		await memberStarted;
		try {
			const resultB = await bind(localsB, ORG_B).loadFirstPaint();
			expect(resultB.shell).toMatchObject({
				org: { id: ORG_B },
				user: { id: 'account-b' },
				member: {
					membershipId: 'member-b',
					isOwner: true,
					capabilityMap: { training: 'configure' },
					scopeSet: { kind: 'organization' }
				}
			});
			expect(memberReads.filter((key) => key === `account-a:${ORG_A}`)).toHaveLength(1);
		} finally {
			release();
		}
		for (const result of await Promise.all([firstA, secondA])) {
			expect(result.shell).toMatchObject({
				org: { id: ORG_A },
				user: { id: 'account-a' },
				member: {
					membershipId: 'member-a',
					isOwner: false,
					capabilityMap: { training: 'operate' },
					scopeSet: { kind: 'groups', groupIds: ['clinic'] }
				}
			});
		}
	});

	it.each([true, false, null])(
		'carries the admitted two-factor fact (%s) into the signed-in account',
		async (hasTwoFactor) => {
			const client = createClient('http://shell-request.invalid', 'synthetic-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: {
					fetch: async (input) => {
						const url = new URL(String(input));
						if (url.pathname.endsWith('/organizations'))
							return Response.json([{ id: ORG_A, name: 'Alpha', url_slug: null, suspended_at: null }]);
						if (url.pathname.endsWith('/rpc/read_request_member_access'))
							return Response.json({ id: 'member-a', user_id: 'account-a', organization_id: ORG_A, role: 'owner' });
						if (url.pathname.endsWith('/user_org_preferences')) return Response.json(null);
						return Response.json([]);
					}
				}
			});
			const locals = { actor: { userId: 'account-a' }, supabase: client, hasTwoFactor } as unknown as App.Locals;

			const { shell } = await createAppShellRequest(
				{ locals, cookies: {} as Cookies, orgSegment: ORG_A },
				{ getAdmittedRequestClient: () => ({ supabase: client, userId: 'account-a' }) }
			).loadFirstPaint();

			expect(shell).toMatchObject({ kind: 'ready', user: { id: 'account-a', hasTwoFactor } });
		}
	);
});
