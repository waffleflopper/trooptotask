import { expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { loadUserProfile } from '$features/identity/index.server';
import { actions } from './+page.server';
import { actions as standaloneActions } from '../../../../account/profile/+page.server';
it.each([
	['Organization', actions],
	['standalone', standaloneActions]
] as const)('%s profile save stays retryable until the bound row is acknowledged', async (_mode, pageActions) => {
	let acknowledge = false;
	const saved: unknown[] = [];
	const supabase = createClient('http://provider.invalid', 'synthetic-anon', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (_input, init) => {
				if (init?.method === 'POST') saved.push(JSON.parse(String(init.body)));
				return Response.json(acknowledge ? saved.at(-1) : null);
			}
		}
	});
	const event = {
		locals: { actor: { userId: 'actor' }, user: { id: 'actor' }, supabase },
		request: new Request('http://app.invalid/org/alpha/account/profile', {
			method: 'POST',
			body: new URLSearchParams({ firstName: 'Jane', lastName: 'Smith', rank: 'SGT', userId: 'forged-subject' })
		})
	};
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		expect(await pageActions.default(event as never)).toMatchObject({
			status: 500,
			data: { error: expect.any(String) }
		});
		acknowledge = true;
		event.request = new Request('http://app.invalid/org/alpha/account/profile', {
			method: 'POST',
			body: new URLSearchParams({ firstName: 'Jane', lastName: 'Smith', rank: 'SGT', userId: 'forged-subject' })
		});
		expect(await pageActions.default(event as never)).toMatchObject({ success: expect.any(String) });
		expect(await loadUserProfile(event.locals, 'actor')).toEqual({
			userId: 'actor',
			firstName: 'Jane',
			lastName: 'Smith',
			rank: 'SGT'
		});
		expect(saved).toEqual([
			{ user_id: 'actor', first_name: 'Jane', last_name: 'Smith', rank: 'SGT' },
			{ user_id: 'actor', first_name: 'Jane', last_name: 'Smith', rank: 'SGT' }
		]);
	} finally {
		log.mockRestore();
	}
});
