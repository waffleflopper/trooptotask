import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { requireActiveOrganization } from './admission.server';
import { resolveOrganizationRouteIdentity } from './routeIdentity.server';

const ORG = '11111111-1111-4111-8111-111111111111';

function fixture() {
	let reads = 0;
	let suspendedAt: string | null = null;
	const supabase = createClient('http://organization.invalid', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async () => {
				reads += 1;
				return Response.json({
					id: ORG,
					name: 'Alpha',
					url_slug: 'alpha',
					suspended_at: suspendedAt,
					disabled_features: ['training']
				});
			}
		}
	});
	return {
		supabase,
		readCount: () => reads,
		suspend: () => {
			suspendedAt = '2026-01-01T00:00:00Z';
		}
	};
}

describe('request-local Organization identity', () => {
	it.each(['identity-first', 'admission-first'])(
		'shares one row across serial slug and id consumers, %s',
		async (order) => {
			const provider = fixture();
			const request = { supabase: provider.supabase };
			if (order === 'identity-first') {
				await resolveOrganizationRouteIdentity(request, 'alpha');
				await requireActiveOrganization(request, ORG);
			} else {
				await requireActiveOrganization(request, 'alpha');
				await resolveOrganizationRouteIdentity(request, ORG);
			}
			expect(await resolveOrganizationRouteIdentity(request, 'alpha')).toEqual({
				id: ORG,
				name: 'Alpha',
				urlSlug: 'alpha',
				suspendedAt: null,
				disabledFeatures: ['training']
			});
			expect(await requireActiveOrganization(request, ORG)).toEqual({ id: ORG, disabledFeatures: ['training'] });
			expect(provider.readCount()).toBe(1);
		}
	);
	it('shares an in-flight read and observes fresh suspension on the next request', async () => {
		const provider = fixture();
		const request = { supabase: provider.supabase };
		const [identity, admission] = await Promise.all([
			resolveOrganizationRouteIdentity(request, 'alpha'),
			requireActiveOrganization(request, 'alpha')
		]);
		expect(identity).toMatchObject({ id: ORG, name: 'Alpha', suspendedAt: null });
		expect(admission).toEqual({ id: ORG, disabledFeatures: ['training'] });
		expect(provider.readCount()).toBe(1);
		provider.suspend();
		await expect(requireActiveOrganization({ supabase: provider.supabase }, 'alpha')).rejects.toMatchObject({
			status: 403,
			body: { message: 'Organization is suspended' }
		});
		expect(provider.readCount()).toBe(2);
	});
});
