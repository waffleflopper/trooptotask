import { describe, expect, it } from 'vitest';
import {
	getPreferredOrganizationUrlSegment,
	resolveOrganizationRouteIdentity,
	validateOrganizationUrlSlug
} from '$lib/server/core/useCases/organizationUrlSlug';

describe('organization URL slug helpers', () => {
	it('normalizes valid slugs to lowercase', () => {
		expect(validateOrganizationUrlSlug('  1-11-BDE  ')).toBe('1-11-bde');
	});

	it('rejects unsafe or reserved slugs with useful status errors', () => {
		expect(() => validateOrganizationUrlSlug('ab')).toThrow('at least 3 characters');
		expect(() => validateOrganizationUrlSlug('bad_slug')).toThrow('letters, numbers, and single hyphens');
		expect(() => validateOrganizationUrlSlug('new')).toThrow('reserved');
		expect(() => validateOrganizationUrlSlug('11111111-1111-4111-8111-111111111111')).toThrow('cannot be a UUID');
	});

	it('prefers the slug for generated organization links', () => {
		expect(getPreferredOrganizationUrlSegment({ id: 'org-1', urlSlug: '1-11-bde' })).toBe('1-11-bde');
		expect(getPreferredOrganizationUrlSegment({ id: 'org-1', urlSlug: null })).toBe('org-1');
	});

	it('resolves a route slug to the canonical organization id', async () => {
		const calls: Array<{ method: string; args: unknown[] }> = [];
		const query = {
			select: (...args: unknown[]) => {
				calls.push({ method: 'select', args });
				return query;
			},
			eq: (...args: unknown[]) => {
				calls.push({ method: 'eq', args });
				return query;
			},
			maybeSingle: async () => ({
				data: {
					id: '11111111-1111-4111-8111-111111111111',
					name: 'Test Unit',
					url_slug: '1-11-bde',
					suspended_at: null
				},
				error: null
			})
		};
		const supabase = { from: () => query };

		const result = await resolveOrganizationRouteIdentity(supabase as never, '1-11-bde');

		expect(result).toMatchObject({
			id: '11111111-1111-4111-8111-111111111111',
			urlSlug: '1-11-bde'
		});
		expect(calls).toContainEqual({ method: 'eq', args: ['url_slug', '1-11-bde'] });
	});
});
