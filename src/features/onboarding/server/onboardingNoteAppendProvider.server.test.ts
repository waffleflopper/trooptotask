import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseOnboardingNoteAppendPort } from './onboardingNoteAppendProvider.server';

function client(fetch: typeof globalThis.fetch) {
	return createClient('http://127.0.0.1:9', 'synthetic-offline-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { headers: { Authorization: 'Bearer synthetic-request-actor' }, fetch }
	});
}

describe('Supabase Onboarding note append provider', () => {
	it.each(['Sent to clinic', '', '  \t '])(
		'appends the original text %j with the ordinary actor and retains authoritative notes',
		async (text) => {
			const saved = {
				id: 'step-1',
				notes: [
					{ text: 'Original note', timestamp: '2026-09-01T12:00:00.000Z', userId: 'original-author' },
					{ text: 'Another committed note', timestamp: '2026-10-01T12:00:00.001Z', userId: 'other-author' },
					{ text, timestamp: '2026-10-01T12:00:00.002Z', userId: 'request-actor' }
				]
			};
			const port = createSupabaseOnboardingNoteAppendPort(
				client(async (input, init) => {
					const url = new URL(String(input));
					expect(url.pathname).toBe('/rest/v1/rpc/append_onboarding_step_note');
					expect(init?.method).toBe('POST');
					expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-request-actor');
					expect(JSON.parse(String(init?.body))).toEqual({
						p_organization_id: 'org-1',
						p_step_id: 'step-1',
						p_text: text
					});
					return Response.json(saved);
				})
			);

			await expect(port.append('org-1', 'step-1', text)).resolves.toEqual(saved);
		}
	);

	it.each([
		{ code: '42501', status: 403 },
		{ code: 'P0002', status: 404 }
	])('maps SQLSTATE $code to the public $status error', async ({ code, status }) => {
		const port = createSupabaseOnboardingNoteAppendPort(
			client(async () =>
				Response.json({ code, message: 'Note append rejected', details: null, hint: null }, { status: 400 })
			)
		);

		await expect(port.append('org-1', 'step-1', 'Saved text')).rejects.toMatchObject({
			status,
			message: 'Note append rejected'
		});
	});

	it.each(['22023', 'P0001', '23514'])('leaves unexpected SQLSTATE %s as a genuine server error', async (code) => {
		const port = createSupabaseOnboardingNoteAppendPort(
			client(async () =>
				Response.json({ code, message: 'Database failure', details: null, hint: null }, { status: 400 })
			)
		);
		const error = await port.append('org-1', 'step-1', 'Saved text').catch((error: unknown) => error);

		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({ message: 'Database failure' });
		expect(error).not.toHaveProperty('status');
	});

	it('rejects a null success response instead of reporting a saved note', async () => {
		const port = createSupabaseOnboardingNoteAppendPort(client(async () => Response.json(null)));
		const error = await port.append('org-1', 'step-1', 'Saved text').catch((error: unknown) => error);

		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({ message: 'Onboarding note append returned no saved notes' });
		expect(error).not.toHaveProperty('status');
	});
});
