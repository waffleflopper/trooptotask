import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createTestAuthContext, createTestContext } from '$lib/server/adapters/inMemory';
import { createSupabaseApprovedRatingSchemeDeletionPort } from './approvedRatingSchemeDeletion.server';

function reviewer(role: 'admin' | 'member' = 'admin') {
	return createTestAuthContext({
		orgId: 'org-1',
		role,
		isPrivileged: role === 'admin',
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: role === 'admin' ? 'none' : 'configure'
		}
	});
}

function provider(overrides: Record<string, unknown> = {}, failDelete = false) {
	const ctx = createTestContext({ auth: { ...reviewer() } });
	ctx.rawStore.seed('deletion_requests', [
		{
			id: 'request-1',
			organization_id: 'org-1',
			status: 'pending',
			resource_type: 'rating_scheme_entry',
			resource_id: 'entry-1',
			...overrides
		}
	]);
	const entries = [
		{ id: 'entry-1', organization_id: 'org-1' },
		{ id: 'entry-2', organization_id: 'org-1' },
		{ id: 'entry-1', organization_id: 'org-2' }
	];
	const admin = createClient('http://127.0.0.1:9', 'synthetic-service-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (request.method !== 'DELETE' || !url.pathname.endsWith('/rating_scheme_entries'))
					throw new Error('Unexpected privileged operation');
				if (failDelete) return Response.json({ message: 'delete unavailable' }, { status: 403 });
				for (let i = entries.length - 1; i >= 0; i--)
					if (
						url.searchParams.get('id') === `eq.${entries[i].id}` &&
						url.searchParams.get('organization_id') === `eq.${entries[i].organization_id}`
					)
						entries.splice(i, 1);
				return new Response(null, { status: 204 });
			}
		}
	});
	const getAdminClient = vi.fn(() => admin);
	return {
		ctx,
		entries,
		getAdminClient,
		port: createSupabaseApprovedRatingSchemeDeletionPort(ctx.rawStore, getAdminClient)
	};
}

describe('approved Rating Scheme deletion', () => {
	it('lets the Organization reviewer without a Rating lane delete only the bound entry and safely retry', async () => {
		const { port, entries } = provider();
		await port.deleteApprovedRatingSchemeEntry(reviewer(), 'request-1', 'entry-1');
		await port.deleteApprovedRatingSchemeEntry(reviewer(), 'request-1', 'entry-1');
		expect(entries).toEqual([
			{ id: 'entry-2', organization_id: 'org-1' },
			{ id: 'entry-1', organization_id: 'org-2' }
		]);
	});
	it('denies an ordinary member before privileged access despite Rating configure', async () => {
		const { port, getAdminClient } = provider();
		await expect(
			port.deleteApprovedRatingSchemeEntry(reviewer('member'), 'request-1', 'entry-1')
		).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});
	it.each([
		['another Organization', { organization_id: 'org-2' }],
		['completed review', { status: 'approved' }],
		['another kind', { resource_type: 'personnel_training' }],
		['another target', { resource_id: 'entry-2' }],
		['another request', { id: 'request-2' }]
	])('rejects %s before privileged access', async (_reason, overrides) => {
		const { port, getAdminClient, entries } = provider(overrides);
		await expect(port.deleteApprovedRatingSchemeEntry(reviewer(), 'request-1', 'entry-1')).rejects.toMatchObject({
			status: 404
		});
		expect(getAdminClient).not.toHaveBeenCalled();
		expect(entries).toHaveLength(3);
	});
	it('does not acquire admin access when authenticated pending-request lookup fails', async () => {
		const { ctx, getAdminClient } = provider();
		vi.spyOn(ctx.rawStore, 'findOne').mockRejectedValue(new Error('request unavailable'));
		await expect(
			createSupabaseApprovedRatingSchemeDeletionPort(ctx.rawStore, getAdminClient).deleteApprovedRatingSchemeEntry(
				reviewer(),
				'request-1',
				'entry-1'
			)
		).rejects.toThrow('request unavailable');
		expect(getAdminClient).not.toHaveBeenCalled();
	});
	it('propagates deletion failure and preserves the target', async () => {
		const { port, entries } = provider({}, true);
		await expect(port.deleteApprovedRatingSchemeEntry(reviewer(), 'request-1', 'entry-1')).rejects.toThrow(
			'delete unavailable'
		);
		expect(entries).toHaveLength(3);
	});
});
