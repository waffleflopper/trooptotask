import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig, _reviewPostConfig } from './+server';

describe('POST /api/deletion-requests/review', () => {
	it('uses the default Rating port, retains pending status on resource failure and retries a failed status write', async () => {
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
				id: 'rating-request',
				organization_id: ctx.auth.orgId,
				resource_type: 'rating_scheme_entry',
				resource_id: 'entry-1',
				requested_by: 'requester',
				status: 'pending'
			}
		]);
		ctx.rawStore.seed('rating_scheme_entries', [
			{ id: 'entry-1', organization_id: ctx.auth.orgId },
			{ id: 'entry-2', organization_id: ctx.auth.orgId },
			{ id: 'entry-1', organization_id: 'other-org' }
		]);
		// Match the production store's idempotent DELETE using real in-memory rows.
		vi.spyOn(ctx.rawStore, 'delete')
			.mockImplementation((table, orgId, id) => ctx.rawStore.deleteWhere(table, orgId, { id }))
			.mockRejectedValueOnce(new Error('Rating deletion unavailable'));
		const config = _reviewPostConfig({ deleteApprovedTrainingType: vi.fn(), deleteApprovedTrainingRecord: vi.fn() });
		const approve = () => handleUseCaseRequest(config, ctx, { id: 'rating-request', action: 'approve' });
		await expect(approve()).rejects.toThrow('Rating deletion unavailable');
		await expect(
			ctx.rawStore.findOne('rating_scheme_entries', ctx.auth.orgId, { id: 'entry-1' })
		).resolves.not.toBeNull();
		await expect(
			ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'rating-request' })
		).resolves.toMatchObject({ status: 'pending' });
		expect(ctx.notificationPort.notifications).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
		const update = ctx.store.update;
		let statusFails = true;
		vi.spyOn(ctx.store, 'update').mockImplementation(async (table, orgId, id, data, select) => {
			if (table === 'deletion_requests' && statusFails) {
				statusFails = false;
				throw new Error('status write unavailable');
			}
			return update(table, orgId, id, data, select);
		});
		await expect(approve()).rejects.toThrow('status write unavailable');
		await expect(ctx.rawStore.findOne('rating_scheme_entries', ctx.auth.orgId, { id: 'entry-1' })).resolves.toBeNull();
		await expect(
			ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'rating-request' })
		).resolves.toMatchObject({ status: 'pending' });
		expect(ctx.notificationPort.notifications).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
		await expect(approve()).resolves.toEqual({ success: true });
		await expect(ctx.rawStore.findMany('rating_scheme_entries', ctx.auth.orgId)).resolves.toEqual([
			{ id: 'entry-2', organization_id: ctx.auth.orgId }
		]);
		await expect(ctx.rawStore.findOne('rating_scheme_entries', 'other-org', { id: 'entry-1' })).resolves.not.toBeNull();
		await expect(
			ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'rating-request' })
		).resolves.toMatchObject({ status: 'approved', reviewed_by: ctx.auth.userId, reviewed_at: expect.any(String) });
		expect(ctx.auditPort.events.map((event) => event.action)).toEqual(['deletion_request.approved']);
		expect(ctx.notificationPort.notifications).toHaveLength(1);
	});

	it('retains the evaluation and denial when another reviewer denies before the owner pending recheck', async () => {
		const ctx = createTestContext({ auth: { role: 'admin', isPrivileged: true } });
		ctx.rawStore.seed('deletion_requests', [
			{
				id: 'rating-request',
				organization_id: ctx.auth.orgId,
				resource_type: 'rating_scheme_entry',
				resource_id: 'entry-1',
				status: 'pending'
			}
		]);
		ctx.rawStore.seed('rating_scheme_entries', [{ id: 'entry-1', organization_id: ctx.auth.orgId }]);
		const findOne = ctx.rawStore.findOne;
		let denied = false;
		vi.spyOn(ctx.rawStore, 'findOne').mockImplementation(async (table, orgId, filters, select) => {
			const row = await findOne(table, orgId, filters, select);
			if (table === 'deletion_requests' && row && !denied) {
				denied = true;
				await ctx.rawStore.update(table, orgId, 'rating-request', {
					status: 'denied',
					reviewed_by: 'other-reviewer',
					denial_reason: 'Keep the evaluation'
				});
			}
			return row;
		});

		await expect(
			handleUseCaseRequest(_postConfig, ctx, { id: 'rating-request', action: 'approve' })
		).rejects.toMatchObject({ status: 404 });
		await expect(ctx.rawStore.findOne('rating_scheme_entries', ctx.auth.orgId, { id: 'entry-1' })).resolves.toEqual({
			id: 'entry-1',
			organization_id: ctx.auth.orgId
		});
		await expect(
			ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'rating-request' })
		).resolves.toMatchObject({ status: 'denied', reviewed_by: 'other-reviewer', denial_reason: 'Keep the evaluation' });
		expect(ctx.notificationPort.notifications).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
	});

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
		const deleteApprovedRatingSchemeEntry = vi.fn();
		const config = _reviewPostConfig(
			{ deleteApprovedTrainingType: vi.fn(), deleteApprovedTrainingRecord: vi.fn() },
			{ deleteApprovedRatingSchemeEntry }
		);
		await expect(handleUseCaseRequest(config, ctx, { id: 'request', action: 'approve' })).rejects.toMatchObject({
			status: 403
		});
		expect(deleteApprovedRatingSchemeEntry).not.toHaveBeenCalled();
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
		const trainingDeletion = {
			deleteApprovedTrainingType: vi.fn(),
			deleteApprovedTrainingRecord: async (_actor: unknown, _requestId: string, recordId: string) => {
				await ctx.rawStore.deleteWhere('personnel_trainings', ctx.auth.orgId, { id: recordId });
			}
		};
		await expect(
			handleUseCaseRequest(_reviewPostConfig(trainingDeletion), ctx, { id: 'request-1', action: 'approve' })
		).resolves.toEqual({ success: true });
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

		await expect(handleUseCaseRequest(_postConfig, ctx, { id: 'request-1', action: 'approve' })).resolves.toEqual({
			success: true
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
		const deleteApprovedTrainingType = vi.fn(async (_actor, _requestId, typeId: string) => {
			await ctx.rawStore.delete('training_types', ctx.auth.orgId, typeId);
		});

		await expect(
			handleUseCaseRequest(
				_reviewPostConfig({ deleteApprovedTrainingType, deleteApprovedTrainingRecord: vi.fn() }),
				ctx,
				{
					id: 'request-1',
					action: 'approve'
				}
			)
		).resolves.toEqual({ success: true });
		expect(deleteApprovedTrainingType).toHaveBeenCalledWith(ctx.auth, 'request-1', 'type-1');
		expect(await ctx.rawStore.findOne('training_types', ctx.auth.orgId, { id: 'type-1' })).toBeNull();
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
		const deleteApprovedTrainingType = vi.fn(async () => {});

		await expect(
			handleUseCaseRequest(
				_reviewPostConfig({ deleteApprovedTrainingType, deleteApprovedTrainingRecord: vi.fn() }),
				ctx,
				{
					id: 'request-1',
					action: 'approve'
				}
			)
		).rejects.toMatchObject({ status: 403 });
		expect(deleteApprovedTrainingType).not.toHaveBeenCalled();
		expect(ctx.auditPort.events.map((event) => event.action)).toEqual(['policy.denied']);
		expect(await ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'request-1' })).toMatchObject({
			status: 'pending'
		});
	});
});
