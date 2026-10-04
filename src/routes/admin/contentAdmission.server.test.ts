import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

import { load as layoutLoad } from './+layout.server';
import { load as dashboardLoad } from './+page.server';
import { actions as announcementActions, load as announcementLoad } from './announcements/+page.server';
import { actions as feedbackActions, load as feedbackLoad } from './feedback/+page.server';
import { load as auditLoad } from './audit/+page.server';

type ContentPage = 'dashboard' | 'announcements' | 'feedback' | 'audit';
type PlatformRole = 'super_admin' | 'support' | 'billing';
interface ActorCase {
	name: string;
	role: PlatformRole | null;
	active: boolean;
	authenticated: boolean;
	pages: readonly ContentPage[];
}

const ACTOR_ID = '10000000-0000-4000-8000-000000000001';
const ANNOUNCEMENT_ID = '20000000-0000-4000-8000-000000000001';
const FEEDBACK_ID = '30000000-0000-4000-8000-000000000001';
const AUDIT_ID = '40000000-0000-4000-8000-000000000001';
const actors: ActorCase[] = [
	{
		name: 'super-admin',
		role: 'super_admin',
		active: true,
		authenticated: true,
		pages: ['dashboard', 'announcements', 'feedback', 'audit']
	},
	{ name: 'support', role: 'support', active: true, authenticated: true, pages: ['dashboard', 'feedback'] },
	{ name: 'billing', role: 'billing', active: true, authenticated: true, pages: ['dashboard'] },
	{ name: 'inactive super-admin', role: 'super_admin', active: false, authenticated: true, pages: [] },
	{ name: 'ordinary account', role: null, active: false, authenticated: true, pages: [] },
	{ name: 'anonymous', role: null, active: false, authenticated: false, pages: [] }
];

const loads: Record<ContentPage, (request: RequestEvent) => Promise<unknown>> = {
	dashboard: async (request) => dashboardLoad(request as Parameters<typeof dashboardLoad>[0]),
	announcements: async (request) => announcementLoad(request as Parameters<typeof announcementLoad>[0]),
	feedback: async (request) => feedbackLoad(request as Parameters<typeof feedbackLoad>[0]),
	audit: async (request) => auditLoad(request as Parameters<typeof auditLoad>[0])
};
const permittedWitnesses: Record<ContentPage, readonly [string, string | number]> = {
	dashboard: ['pendingFeedback', 1],
	announcements: ['announcements.0.id', ANNOUNCEMENT_ID],
	feedback: ['newItems.0.id', FEEDBACK_ID],
	audit: ['logs.0.id', AUDIT_ID]
};

function request(actor: ActorCase, path: string, form?: Record<string, string>): RequestEvent {
	const url = new URL(path, 'http://app.example.test');
	return {
		locals: {
			actor: actor.authenticated ? { userId: ACTOR_ID } : null,
			user: actor.authenticated ? { id: ACTOR_ID, email: 'synthetic@example.test' } : null,
			supabase: {},
			session: null
		},
		url,
		request: new Request(url, form ? { method: 'POST', body: new URLSearchParams(form) } : undefined),
		getClientAddress: () => '127.0.0.1'
	} as RequestEvent;
}

function provider(actor: ActorCase) {
	const announcements = [
		{
			id: ANNOUNCEMENT_ID,
			title: 'Synthetic notice',
			message: 'Synthetic global message',
			type: 'info',
			is_active: true,
			created_at: '2026-06-01T10:00:00Z',
			expires_at: null,
			created_by: ACTOR_ID
		}
	];
	const feedback = [
		{
			id: FEEDBACK_ID,
			user_email: 'member@example.test',
			category: 'bug',
			message: 'Synthetic report',
			created_at: '2026-06-01T10:00:00Z',
			organization_name: 'Synthetic Organization',
			page_url: '/org/synthetic',
			status: 'new',
			admin_notes: 'Original notes'
		}
	];
	const contentReads: string[] = [];
	const writes: string[] = [];
	const fetchProvider: typeof fetch = async (input, init) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		const resource = url.pathname.replace('/rest/v1/', '');
		const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
		const objectResponse = new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object');
		const rowResponse = (row: unknown) => Response.json(objectResponse ? row : [row]);
		if (resource === 'platform_admins') {
			const admitted =
				actor.active &&
				actor.role &&
				url.searchParams.get('user_id') === `eq.${ACTOR_ID}` &&
				url.searchParams.get('is_active') === 'eq.true';
			return Response.json(admitted ? { role: actor.role } : null);
		}
		if (method === 'GET' || method === 'HEAD' || resource.startsWith('rpc/')) contentReads.push(resource);
		else writes.push(resource);
		if (resource === 'rpc/count_platform_users') return Response.json({ total: 3, last_30_days: 1 });
		if (resource === 'rpc/daily_signups_last_30_days') return Response.json([{ date: '2026-06-01', count: 1 }]);
		if (method === 'HEAD') return new Response(null, { headers: { 'content-range': '*/1' } });
		if (resource === 'platform_announcements') {
			if (method === 'PATCH') Object.assign(announcements[0], JSON.parse(String(init?.body)));
			if (method === 'DELETE') announcements.length = 0;
			if (method === 'POST') announcements.push(JSON.parse(String(init?.body)));
			if (url.searchParams.has('id') || method === 'PATCH') return rowResponse(announcements[0] ?? null);
			return Response.json(announcements);
		}
		if (resource === 'beta_feedback') {
			if (method === 'PATCH') Object.assign(feedback[0], JSON.parse(String(init?.body)));
			return method === 'PATCH' ? rowResponse({ id: FEEDBACK_ID }) : Response.json(feedback);
		}
		if (resource === 'audit_logs')
			return Response.json([
				{
					id: AUDIT_ID,
					user_id: ACTOR_ID,
					org_id: null,
					action: 'announcement_create',
					resource_type: 'platform_announcement',
					resource_id: ANNOUNCEMENT_ID,
					ip_address: '127.0.0.1',
					details: { title: 'Synthetic notice' },
					severity: 'info',
					timestamp: '2026-06-01T10:00:00Z'
				}
			]);
		throw new Error(`Unexpected synthetic provider request: ${method} ${resource}`);
	};
	getAdminClient.mockReturnValue(
		createClient('http://provider.example.test', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch: fetchProvider }
		})
	);
	return { announcements, feedback, contentReads, writes };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('platform content route admission', () => {
	it.each(actors)('$name receives only its permitted content pages', async (actor) => {
		const state = provider(actor);
		const pages = Object.keys(loads) as ContentPage[];
		for (const page of pages) {
			state.contentReads.length = 0;
			const result = loads[page](request(actor, page === 'dashboard' ? '/admin' : `/admin/${page}`));
			if (actor.pages.includes(page)) {
				await expect(result, page).resolves.toHaveProperty(...permittedWitnesses[page]);
				expect(state.contentReads, page).not.toEqual([]);
			} else {
				await expect(result, page).rejects.toMatchObject({ status: actor.authenticated ? 403 : 303 });
				expect(state.contentReads, page).toEqual([]);
			}
		}
		expect(state.writes).toEqual([]);
	});

	it.each(actors)('$name has the same admission at the shared admin layout', async (actor) => {
		provider(actor);
		const result = layoutLoad(request(actor, '/admin') as Parameters<typeof layoutLoad>[0]);
		if (actor.pages.length) {
			const data = await result;
			if (!data) expect.unreachable('Expected admitted admin layout data');
			expect(data).toMatchObject({ adminUserId: ACTOR_ID, adminRole: actor.role });
			expect(data.accessiblePages.filter((page: string) => Object.hasOwn(loads, page)).sort()).toEqual(
				[...actor.pages].sort()
			);
		} else {
			await expect(result).rejects.toMatchObject({ status: actor.authenticated ? 403 : 303 });
		}
	});

	it.each(actors.filter((actor) => actor.name !== 'super-admin'))(
		'$name cannot mutate announcement or Feedback rows outside its admitted pages',
		async (actor) => {
			const state = provider(actor);
			const original = structuredClone({ announcements: state.announcements, feedback: state.feedback });
			const announcementForms = {
				create: { title: 'Denied notice', message: 'Must not persist', type: 'info' },
				toggle: { id: ANNOUNCEMENT_ID },
				delete: { id: ANNOUNCEMENT_ID }
			};
			for (const action of ['create', 'toggle', 'delete'] as const) {
				const handler = announcementActions[action];
				const result = await Promise.resolve()
					.then(() =>
						handler(
							request(actor, `/admin/announcements?/${action}`, announcementForms[action]) as Parameters<
								typeof handler
							>[0]
						)
					)
					.catch((error: unknown) => error);
				expect(result).toMatchObject({ status: actor.authenticated ? 403 : 303 });
			}
			if (!actor.pages.includes('feedback')) {
				const handler = feedbackActions.update;
				const result = await Promise.resolve()
					.then(() =>
						handler(
							request(actor, '/admin/feedback?/update', {
								feedbackId: FEEDBACK_ID,
								status: 'resolved',
								adminNotes: 'Denied change'
							}) as Parameters<typeof handler>[0]
						)
					)
					.catch((error: unknown) => error);
				expect(result).toMatchObject({ status: actor.authenticated ? 403 : 303 });
			}
			expect(state.contentReads).toEqual([]);
			expect(state.writes).toEqual([]);
			expect({ announcements: state.announcements, feedback: state.feedback }).toEqual(original);
		}
	);

	it('admits super-admin announcement changes and support Feedback review through the same handlers', async () => {
		const superAdmin = actors[0];
		const announcementState = provider(superAdmin);
		await expect(
			announcementActions.toggle(
				request(superAdmin, '/admin/announcements?/toggle', {
					id: ANNOUNCEMENT_ID
				}) as Parameters<typeof announcementActions.toggle>[0]
			)
		).resolves.toEqual({ success: true });
		expect(announcementState.announcements[0].is_active).toBe(false);

		const support = actors[1];
		const feedbackState = provider(support);
		await expect(
			feedbackActions.update(
				request(support, '/admin/feedback?/update', {
					feedbackId: FEEDBACK_ID,
					status: 'reviewed',
					adminNotes: ''
				}) as Parameters<typeof feedbackActions.update>[0]
			)
		).resolves.toEqual({ success: true });
		expect(feedbackState.feedback[0]).toMatchObject({ id: FEEDBACK_ID, status: 'reviewed', admin_notes: '' });
	});
});
