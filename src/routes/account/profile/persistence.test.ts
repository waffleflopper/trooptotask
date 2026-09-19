import { expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { actions, load } from './+page.server';
it('keeps profile-save failure retryable until the bound saved row is acknowledged', async () => {
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
		locals: { user: { id: 'actor' }, supabase },
		request: new Request('http://app.invalid/account/profile', {
			method: 'POST',
			body: new URLSearchParams({ firstName: 'Jane', lastName: 'Smith', rank: 'SGT' })
		})
	};
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		expect(await actions.default(event as never)).toMatchObject({ status: 500, data: { error: expect.any(String) } });
		acknowledge = true;
		event.request = new Request('http://app.invalid/account/profile', {
			method: 'POST',
			body: new URLSearchParams({ firstName: 'Jane', lastName: 'Smith', rank: 'SGT' })
		});
		expect(await actions.default(event as never)).toMatchObject({ success: expect.any(String) });
		expect(await load(event as never)).toMatchObject({
			profile: { userId: 'actor', firstName: 'Jane', lastName: 'Smith', rank: 'SGT' }
		});
		expect(saved).toEqual([
			{ user_id: 'actor', first_name: 'Jane', last_name: 'Smith', rank: 'SGT' },
			{ user_id: 'actor', first_name: 'Jane', last_name: 'Smith', rank: 'SGT' }
		]);
	} finally {
		log.mockRestore();
	}
});
