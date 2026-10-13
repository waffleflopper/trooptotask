import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$features/rating-scheme/server/ratingSchemePersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _reviewPostConfig } from './+server';
import { createDeletionRequestTestStore } from '$features/deletion-requests/testing.server';
import type { DeletionRequestResourceType } from '$features/deletion-requests/contracts';
import { requirePendingDeletionRequest, type ApprovedDeletionEffects } from '$features/deletion-requests/index.server';

function configFor(ctx: ReturnType<typeof createTestContext>, effects: Partial<ApprovedDeletionEffects> = {}) {
	const store = createDeletionRequestTestStore(ctx.store);
	const unexpected = async () => {
		throw new Error('Unexpected source effect');
	};
	return _reviewPostConfig(store, () => ({
		approvePersonnelArchive: unexpected,
		approveTrainingType: unexpected,
		approveTrainingRecord: unexpected,
		approveRatingEntry: unexpected,
		approveCounseling: unexpected,
		...effects
	}));
}

// The route fake acknowledges the target and status together, like the database command.
function approveWith(
	ctx: ReturnType<typeof createTestContext>,
	table: string,
	resourceType: DeletionRequestResourceType
) {
	const store = createDeletionRequestTestStore(ctx.store);
	return async (requestId: string, id: string, reviewedAt: string) => {
		await requirePendingDeletionRequest(store, ctx.auth.orgId, requestId, resourceType, id);
		await ctx.rawStore.deleteWhere(table, ctx.auth.orgId, { id });
		await store.completePendingReview(
			ctx.auth.orgId,
			requestId,
			{ resourceType, resourceId: id },
			{ status: 'approved', reviewedBy: ctx.auth.userId, reviewedAt, denialReason: null }
		);
	};
}

describe('POST /api/deletion-requests/review', () => {
	it('denies a Rating operator before the approval effect and leaves the pending request intact', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'operate'
				}
			}
		});
		ctx.rawStore.seed('deletion_requests', [
			{
				id: 'request',
				organization_id: ctx.auth.orgId,
				resource_type: 'rating_scheme_entry',
				resource_id: 'entry',
				status: 'pending'
			}
		]);
		const approveRatingEntry = vi.fn();
		const config = configFor(ctx, { approveRatingEntry });
		await expect(
			handleUseCaseRequest(config, ctx, { id: 'request', action: 'approve' }, () => ctx)
		).rejects.toMatchObject({
			status: 403
		});
		expect(approveRatingEntry).not.toHaveBeenCalled();
		await expect(ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'request' })).resolves.toMatchObject({
			status: 'pending'
		});
	});
	it('routes completion approval through Training and removes only its bound target before approval', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.rawStore.seed('deletion_requests', [
			{
				id: 'request-1',
				organization_id: ctx.auth.orgId,
				resource_type: 'personnel_training',
				resource_id: 'completion-1',
				status: 'pending'
			}
		]);
		ctx.rawStore.seed('personnel_trainings', [
			{ id: 'completion-1', organization_id: ctx.auth.orgId },
			{ id: 'completion-2', organization_id: ctx.auth.orgId }
		]);
		await expect(
			handleUseCaseRequest(
				configFor(ctx, { approveTrainingRecord: approveWith(ctx, 'personnel_trainings', 'personnel_training') }),
				ctx,
				{ id: 'request-1', action: 'approve' },
				() => ctx
			)
		).resolves.toEqual({ success: true, fileCleanup: 'complete' });
		await expect(ctx.rawStore.findMany('personnel_trainings', ctx.auth.orgId)).resolves.toEqual([
			{ id: 'completion-2', organization_id: ctx.auth.orgId }
		]);
		await expect(ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'request-1' })).resolves.toMatchObject(
			{ status: 'approved' }
		);
	});
	it('approves same-Organization counseling deletion for an admin with no Personnel lane', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.rawStore.seed('deletion_requests', [
			{
				id: 'request-1',
				organization_id: ctx.auth.orgId,
				resource_type: 'counseling_record',
				resource_id: 'record-1',
				status: 'pending'
			}
		]);
		ctx.rawStore.seed('counseling_records', [
			{ id: 'record-1', organization_id: ctx.auth.orgId, personnel_id: 'person-1' },
			{ id: 'record-1', organization_id: 'other-org', personnel_id: 'person-2' }
		]);

		const deleteCounseling = approveWith(ctx, 'counseling_records', 'counseling_record');
		const approveCounseling = async (requestId: string, id: string, reviewedAt: string) => {
			await deleteCounseling(requestId, id, reviewedAt);
			return { fileCleanup: 'pending' as const };
		};
		await expect(
			handleUseCaseRequest(
				configFor(ctx, { approveCounseling }),
				ctx,
				{ id: 'request-1', action: 'approve' },
				() => ctx
			)
		).resolves.toEqual({
			success: true,
			fileCleanup: 'pending'
		});
		expect(await ctx.rawStore.findOne('counseling_records', ctx.auth.orgId, { id: 'record-1' })).toBeNull();
		expect(await ctx.rawStore.findOne('counseling_records', 'other-org', { id: 'record-1' })).not.toBeNull();
		expect(await ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'request-1' })).toMatchObject({
			status: 'approved'
		});
	});

	it('routes an approved Training type deletion through Training without requiring Training configure', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.rawStore.seed('deletion_requests', [
			{
				id: 'request-1',
				organization_id: ctx.auth.orgId,
				resource_type: 'training_type',
				resource_id: 'type-1',
				status: 'pending'
			}
		]);
		ctx.rawStore.seed('training_types', [{ id: 'type-1', organization_id: ctx.auth.orgId, name: 'CPR' }]);
		const approveTrainingType = vi.fn(approveWith(ctx, 'training_types', 'training_type'));

		await expect(
			handleUseCaseRequest(
				configFor(ctx, { approveTrainingType }),
				ctx,
				{
					id: 'request-1',
					action: 'approve'
				},
				() => ctx
			)
		).resolves.toEqual({ success: true, fileCleanup: 'complete' });
		expect(approveTrainingType).toHaveBeenCalledWith('request-1', 'type-1', expect.any(String));
		expect(await ctx.rawStore.findOne('training_types', ctx.auth.orgId, { id: 'type-1' })).toBeNull();
		expect(await ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'request-1' })).toMatchObject({
			status: 'approved'
		});
	});

	it('denies a member before invoking the Training deletion effect', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'configure',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.rawStore.seed('deletion_requests', [
			{
				id: 'request-1',
				organization_id: ctx.auth.orgId,
				resource_type: 'training_type',
				resource_id: 'type-1',
				status: 'pending'
			}
		]);
		const approveTrainingType = vi.fn();

		await expect(
			handleUseCaseRequest(
				configFor(ctx, { approveTrainingType }),
				ctx,
				{
					id: 'request-1',
					action: 'approve'
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 403 });
		expect(approveTrainingType).not.toHaveBeenCalled();
		expect(ctx.auditPort.events.map((event) => event.action)).toEqual(['policy.denied']);
		expect(await ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'request-1' })).toMatchObject({
			status: 'pending'
		});
	});
});
