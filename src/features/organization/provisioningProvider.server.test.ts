import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseOrganizationCreationPort } from './provisioningProvider.server';
import type { OrganizationDefaults } from './provisioning.server';

const defaults: OrganizationDefaults = {
	groups: [{ name: 'Leadership', sort_order: 0 }],
	status_types: [{ name: 'Leave', color: '#48bb78', text_color: '#ffffff', sort_order: 0 }],
	assignment_types: [{ name: 'Staff Duty', short_name: 'SD', assign_to: 'personnel', color: '#dc2626', sort_order: 0 }],
	special_days: [{ date: '2026-01-01', name: "New Year's Day", type: 'federal-holiday' }],
	rank_catalog: [
		{
			code: 'SGT',
			label: 'Sergeant',
			service: 'army',
			category: 'enlisted',
			pay_grade: 'E-5',
			state: 'active',
			source: 'built-in',
			sort_order: 0
		}
	]
};
const requestId = '6f0c6c9e-7a53-4d1b-9a4e-2f3f0f9f0a11';

function httpPort(handle: (request: Request) => Promise<Response>) {
	const supabase = createClient('http://127.0.0.1:9', 'synthetic-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch: (input, init) => handle(new Request(input, init)) }
	});
	return createSupabaseOrganizationCreationPort({ supabase } as never, defaults);
}

describe('Organization creation provider boundary', () => {
	it('sends one authenticated create_organization call carrying the name, request id and defaults', async () => {
		const requests: Array<{ path: string; method: string; body: unknown }> = [];
		const port = httpPort(async (request) => {
			requests.push({ path: new URL(request.url).pathname, method: request.method, body: await request.json() });
			return Response.json('org-created');
		});

		expect(await port.createOrganization({ name: 'Alpha Company', requestId })).toEqual({ orgId: 'org-created' });
		expect(requests).toEqual([
			{
				path: '/rest/v1/rpc/create_organization',
				method: 'POST',
				body: { p_name: 'Alpha Company', p_request_id: requestId, p_defaults: defaults }
			}
		]);
	});

	it.each([
		[
			'provider denial',
			() => Response.json({ code: '42501', message: 'Owner insert denied' }, { status: 403 }),
			'Owner insert denied'
		],
		['unacknowledged result', () => Response.json(null), 'The provider did not return an Organization id']
	] as const)('reports %s as a failure without an Organization id', async (_, respond, failure) => {
		const port = httpPort(async () => respond());
		expect(await port.createOrganization({ name: 'Alpha Company', requestId })).toEqual({ failure });
	});

	it('reports a thrown transport error as a failure', async () => {
		const port = httpPort(async () => {
			throw new Error('socket closed');
		});
		const result = await port.createOrganization({ name: 'Alpha Company', requestId });
		expect(result).toEqual({ failure: expect.stringContaining('socket closed') });
	});
});
