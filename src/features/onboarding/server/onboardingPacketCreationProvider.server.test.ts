import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { OnboardingPacketCreationInput } from '../contracts';
import { createSupabaseOnboardingPacketCreationPort } from './onboardingPacketCreationProvider.server';

function client(fetch: typeof globalThis.fetch) {
	return createClient('http://127.0.0.1:9', 'synthetic-offline-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			headers: { Authorization: 'Bearer synthetic-request-actor', Cookie: 'synthetic-session=ordinary-request' },
			fetch
		}
	});
}

const input: OnboardingPacketCreationInput = {
	personnelId: 'person-1',
	templateId: 'template-1',
	startedAt: '2026-03-15',
	steps: [
		{
			template_step_id: 'definition-1',
			step_name: 'Paperwork',
			step_type: 'paperwork',
			training_type_id: null,
			stages: ['Submitted', 'Reviewed', 'Filed'],
			sort_order: 7,
			completed: false
		}
	]
};

describe('Supabase Onboarding packet creation provider', () => {
	it('uses the passed ordinary client, sends only prepared fields, and returns actual saved identities/defaults', async () => {
		const port = createSupabaseOnboardingPacketCreationPort(
			client(async (request, init) => {
				const url = new URL(String(request));
				expect(url.origin).toBe('http://127.0.0.1:9');
				expect(url.pathname).toBe('/rest/v1/rpc/start_onboarding_packet');
				expect(init?.method).toBe('POST');
				const headers = new Headers(init?.headers);
				expect(headers.get('authorization')).toBe('Bearer synthetic-request-actor');
				expect(headers.get('apikey')).toBe('synthetic-offline-key');
				expect(headers.get('cookie')).toBe('synthetic-session=ordinary-request');
				expect(JSON.parse(String(init?.body))).toEqual({
					p_organization_id: 'org-a',
					p_personnel_id: 'person-1',
					p_template_id: 'template-1',
					p_started_at: '2026-03-15',
					p_steps: [
						{
							template_step_id: 'definition-1',
							step_name: 'Paperwork',
							step_type: 'paperwork',
							training_type_id: null,
							stages: ['Submitted', 'Reviewed', 'Filed'],
							sort_order: 7,
							completed: false
						}
					]
				});
				return Response.json({
					onboarding: {
						id: 'saved-parent',
						personnel_id: 'person-1',
						template_id: 'template-1',
						status: 'in_progress',
						started_at: '2026-03-15',
						completed_at: null,
						cancelled_at: null
					},
					steps: [
						{
							id: 'saved-progress',
							onboarding_id: 'saved-parent',
							template_step_id: 'definition-1',
							step_name: 'Paperwork',
							step_type: 'paperwork',
							training_type_id: null,
							stages: ['Submitted', 'Reviewed', 'Filed'],
							sort_order: 7,
							completed: false,
							current_stage: 'Submitted',
							notes: [],
							active: true
						}
					]
				});
			})
		);
		const result = await port.create('org-a', {
			...input,
			steps: [
				{
					...input.steps[0],
					id: 'caller-id',
					onboarding_id: 'caller-parent',
					organization_id: 'foreign-org',
					current_stage: 'Filed',
					notes: ['caller-note'],
					active: false
				} as OnboardingPacketCreationInput['steps'][number]
			]
		});
		expect(result.onboarding).toEqual({
			id: 'saved-parent',
			personnel_id: 'person-1',
			template_id: 'template-1',
			status: 'in_progress',
			started_at: '2026-03-15',
			completed_at: null,
			cancelled_at: null
		});
		expect(result.steps).toEqual([
			{
				id: 'saved-progress',
				onboarding_id: 'saved-parent',
				template_step_id: 'definition-1',
				step_name: 'Paperwork',
				step_type: 'paperwork',
				training_type_id: null,
				stages: ['Submitted', 'Reviewed', 'Filed'],
				sort_order: 7,
				completed: false,
				current_stage: 'Submitted',
				notes: [],
				active: true
			}
		]);
	});

	it('sends a configured empty checklist and preserves its successful empty saved steps', async () => {
		const port = createSupabaseOnboardingPacketCreationPort(
			client(async (_, init) => {
				expect(JSON.parse(String(init?.body)).p_steps).toEqual([]);
				return Response.json({
					onboarding: {
						id: 'empty-parent',
						personnel_id: 'person-1',
						template_id: 'template-1',
						status: 'in_progress',
						started_at: '2026-03-15',
						completed_at: null,
						cancelled_at: null
					},
					steps: []
				});
			})
		);
		await expect(port.create('org-a', { ...input, steps: [] })).resolves.toMatchObject({
			onboarding: { id: 'empty-parent' },
			steps: []
		});
	});

	it.each([
		{ code: '42501', status: 403 },
		{ code: 'P0002', status: 404 }
	])('maps $code to the public $status outcome', async ({ code, status }) => {
		const port = createSupabaseOnboardingPacketCreationPort(
			client(async () =>
				Response.json({ code, message: 'Creation rejected', details: null, hint: null }, { status: 400 })
			)
		);
		await expect(port.create('org-a', input)).rejects.toMatchObject({ status, message: 'Creation rejected' });
	});

	it('maps only the named active-parent uniqueness violation to a retry conflict', async () => {
		const port = createSupabaseOnboardingPacketCreationPort(
			client(async () =>
				Response.json(
					{
						code: '23505',
						message: 'duplicate key value violates unique constraint "personnel_onboardings_active_idx"',
						details: null,
						hint: null
					},
					{ status: 409 }
				)
			)
		);
		await expect(port.create('org-a', input)).rejects.toMatchObject({
			status: 409,
			message: 'Soldier already has an active onboarding'
		});
	});

	it.each([
		{ code: '23505', message: 'duplicate key value violates unique constraint "another_key"' },
		{
			code: '23505',
			message: 'duplicate key value violates unique constraint "personnel_onboardings_active_idx_extra"'
		},
		{ code: 'P0001', message: 'Creation rejected' },
		{ code: '22023', message: 'Malformed snapshots' },
		{ code: 'PGRST202', message: 'Creation RPC unavailable' },
		{ code: 'XX000', message: 'Storage failure' }
	])('keeps $code / $message as an unexpected server failure', async ({ code, message }) => {
		const port = createSupabaseOnboardingPacketCreationPort(
			client(async () => Response.json({ code, message, details: null, hint: null }, { status: 400 }))
		);
		const error = await port.create('org-a', input).catch((error: unknown) => error);
		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({ message });
		expect(error).not.toHaveProperty('status');
	});

	it.each([
		null,
		{},
		[],
		{ onboarding: null, steps: [] },
		{ onboarding: { id: 'parent' } },
		{ onboarding: { id: '' }, steps: [] }
	])('rejects an empty or incomplete success %j without fabricating a saved packet', async (data) => {
		const port = createSupabaseOnboardingPacketCreationPort(client(async () => Response.json(data)));
		await expect(port.create('org-a', input)).rejects.toThrow('Onboarding packet creation returned no saved packet');
	});
});
