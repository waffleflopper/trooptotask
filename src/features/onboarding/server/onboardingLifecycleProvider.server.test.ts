import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { OnboardingLifecycleTransition } from '../contracts';
import { createSupabaseOnboardingLifecycleTransitionPort } from './onboardingLifecycleProvider.server';

function client(fetch: typeof globalThis.fetch) {
	return createClient('http://127.0.0.1:9', 'synthetic-offline-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { headers: { Authorization: 'Bearer synthetic-request-actor' }, fetch }
	});
}

describe('Supabase Onboarding lifecycle transitions', () => {
	it.each([
		{
			command: { kind: 'cancel', at: '2026-10-01T12:00:00.123Z' } as OnboardingLifecycleTransition,
			expectedStatus: 'in_progress',
			patch: { status: 'cancelled', cancelled_at: '2026-10-01T12:00:00.123Z', completed_at: null },
			saved: { id: 'packet-1', status: 'cancelled', cancelled_at: '2026-10-01T12:00:00.123+00:00', completed_at: null }
		},
		{
			command: { kind: 'complete', at: '2026-10-01' } as OnboardingLifecycleTransition,
			expectedStatus: 'in_progress',
			patch: { status: 'completed', cancelled_at: null, completed_at: '2026-10-01' },
			saved: { id: 'packet-1', status: 'completed', cancelled_at: null, completed_at: '2026-10-01' }
		},
		{
			command: { kind: 'reopen' } as OnboardingLifecycleTransition,
			expectedStatus: 'cancelled',
			patch: { status: 'in_progress', cancelled_at: null, completed_at: null },
			saved: { id: 'packet-1', status: 'in_progress', cancelled_at: null, completed_at: null }
		}
	])(
		'qualifies $command.kind by the saved status and adopts the database dates',
		async ({ command, expectedStatus, patch, saved }) => {
			const port = createSupabaseOnboardingLifecycleTransitionPort(
				client(async (input, init) => {
					const url = new URL(String(input));
					expect(url.pathname).toBe('/rest/v1/personnel_onboardings');
					expect(init?.method).toBe('PATCH');
					expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-request-actor');
					expect(url.searchParams.get('organization_id')).toBe('eq.org-a');
					expect(url.searchParams.get('id')).toBe('eq.packet-1');
					expect(url.searchParams.get('status')).toBe(`eq.${expectedStatus}`);
					expect(new Set(url.searchParams.get('select')?.split(','))).toEqual(
						new Set(['id', 'status', 'cancelled_at', 'completed_at'])
					);
					expect(JSON.parse(String(init?.body))).toEqual(patch);
					return Response.json([saved]);
				})
			);

			await expect(port.transition('org-a', 'packet-1', command)).resolves.toEqual(saved);
		}
	);

	it('returns no saved row when the required status no longer matches', async () => {
		// The installed SDK's maybeSingle reads a list and maps an empty list to null.
		const port = createSupabaseOnboardingLifecycleTransitionPort(client(async () => Response.json([])));

		await expect(port.transition('org-a', 'packet-1', { kind: 'reopen' })).resolves.toBeNull();
	});

	it('maps a denied database write to 403', async () => {
		const port = createSupabaseOnboardingLifecycleTransitionPort(
			client(async () =>
				Response.json({ code: '42501', message: 'Write denied', details: null, hint: null }, { status: 403 })
			)
		);

		await expect(port.transition('org-a', 'packet-1', { kind: 'reopen' })).rejects.toMatchObject({
			status: 403,
			message: 'Write denied'
		});
	});

	it('maps a completion day the database refuses to 400', async () => {
		const port = createSupabaseOnboardingLifecycleTransitionPort(
			client(async () =>
				Response.json(
					{ code: '22023', message: 'Onboarding completion date must be the current day', details: null, hint: null },
					{ status: 400 }
				)
			)
		);

		await expect(port.transition('org-a', 'packet-1', { kind: 'complete', at: '2026-09-01' })).rejects.toMatchObject({
			status: 400,
			message: 'Onboarding completion date must be the current day'
		});
	});

	it.each([
		{ code: '23505', details: null },
		{ code: 'P0001', details: null },
		{ code: 'PGRST116', details: 'The result contains 2 rows' },
		{ code: 'PGRST116', details: 'The result contains 0 rows' }
	])('does not turn database failure $code into an expectation conflict', async ({ code, details }) => {
		const port = createSupabaseOnboardingLifecycleTransitionPort(
			client(async () => Response.json({ code, message: 'Database failure', details, hint: null }, { status: 400 }))
		);
		const error = await port.transition('org-a', 'packet-1', { kind: 'reopen' }).catch((error: unknown) => error);

		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({ message: 'Database failure' });
		expect(error).not.toHaveProperty('status');
	});

	it('propagates a transport failure', async () => {
		const port = createSupabaseOnboardingLifecycleTransitionPort(
			client(async () => {
				throw new Error('Synthetic transport unavailable');
			})
		);

		await expect(port.transition('org-a', 'packet-1', { kind: 'reopen' })).rejects.toThrow(
			'Synthetic transport unavailable'
		);
	});
});
