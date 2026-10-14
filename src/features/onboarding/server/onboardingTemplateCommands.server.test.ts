import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
	createSupabaseOnboardingCatalogPersistence,
	TEMPLATE_CHANGE_NOT_SAVED_MESSAGE,
	TEMPLATE_CHANGE_UNCONFIRMED_MESSAGE
} from './onboardingCatalogPersistence.server';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const SOURCE = '00000000-0000-4000-8000-000000000301';
const COPY = '00000000-0000-4000-8000-000000000302';
const REQUEST = '00000000-0000-4000-8000-000000009001';
const TIME = '2026-10-13T12:00:00.123456+00:00';

const templateRow = { id: COPY, organization_id: ORG, name: 'Arrival Copy', description: 'Kept', created_at: TIME };
function stepRow(id: string, sortOrder: number) {
	return {
		id,
		organization_id: ORG,
		template_id: COPY,
		name: `Step ${sortOrder}`,
		description: null,
		step_type: 'paperwork',
		training_type_id: null,
		stages: ['Draft', 'Filed'],
		sort_order: sortOrder,
		created_at: TIME
	};
}
function savedStep(id: string, sortOrder: number) {
	return {
		id,
		organization_id: ORG,
		templateId: COPY,
		name: `Step ${sortOrder}`,
		description: null,
		stepType: 'paperwork',
		trainingTypeId: null,
		stages: ['Draft', 'Filed'],
		sortOrder,
		created_at: TIME
	};
}

function templateRpc(reply: () => Response | Promise<Response>) {
	const calls: Array<{ path: string; body: unknown }> = [];
	const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				calls.push({ path: new URL(request.url).pathname, body: await request.json() });
				return reply();
			}
		}
	});
	return { calls, catalog: createSupabaseOnboardingCatalogPersistence(client, ORG) };
}

function databaseError(code: string, message: string, status = 400) {
	return () => Response.json({ code, message, details: null, hint: null }, { status });
}

describe('Onboarding template commands', () => {
	it('duplicates in one call bound to the Organization and request, returning the saved copy', async () => {
		const { calls, catalog } = templateRpc(() =>
			Response.json({ template: templateRow, steps: [stepRow('s-0', 0), stepRow('s-1', 1)], created: false })
		);
		await expect(catalog.duplicateTemplate(SOURCE, REQUEST)).resolves.toEqual({
			template: { id: COPY, orgId: ORG, name: 'Arrival Copy', description: 'Kept', createdAt: TIME },
			steps: [savedStep('s-0', 0), savedStep('s-1', 1)],
			created: false
		});
		expect(calls).toEqual([
			{
				path: '/rest/v1/rpc/duplicate_onboarding_template',
				body: { p_organization_id: ORG, p_source_template_id: SOURCE, p_request_id: REQUEST }
			}
		]);
	});

	it('reorders in one call and returns the saved steps', async () => {
		const { calls, catalog } = templateRpc(() => Response.json([stepRow('s-1', 0), stepRow('s-0', 1)]));
		await expect(catalog.reorderSteps(COPY, ['s-1', 's-0'])).resolves.toEqual([
			savedStep('s-1', 0),
			savedStep('s-0', 1)
		]);
		expect(calls).toEqual([
			{
				path: '/rest/v1/rpc/reorder_onboarding_template_steps',
				body: { p_organization_id: ORG, p_template_id: COPY, p_step_ids: ['s-1', 's-0'] }
			}
		]);
	});

	it('deletes in one call and reports whether a template was there', async () => {
		for (const deleted of [true, false]) {
			const { calls, catalog } = templateRpc(() => Response.json(deleted));
			await expect(catalog.deleteTemplate(COPY)).resolves.toBe(deleted);
			expect(calls).toEqual([
				{ path: '/rest/v1/rpc/delete_onboarding_template', body: { p_organization_id: ORG, p_template_id: COPY } }
			]);
		}
	});

	it.each([
		['42501', 'Onboarding configuration is not allowed', 403],
		['P0002', 'Onboarding template not found', 404],
		['OTR01', 'Step order does not match the selected onboarding template', 409],
		['OTD01', 'This duplicate request was made for another template', 409],
		['OTD02', 'The copy from this request was deleted', 409],
		['22023', 'Duplicating a template needs the template and a request id', 400],
		['22P02', 'invalid input syntax for type uuid: "x"', 400]
	])('answers database %s with %s as a %i', async (code, message, status) => {
		const { catalog } = templateRpc(databaseError(code, message));
		await expect(catalog.duplicateTemplate(SOURCE, REQUEST)).rejects.toMatchObject({ status, message });
	});

	it.each(['40P01', '40001', '55P03'])('says a rolled back %s was not saved and can be retried', async (code) => {
		const { catalog } = templateRpc(databaseError(code, 'deadlock detected', 500));
		await expect(catalog.reorderSteps(COPY, [])).rejects.toMatchObject({
			status: 503,
			message: TEMPLATE_CHANGE_NOT_SAVED_MESSAGE,
			publicMessage: true
		});
	});

	it('says a lost response is unconfirmed and safe to repeat', async () => {
		const { catalog } = templateRpc(() => Promise.reject(new TypeError('fetch failed')));
		await expect(catalog.deleteTemplate(COPY)).rejects.toMatchObject({
			status: 503,
			message: TEMPLATE_CHANGE_UNCONFIRMED_MESSAGE,
			publicMessage: true
		});
		const gateway = templateRpc(() => new Response('<html>Bad gateway</html>', { status: 502 }));
		await expect(gateway.catalog.duplicateTemplate(SOURCE, REQUEST)).rejects.toMatchObject({
			status: 503,
			message: TEMPLATE_CHANGE_UNCONFIRMED_MESSAGE
		});
	});

	it('treats any other database failure and an unexpected result as internal errors', async () => {
		const { catalog } = templateRpc(databaseError('23514', 'synthetic check failure'));
		await expect(catalog.duplicateTemplate(SOURCE, REQUEST)).rejects.toThrow('synthetic check failure');
		await expect(catalog.duplicateTemplate(SOURCE, REQUEST)).rejects.not.toHaveProperty('status');
		const shapeless = templateRpc(() => Response.json({ template: templateRow, created: true }));
		await expect(shapeless.catalog.duplicateTemplate(SOURCE, REQUEST)).rejects.toThrow(
			'duplicate_onboarding_template returned an unexpected result'
		);
	});
});
