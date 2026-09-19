import { beforeEach, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { attemptStore } from '../../../../tests/fixtures/passwordAttempt';
import { passwordSessionToken } from '../../../../tests/fixtures/passwordSession';
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc: attemptStore.rpc }) }));
import { POST } from './+server';

const actor = '00000000-0000-4000-8000-000000000001';
const email = 'invitee@example.test';
const profile = { user_id: actor, first_name: 'Jane', last_name: 'Smith', rank: 'SGT' };
let invitations: Array<{ id: string; email: string; status: string }>;
let memberships: Set<string>;
let faults: Map<string, unknown>;
let writes: string[];
let savedProfile: unknown;
function fixture() {
	const supabase = createClient('http://provider.invalid', 'synthetic-anon', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				if (url.pathname.endsWith('/user_profiles')) {
					if (init?.method === 'POST') {
						writes.push('profile');
						savedProfile = JSON.parse(String(init.body));
					}
					if (faults.has('profile')) return Response.json(faults.get('profile'));
					return Response.json(savedProfile ?? null);
				}
				if (url.pathname.endsWith('/organization_invitations')) {
					if (faults.has('second-page') && url.searchParams.get('offset') === '1000')
						return Response.json({ message: 'lookup denied' }, { status: 400 });
					if (faults.has('lookup')) return Response.json(faults.get('lookup'));
					return Response.json(
						invitations
							.filter(
								(i) =>
									`eq.${i.email}` === url.searchParams.get('normalized_email') &&
									`eq.${i.status}` === url.searchParams.get('status')
							)
							.slice(
								Number(url.searchParams.get('offset') ?? 0),
								Number(url.searchParams.get('offset') ?? 0) + Number(url.searchParams.get('limit') ?? 1000)
							)
							.map(({ id }) => ({ id }))
					);
				}
				if (url.pathname.endsWith('/rpc/accept_organization_invitation')) {
					const { p_invitation_id: id } = JSON.parse(String(init?.body));
					writes.push(id);
					if (faults.has(id)) {
						const value = faults.get(id);
						if (value === 'outage') return Response.json({ message: 'private failure' }, { status: 503 });
						return Response.json(value);
					}
					const invitation = invitations.find((i) => i.id === id)!;
					invitation.status = 'accepted';
					memberships.add(id);
					return Response.json({ accept_status: 'accepted', accepted_organization_id: `org-${id}` });
				}
				throw new Error(`Unexpected provider path ${url.pathname}`);
			}
		}
	});
	vi.spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel').mockResolvedValue({
		data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
		error: null
	});
	const locals = {
		user: {
			id: actor,
			email: ` ${email.toUpperCase()} `,
			user_metadata: { firstName: 'Jane', lastName: 'Smith', rank: 'SGT' }
		},
		session: { user: { id: actor }, access_token: passwordSessionToken(actor), expires_at: 4102444800 },
		authFlow: 'invite',
		supabase
	} as unknown as App.Locals;
	const cookies = { delete: vi.fn() };
	return { locals, cookies, call: () => POST({ locals, cookies } as unknown as Parameters<typeof POST>[0]) };
}
beforeEach(() => {
	invitations = [
		{ id: 'one', email, status: 'pending' },
		{ id: 'two', email, status: 'pending' },
		{ id: 'foreign', email: 'other@example.test', status: 'pending' }
	];
	memberships = new Set();
	faults = new Map();
	writes = [];
	savedProfile = null;
	attemptStore.row = {
		actor,
		session: '00000000-0000-4000-8000-000000000001',
		id: '00000000-0000-4000-8000-000000000099',
		flow: 'invite',
		state: 'complete',
		expiresAt: 4102444800,
		acquired: false
	};
});
it('persists the bound profile and accepts only the normalized-email invitations', async () => {
	const h = fixture();
	const response = await h.call();
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ activated: true, accepted: 2 });
	expect(savedProfile).toEqual(profile);
	expect([...memberships]).toEqual(['one', 'two']);
	expect(h.cookies.delete).toHaveBeenCalledOnce();
});
it.each([
	null,
	{},
	{ user_id: 'other', first_name: 'Jane', last_name: 'Smith', rank: 'SGT' },
	{ ...profile, rank: 'CPT' }
])('does not activate on an unacknowledged profile write: %j', async (data) => {
	faults.set('profile', data);
	const h = fixture();
	const response = await h.call();
	expect(response.status).toBeGreaterThanOrEqual(500);
	expect(await response.json()).toMatchObject({ activated: false });
	expect(memberships.size).toBe(0);
	expect(h.cookies.delete).not.toHaveBeenCalled();
	faults.clear();
	expect((await h.call()).status).toBe(200);
});
it.each([null, {}, [null], [{ id: '' }], [{ id: 1 }]])(
	'keeps activation pending for an unavailable invitation list: %j',
	async (data) => {
		faults.set('lookup', data);
		const h = fixture();
		const response = await h.call();
		expect(response.status).toBeGreaterThanOrEqual(500);
		expect(h.cookies.delete).not.toHaveBeenCalled();
		expect(memberships.size).toBe(0);
	}
);
it.each([
	null,
	{},
	{ accept_status: 'accepted', accepted_organization_id: null },
	{ accept_status: 'unknown', accepted_organization_id: 'org-two' },
	'outage'
])('retains confirmed partial effects and retries unresolved invitations: %j', async (data) => {
	faults.set('two', data);
	const h = fixture();
	const response = await h.call();
	expect(response.status).toBeGreaterThanOrEqual(500);
	expect(await response.json()).toMatchObject({ activated: false, accepted: 1 });
	expect([...memberships]).toEqual(['one']);
	expect(h.cookies.delete).not.toHaveBeenCalled();
	faults.clear();
	writes = [];
	const retry = await h.call();
	expect(retry.status).toBe(200);
	expect(writes).not.toContain('one');
	expect([...memberships]).toEqual(['one', 'two']);
	writes = [];
	expect((await h.call()).status).toBe(200);
	expect(writes).toEqual(['profile']);
	h.locals.authFlow = null;
	expect((await h.call()).status).toBe(403);
});
it('does not call reviewed setup complete when the membership RPC still requires setup', async () => {
	faults.set('one', { accept_status: 'setup_required', accepted_organization_id: null });
	const h = fixture();
	const response = await h.call();
	expect(response.status).toBe(409);
	expect(await response.json()).toMatchObject({ activated: false, code: 'setup_required' });
	expect(h.cookies.delete).not.toHaveBeenCalled();
	expect(memberships.size).toBe(0);
});
it.each(['expired', 'blocked', 'not_found'])(
	'reports terminal %s invitations without claiming membership or blocking account activation',
	async (status) => {
		faults.set('one', { accept_status: status, accepted_organization_id: status === 'not_found' ? null : 'org-one' });
		const h = fixture();
		const response = await h.call();
		expect(await response.json()).toMatchObject({ activated: true, accepted: 1, unavailable: 1 });
		expect([...memberships]).toEqual(['two']);
	}
);
it('loads every invitation page before acceptance changes the pending set', async () => {
	invitations = Array.from({ length: 1001 }, (_, i) => ({ id: `invite-${i}`, email, status: 'pending' }));
	const h = fixture();
	faults.set('second-page', true);
	expect((await h.call()).status).toBe(503);
	expect(memberships.size).toBe(0);
	expect(h.cookies.delete).not.toHaveBeenCalled();
	faults.clear();
	expect(await (await h.call()).json()).toMatchObject({ accepted: 1001, activated: true });
	expect(memberships.size).toBe(1001);
});
it.each(['already_member', 'already_accepted'])(
	'retains confirmed %s access without counting another membership',
	async (status) => {
		memberships.add('one');
		faults.set('one', { accept_status: status, accepted_organization_id: 'org-one' });
		const h = fixture();
		expect(await (await h.call()).json()).toMatchObject({ activated: true, accepted: 1 });
		expect([...memberships]).toEqual(['one', 'two']);
	}
);
