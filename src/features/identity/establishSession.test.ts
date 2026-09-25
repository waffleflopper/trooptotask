import { afterEach, expect, it, vi } from 'vitest';
import { establishSession, readSessionTokens } from './establishSession';

afterEach(() => vi.unstubAllGlobals());
it.each([
	'',
	'#access_token=a',
	'#access_token=a&refresh_token=r&access_token=b',
	'#access_token=a&refresh_token=r&refresh_token=s',
	'#access_token=a%20b&refresh_token=r'
])('rejects ambiguous or incomplete credentials in %s', (hash) => {
	expect(readSessionTokens(hash)).toBeNull();
});
it('reads token bytes without treating plus as a space when correctly encoded', () => {
	expect(readSessionTokens('#access_token=a%2Bb&refresh_token=c%2Fd')).toEqual({
		accessToken: 'a+b',
		refreshToken: 'c/d'
	});
});
it.each([null, {}, { ok: false }, { ok: true, error: 'unavailable' }])(
	'does not advance on malformed success %j',
	async (body) => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
		expect(await establishSession({ accessToken: 'a', refreshToken: 'r' }, 'invite')).toBe('unavailable');
	}
);
it.each([400, 401])('classifies rejected credentials as invalid (%s)', async (status) => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
	expect(await establishSession({ accessToken: 'a', refreshToken: 'r' }, 'recovery')).toBe('invalid');
});
