import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { load } from './+page.server';

function membershipClient(rows: unknown[]) {
	return createClient('http://provider.invalid', 'synthetic-anon', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input) => {
				const url = new URL(String(input));
				if (!url.pathname.endsWith('/organization_memberships')) throw new Error(`Unexpected read ${url}`);
				return Response.json(url.searchParams.get('user_id') === 'eq.actor' ? rows : []);
			}
		}
	});
}

function event(
	path: string,
	section: string | undefined,
	rows: unknown[],
	actor: { userId: string } | null = { userId: 'actor' }
) {
	return {
		locals: { actor, supabase: membershipClient(rows) },
		params: { section },
		url: new URL(`http://app.invalid${path}`)
	} as never;
}

const alpha = { role: 'member', organizations: { id: 'org-alpha', name: 'Alpha', url_slug: 'alpha-co' } };
const bravo = { role: 'admin', organizations: { id: 'org-bravo', name: 'Bravo', url_slug: null } };

describe('legacy account routes', () => {
	it.each([
		['/account', undefined, '/org/alpha-co/account/profile'],
		['/account/profile', 'profile', '/org/alpha-co/account/profile'],
		['/account/security?next=%2Fdashboard', 'security', '/org/alpha-co/account/security?next=%2Fdashboard']
	])('sends %s to the same section of the first listed unit', async (path, section, location) => {
		await expect(load(event(path, section, [alpha, bravo]))).rejects.toMatchObject({ status: 303, location });
	});

	it('uses the unit id when the unit has no web address', async () => {
		await expect(load(event('/account/security', 'security', [bravo]))).rejects.toMatchObject({
			status: 303,
			location: '/org/org-bravo/account/security'
		});
	});

	it('sends a person with no unit to the dashboard', async () => {
		await expect(load(event('/account/security', 'security', []))).rejects.toMatchObject({
			status: 303,
			location: '/dashboard'
		});
	});

	it('sends a signed-out visitor to sign in and refuses an unknown section', async () => {
		await expect(load(event('/account/security', 'security', [alpha], null))).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});
		await expect(load(event('/account/billing', 'billing', [alpha]))).rejects.toMatchObject({ status: 404 });
	});
});
