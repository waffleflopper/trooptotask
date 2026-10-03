import { describe, expect, it } from 'vitest';
import { createWriteWithNotificationsPortsContext } from '$lib/server/adapters/inMemory';
import { createDeletionRequestTestStore } from './testing.server';
import { savedRequest } from './deletionRequestTestProvider.server';
import {
	listDeletionRequests,
	readPendingDeletionRequestSummary,
	requirePendingDeletionRequest,
	listDeletionRequestExportRows
} from './deletionRequestReads.server';

function fixture(role: 'admin' | 'owner' | 'member' = 'member') {
	const ctx = createWriteWithNotificationsPortsContext({
		auth: {
			role,
			userId: 'requester-a',
			orgId: 'org-a',
			capabilityMap: {
				personnel: 'none',
				training: 'none',
				ratingScheme: 'none',
				calendar: 'none',
				criticalTasks: 'none',
				onboarding: 'none'
			}
		}
	});
	const rows = [
		savedRequest('own'),
		savedRequest('own-old', { created_at: '2026-09-01T01:02:03.123456Z' }),
		savedRequest('peer', { requested_by: 'peer', created_at: '2026-08-01T10:00:00Z' }),
		savedRequest('denied', {
			status: 'denied',
			reviewed_by: 'reviewer',
			reviewed_at: '2026-10-01T12:00:00Z',
			denial_reason: 'Saved reason'
		}),
		savedRequest('approved', { status: 'approved' }),
		savedRequest('cancelled', { status: 'cancelled' }),
		savedRequest('foreign', { organization_id: 'org-b' })
	];
	ctx.store.seed(
		'deletion_requests',
		rows.map((row) => ({ ...row }))
	);
	return { ...ctx, store: createDeletionRequestTestStore(ctx.rawStore!), rows, backing: ctx.rawStore! };
}

describe('owned list and pending summary', () => {
	it('limits ordinary identity to own rows/status and excludes terminal/foreign rows from pending summary', async () => {
		const ctx = fixture();
		expect((await listDeletionRequests(ctx)).map(({ id }) => id).sort()).toEqual([
			'approved',
			'cancelled',
			'denied',
			'own',
			'own-old'
		]);
		expect(await listDeletionRequests(ctx, { status: 'cancelled' })).toEqual([ctx.rows[5]]);
		expect(await listDeletionRequests(ctx, { status: 'unknown-status' })).toEqual([]);
		expect(await readPendingDeletionRequestSummary(ctx)).toEqual({
			count: 2,
			oldestCreatedAt: '2026-09-01T01:02:03.123456Z'
		});
	});
	it.each(['admin', 'owner'] as const)(
		'lists peer history and pending oldest for %s without source configure',
		async (role) => {
			const ctx = fixture(role);
			expect((await listDeletionRequests(ctx)).map(({ id }) => id).sort()).toEqual([
				'approved',
				'cancelled',
				'denied',
				'own',
				'own-old',
				'peer'
			]);
			expect(await readPendingDeletionRequestSummary(ctx)).toEqual({
				count: 3,
				oldestCreatedAt: '2026-08-01T10:00:00Z'
			});
		}
	);
	it('rejects unauthenticated reads before returning data and preserves all saved history for admitted export', async () => {
		const ctx = fixture();
		await expect(listDeletionRequests({ ...ctx, auth: { ...ctx.auth, userId: '' } })).rejects.toMatchObject({
			status: 401
		});
		expect(await listDeletionRequestExportRows(ctx.store, 'org-a')).toEqual(ctx.rows.slice(0, 6));
	});
});

describe('fresh exact-binding pending guard', () => {
	it('checks every tuple field afresh and rejects terminal/foreign/missing targets', async () => {
		const ctx = fixture();
		await expect(
			requirePendingDeletionRequest(ctx.store, 'org-a', 'own', 'training_type', 'type-own')
		).resolves.toBeUndefined();
		for (const [org, id, type, resource] of [
			['org-b', 'own', 'training_type', 'type-own'],
			['org-a', 'own', 'personnel', 'type-own'],
			['org-a', 'own', 'training_type', 'wrong'],
			['org-a', 'denied', 'training_type', 'type-denied'],
			['org-a', 'missing', 'training_type', 'missing']
		] as const)
			await expect(requirePendingDeletionRequest(ctx.store, org, id, type, resource)).rejects.toMatchObject({
				status: 404
			});
		await ctx.backing.update('deletion_requests', 'org-a', 'own', { status: 'cancelled' });
		await expect(
			requirePendingDeletionRequest(ctx.store, 'org-a', 'own', 'training_type', 'type-own')
		).rejects.toMatchObject({ status: 404 });
	});
});
