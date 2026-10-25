import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { load } from './+layout.server';

function event(path: string, memberships: unknown[], options: { actor?: boolean; profileFailure?: boolean } = {}) {
	const supabase = createClient('http://provider.invalid', 'synthetic-anon', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input) => {
				const url = new URL(new Request(input).url);
				if (url.pathname.endsWith('/organization_memberships')) return Response.json(memberships);
				if (url.pathname.endsWith('/user_profiles'))
					return options.profileFailure
						? Response.json({ message: 'unavailable' }, { status: 400 })
						: Response.json({ user_id: 'actor', first_name: 'Jane', last_name: 'Smith', rank: 'SGT' });
				throw new Error(`Unexpected read ${url.pathname}`);
			}
		}
	});
	return {
		locals: {
			actor: options.actor === false ? null : { userId: 'actor' },
			user: { id: 'actor', email: 'jane@example.test' },
			session: null,
			supabase
		},
		url: new URL(`https://example.test${path}`),
		depends: () => {}
	} as never;
}

const alpha = { role: 'member', organizations: { id: 'org-alpha', name: 'Alpha', url_slug: 'alpha-co' } };
const bravo = { role: 'admin', organizations: { id: 'org-bravo', name: 'Bravo', url_slug: null } };

describe('account routing and standalone first paint', () => {
	it.each([
		['/account', '/org/alpha-co/account/profile'],
		['/account/profile', '/org/alpha-co/account/profile'],
		['/account/security?next=%2Fdashboard', '/org/alpha-co/account/security?next=%2Fdashboard'],
		['/account/notifications', '/org/alpha-co/account/notifications'],
		['/account/feedback/saved-id?from=email', '/org/alpha-co/account/feedback/saved-id?from=email']
	])('redirects %s to the first Organization and retains the full remaining path', async (path, location) => {
		await expect(load(event(path, [alpha, bravo]))).rejects.toMatchObject({ status: 303, location });
	});

	it('uses the Organization id when no URL segment exists', async () => {
		await expect(load(event('/account/security', [bravo]))).rejects.toMatchObject({
			status: 303,
			location: '/org/org-bravo/account/security'
		});
	});

	it.each(['/account/profile', '/account/security'])(
		'loads %s without membership, with the same account facts as the shell',
		async (path) => {
			await expect(load(event(path, []))).resolves.toEqual({
				account: {
					id: 'actor',
					email: 'jane@example.test',
					hasTwoFactor: null,
					profile: { status: 'loaded', profile: { firstName: 'Jane', lastName: 'Smith', rank: 'SGT' } }
				},
				identitySessionScope: null
			});
		}
	);

	it.each(['/account', '/account/notifications', '/account/feedback/saved-id', '/account/billing'])(
		'redirects unavailable standalone path %s to Profile',
		async (path) => {
			await expect(load(event(path, []))).rejects.toMatchObject({ status: 303, location: '/account/profile' });
		}
	);

	it('keeps a failed profile read distinguishable from an absent profile', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await expect(load(event('/account/profile', [], { profileFailure: true }))).resolves.toMatchObject({
				account: { profile: { status: 'unavailable' } }
			});
		} finally {
			log.mockRestore();
		}
	});

	it('sends a signed-out visitor to sign in', async () => {
		await expect(load(event('/account/profile', [], { actor: false }))).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?next=%2Faccount%2Fprofile'
		});
	});
});
