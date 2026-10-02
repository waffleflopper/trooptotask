import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseOnboardingInactiveStepRemovalPort } from './onboardingInactiveStepRemovalProvider.server';

function client(fetch: typeof globalThis.fetch) {
	return createClient('http://127.0.0.1:9', 'synthetic-offline-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { headers: { Authorization: 'Bearer synthetic-request-actor' }, fetch }
	});
}

describe('Supabase Onboarding inactive step removal', () => {
	it('deletes only the named Organization row while inactive and returns its affected identity', async () => {
		const port = createSupabaseOnboardingInactiveStepRemovalPort(
			client(async (input, init) => {
				const url = new URL(String(input));
				expect(url.pathname).toBe('/rest/v1/onboarding_step_progress');
				expect(init?.method).toBe('DELETE');
				expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-request-actor');
				expect(url.searchParams.get('organization_id')).toBe('eq.org-a');
				expect(url.searchParams.get('id')).toBe('eq.step-1');
				expect(url.searchParams.get('active')).toBe('eq.false');
				expect(url.searchParams.has('completed')).toBe(false);
				expect(url.searchParams.has('status')).toBe(false);
				expect(url.searchParams.get('select')).toBe('id');
				return Response.json([{ id: 'step-1' }]);
			})
		);

		await expect(port.remove('org-a', 'step-1')).resolves.toEqual({ id: 'step-1' });
	});

	it('returns no affected identity when the row no longer matches', async () => {
		const port = createSupabaseOnboardingInactiveStepRemovalPort(client(async () => Response.json([])));

		await expect(port.remove('org-a', 'step-1')).resolves.toBeNull();
	});

	it('maps a denied write to 403', async () => {
		const port = createSupabaseOnboardingInactiveStepRemovalPort(
			client(async () =>
				Response.json({ code: '42501', message: 'Write denied', details: null, hint: null }, { status: 403 })
			)
		);

		await expect(port.remove('org-a', 'step-1')).rejects.toMatchObject({ status: 403, message: 'Write denied' });
	});

	it.each([
		{ code: 'P0001', details: null },
		{ code: 'XX000', details: null },
		{ code: 'PGRST116', details: 'The result contains 0 rows' }
	])('propagates database error $code instead of reporting predicate loss', async ({ code, details }) => {
		const port = createSupabaseOnboardingInactiveStepRemovalPort(
			client(async () => Response.json({ code, message: 'Delete failed', details, hint: null }, { status: 500 }))
		);
		const error = await port.remove('org-a', 'step-1').catch((error: unknown) => error);

		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({ message: 'Delete failed' });
		expect(error).not.toHaveProperty('status');
	});

	it('rejects an unexpected multiple-row response instead of claiming success', async () => {
		const port = createSupabaseOnboardingInactiveStepRemovalPort(
			client(async () => Response.json([{ id: 'step-1' }, { id: 'step-2' }]))
		);

		await expect(port.remove('org-a', 'step-1')).rejects.toBeInstanceOf(Error);
	});

	it('propagates an unavailable transport', async () => {
		const port = createSupabaseOnboardingInactiveStepRemovalPort(
			client(async () => {
				throw new Error('Synthetic transport unavailable');
			})
		);

		await expect(port.remove('org-a', 'step-1')).rejects.toThrow('Synthetic transport unavailable');
	});
});
