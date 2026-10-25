import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

import { load as layoutLoad } from './+layout.server';
import { actions as announcementActions, load as announcementLoad } from './announcements/+page.server';
import { actions as feedbackActions, load as feedbackLoad } from './feedback/+page.server';

type ContentPage = 'announcements' | 'feedback';
interface ActorCase {
	name: string;
	operator: boolean;
	authenticated: boolean;
	assurance: { currentLevel: 'aal1' | 'aal2'; nextLevel: 'aal1' | 'aal2' };
	admitted: boolean;
	denial: { status: number; location?: string };
}

const ACTOR_ID = '10000000-0000-4000-8000-000000000001';
const ANNOUNCEMENT_ID = '20000000-0000-4000-8000-000000000001';
const FEEDBACK_ID = '30000000-0000-4000-8000-000000000001';
const aal2 = { currentLevel: 'aal2', nextLevel: 'aal2' } as const;
const actors: ActorCase[] = [
	{
		name: 'operator at aal2',
		operator: true,
		authenticated: true,
		assurance: aal2,
		admitted: true,
		denial: { status: 0 }
	},
	{
		name: 'operator without MFA enrolled',
		operator: true,
		authenticated: true,
		assurance: { currentLevel: 'aal1', nextLevel: 'aal1' },
		admitted: false,
		denial: { status: 303, location: '/auth/mfa-setup' }
	},
	{
		name: 'operator with MFA enrolled but not verified',
		operator: true,
		authenticated: true,
		assurance: { currentLevel: 'aal1', nextLevel: 'aal2' },
		admitted: false,
		denial: { status: 303, location: '/auth/mfa-verify' }
	},
	{
		name: 'ordinary account',
		operator: false,
		authenticated: true,
		assurance: aal2,
		admitted: false,
		denial: { status: 403 }
	},
	{
		name: 'anonymous',
		operator: false,
		authenticated: false,
		assurance: aal2,
		admitted: false,
		denial: { status: 403 }
	}
];

const loads: Record<ContentPage, (request: RequestEvent) => Promise<unknown>> = {
	announcements: async (request) => announcementLoad(request as Parameters<typeof announcementLoad>[0]),
	feedback: async (request) => feedbackLoad(request as Parameters<typeof feedbackLoad>[0])
};
const permittedWitnesses: Record<ContentPage, readonly [string, string | number]> = {
	announcements: ['announcements.0.id', ANNOUNCEMENT_ID],
	feedback: ['newItems.0.id', FEEDBACK_ID]
};

function request(actor: ActorCase, path: string, form?: Record<string, string>): RequestEvent {
	const url = new URL(path, 'http://app.example.test');
	return {
		locals: {
			actor: actor.authenticated ? { userId: ACTOR_ID } : null,
			user: actor.authenticated ? { id: ACTOR_ID, email: 'synthetic@example.test' } : null,
			supabase: {
				auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: actor.assurance, error: null }) } }
			},
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
		if (resource === 'platform_operators') {
			return Response.json(
				actor.operator && url.searchParams.get('user_id') === `eq.${ACTOR_ID}` ? { user_id: ACTOR_ID } : null
			);
		}
		if (method === 'GET' || method === 'HEAD' || resource.startsWith('rpc/')) contentReads.push(resource);
		else writes.push(resource);
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
		if (resource === 'audit_logs') return new Response(null, { status: 201 });
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

const pages = Object.keys(loads) as ContentPage[];
const denied = (actor: ActorCase) =>
	expect.objectContaining({
		status: actor.denial.status,
		...(actor.denial.location ? { location: expect.stringContaining(`${actor.denial.location}?next=`) } : {})
	});

describe('platform content route admission', () => {
	it.each(actors)('$name receives only its permitted content pages', async (actor) => {
		const state = provider(actor);
		for (const page of pages) {
			state.contentReads.length = 0;
			const result = loads[page](request(actor, `/admin/${page}`));
			if (actor.admitted) {
				await expect(result, page).resolves.toHaveProperty(...permittedWitnesses[page]);
				expect(state.contentReads, page).not.toEqual([]);
			} else {
				await expect(result, page).rejects.toEqual(denied(actor));
				expect(state.contentReads, page).toEqual([]);
			}
		}
		expect(state.writes).toEqual([]);
	});

	it.each(actors)('$name has the same admission at the shared admin layout', async (actor) => {
		provider(actor);
		const result = layoutLoad(request(actor, '/admin') as Parameters<typeof layoutLoad>[0]);
		if (actor.admitted) {
			const data = await result;
			if (!data) expect.unreachable('Expected admitted admin layout data');
			expect(data).toMatchObject({ adminUserId: ACTOR_ID });
			expect(data.accessiblePages).toEqual(
				expect.arrayContaining(['dashboard', 'users', 'organizations', 'access-requests', ...pages])
			);
		} else {
			await expect(result).rejects.toEqual(denied(actor));
		}
	});

	it.each(actors.filter((actor) => !actor.admitted))(
		'$name cannot mutate announcement or Feedback rows',
		async (actor) => {
			const state = provider(actor);
			const original = structuredClone({ announcements: state.announcements, feedback: state.feedback });
			const announcementForms = {
				create: { title: 'Denied notice', message: 'Must not persist', type: 'info' },
				toggle: { id: ANNOUNCEMENT_ID, isActive: 'false' },
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
				expect(result).toEqual(denied(actor));
			}
			const result = await Promise.resolve()
				.then(() =>
					feedbackActions.update(
						request(actor, '/admin/feedback?/update', {
							feedbackId: FEEDBACK_ID,
							status: 'resolved',
							adminNotes: 'Denied change'
						}) as Parameters<typeof feedbackActions.update>[0]
					)
				)
				.catch((error: unknown) => error);
			expect(result).toEqual(denied(actor));
			expect(state.contentReads).toEqual([]);
			expect(state.writes).toEqual([]);
			expect({ announcements: state.announcements, feedback: state.feedback }).toEqual(original);
		}
	);

	it('admits an operator at aal2 to announcement changes and Feedback review through the same handlers', async () => {
		const operator = actors[0];
		const state = provider(operator);
		for (const [isActive, stored] of [
			['false', false],
			['false', false],
			['true', true],
			['true', true]
		] as const) {
			await expect(
				announcementActions.toggle(
					request(operator, '/admin/announcements?/toggle', {
						id: ANNOUNCEMENT_ID,
						isActive
					}) as Parameters<typeof announcementActions.toggle>[0]
				)
			).resolves.toEqual({ success: true });
			expect(state.announcements[0].is_active).toBe(stored);
		}

		await expect(
			feedbackActions.update(
				request(operator, '/admin/feedback?/update', {
					feedbackId: FEEDBACK_ID,
					status: 'reviewed',
					adminNotes: ''
				}) as Parameters<typeof feedbackActions.update>[0]
			)
		).resolves.toEqual({ success: true });
		expect(state.feedback[0]).toMatchObject({ id: FEEDBACK_ID, status: 'reviewed', admin_notes: '' });
	});
});
