import { describe, expect, it, vi } from 'vitest';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createTestContext } from './ratingSchemePersistence.test-support.server';
import { createApprovedRatingSchemeDeletionPort } from './approvedRatingSchemeDeletion.server';

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

function provider(overrides: Record<string, unknown> = {}) {
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
	ctx.rawStore.seed('rating_scheme_entries', [
		{ id: 'entry-1', organization_id: 'org-1' },
		{ id: 'entry-2', organization_id: 'org-1' },
		{ id: 'entry-1', organization_id: 'org-2' }
	]);
	const deleteEntry = vi.spyOn(ctx.rawStore, 'deleteWhere');
	const requirePending = vi.fn(async (orgId: string, requestId: string, resourceType: string, resourceId: string) => {
		const request = await ctx.rawStore.findOne('deletion_requests', orgId, {
			id: requestId,
			status: 'pending',
			resource_type: resourceType,
			resource_id: resourceId
		});
		if (!request) throw Object.assign(new Error('Pending deletion request not found'), { status: 404 });
	});
	return {
		ctx,
		deleteEntry,
		requirePending,
		port: createApprovedRatingSchemeDeletionPort(ctx.ratingScheme, requirePending)
	};
}

describe('approved Rating Scheme deletion', () => {
	it('lets the Organization reviewer without a Rating lane delete only the bound entry and safely retry', async () => {
		const { ctx, port, requirePending } = provider();
		await port.deleteApprovedRatingSchemeEntry(reviewer(), 'request-1', 'entry-1');
		await port.deleteApprovedRatingSchemeEntry(reviewer(), 'request-1', 'entry-1');
		expect(requirePending).toHaveBeenCalledTimes(2);
		expect(requirePending).toHaveBeenLastCalledWith('org-1', 'request-1', 'rating_scheme_entry', 'entry-1');
		await expect(ctx.rawStore.findMany('rating_scheme_entries', 'org-1')).resolves.toEqual([
			{ id: 'entry-2', organization_id: 'org-1' }
		]);
		await expect(ctx.rawStore.findMany('rating_scheme_entries', 'org-2')).resolves.toEqual([
			{ id: 'entry-1', organization_id: 'org-2' }
		]);
		await expect(ctx.rawStore.findOne('deletion_requests', 'org-1', { id: 'request-1' })).resolves.toMatchObject({
			status: 'pending'
		});
	});
	it('denies an ordinary member before reading or deleting despite Rating configure', async () => {
		const { ctx, port, deleteEntry, requirePending } = provider();
		const findRequest = vi.spyOn(ctx.rawStore, 'findOne');
		await expect(
			port.deleteApprovedRatingSchemeEntry(reviewer('member'), 'request-1', 'entry-1')
		).rejects.toMatchObject({ status: 403 });
		expect(findRequest).not.toHaveBeenCalled();
		expect(requirePending).not.toHaveBeenCalled();
		expect(deleteEntry).not.toHaveBeenCalled();
	});
	it.each([
		['another Organization', { organization_id: 'org-2' }],
		['completed review', { status: 'approved' }],
		['denied review', { status: 'denied' }],
		['another kind', { resource_type: 'personnel_training' }],
		['another target', { resource_id: 'entry-2' }],
		['another request', { id: 'request-2' }]
	])('rejects %s before deletion', async (_reason, overrides) => {
		const { ctx, port, deleteEntry } = provider(overrides);
		await expect(port.deleteApprovedRatingSchemeEntry(reviewer(), 'request-1', 'entry-1')).rejects.toMatchObject({
			status: 404
		});
		expect(deleteEntry).not.toHaveBeenCalled();
		await expect(ctx.rawStore.findMany('rating_scheme_entries', 'org-1')).resolves.toEqual([
			{ id: 'entry-1', organization_id: 'org-1' },
			{ id: 'entry-2', organization_id: 'org-1' }
		]);
	});
	it('does not delete when authenticated pending-request lookup fails', async () => {
		const { ctx, port, deleteEntry } = provider();
		vi.spyOn(ctx.rawStore, 'findOne').mockRejectedValue(new Error('request unavailable'));
		await expect(port.deleteApprovedRatingSchemeEntry(reviewer(), 'request-1', 'entry-1')).rejects.toThrow(
			'request unavailable'
		);
		expect(deleteEntry).not.toHaveBeenCalled();
	});
	it('propagates authenticated deletion failure, preserves the target, and allows retry', async () => {
		const { ctx, port, deleteEntry } = provider();
		deleteEntry.mockRejectedValueOnce(new Error('delete unavailable'));
		await expect(port.deleteApprovedRatingSchemeEntry(reviewer(), 'request-1', 'entry-1')).rejects.toThrow(
			'delete unavailable'
		);
		await expect(ctx.rawStore.findOne('rating_scheme_entries', 'org-1', { id: 'entry-1' })).resolves.not.toBeNull();
		await port.deleteApprovedRatingSchemeEntry(reviewer(), 'request-1', 'entry-1');
		await expect(ctx.rawStore.findOne('rating_scheme_entries', 'org-1', { id: 'entry-1' })).resolves.toBeNull();
	});
});
