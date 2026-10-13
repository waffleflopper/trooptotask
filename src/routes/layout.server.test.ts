import { describe, expect, it } from 'vitest';
import { load } from './+layout.server';

type LoadEvent = Parameters<typeof load>[0];

function loadWith(locals: Partial<App.Locals>) {
	return load({
		locals: { actor: null, session: null, user: null, ...locals },
		cookies: { getAll: () => [{ name: 'sb-access-token', value: 'secret-access-token' }] }
	} as unknown as LoadEvent);
}

const user = {
	id: 'user-1',
	email: 'member@example.test',
	user_metadata: { rank: 'SFC', first_name: 'Taylor', last_name: 'Example' }
};

describe('root layout server load', () => {
	it('serializes only the admitted viewer, never the provider session or cookies', async () => {
		const result = await loadWith({
			actor: { userId: 'user-1' },
			user: user as unknown as App.Locals['user'],
			session: {
				access_token: 'secret-access-token',
				refresh_token: 'secret-refresh-token',
				user
			} as unknown as App.Locals['session']
		});

		expect(result).toEqual({ viewer: { userId: 'user-1', displayName: 'SFC Taylor Example' } });
		expect(JSON.stringify(result)).not.toMatch(/secret|token|member@example\.test/);
	});

	it('gives a pending or anonymous session no viewer', async () => {
		expect(await loadWith({ user: user as unknown as App.Locals['user'] })).toEqual({ viewer: null });
		expect(await loadWith({})).toEqual({ viewer: null });
	});
});
