import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { projectOrganizationAccessGrant } from '$lib/access/memberAccessProjection';
import { _deleteConfig, _getConfig, _postConfig } from './+server';

const PERSON_1 = '00000000-0000-4000-8000-000000002001';
const TRAINING_TYPE = '00000000-0000-4000-8000-000000002002';
const RECORD = '00000000-0000-4000-8000-000000002003';
const PERSON_BRAVO = '00000000-0000-4000-8000-000000002004';

describe('/api/personnel-trainings route config', () => {
	it("reads a Person's current records for a Group operator in scope and refuses People outside it", async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha'] }),
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.store.seed('personnel', [
			{ id: PERSON_1, organization_id: ctx.auth.orgId, group_id: 'group-alpha' },
			{ id: PERSON_BRAVO, organization_id: ctx.auth.orgId, group_id: 'group-bravo' }
		]);
		ctx.store.seed('personnel_trainings', [
			{
				id: RECORD,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_1,
				training_type_id: TRAINING_TYPE,
				completion_date: '2026-01-01',
				expiration_date: '2027-01-01',
				notes: null,
				certificate_url: null
			}
		]);

		expect(await handleUseCaseRequest(_getConfig, ctx, { personnelId: PERSON_1 }, () => ctx)).toEqual([
			{
				id: RECORD,
				personnelId: PERSON_1,
				trainingTypeId: TRAINING_TYPE,
				completionDate: '2026-01-01',
				expirationDate: '2027-01-01',
				notes: null,
				certificateUrl: null,
				organization_id: ctx.auth.orgId
			}
		]);
		await expect(handleUseCaseRequest(_getConfig, ctx, { personnelId: PERSON_BRAVO }, () => ctx)).rejects.toMatchObject(
			{ status: 403 }
		);
	});

	it("refuses an owner a Person's records while the unit has Training turned off, before any read", async () => {
		const auth = projectOrganizationAccessGrant({ role: 'owner' }, 'owner-1', 'test-org', {
			disabledFeatures: ['training']
		});
		const ctx = createTestContext({ auth: { ...auth } });
		ctx.store.seed('personnel', [{ id: PERSON_1, organization_id: ctx.auth.orgId, group_id: null }]);
		const findMany = vi.spyOn(ctx.store, 'findMany').mockRejectedValue(new Error('Training must not be read'));

		await expect(handleUseCaseRequest(_getConfig, ctx, { personnelId: PERSON_1 }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		expect(findMany).not.toHaveBeenCalled();
	});

	it.each(['operate', 'configure'] as const)('retains the %s deletion response and target effect', async (training) => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training,
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		const id = '11111111-1111-4111-8111-111111111111';
		ctx.store.seed('personnel', [{ id: PERSON_1, organization_id: ctx.auth.orgId, group_id: null }]);
		const record = {
			id,
			organization_id: ctx.auth.orgId,
			personnel_id: PERSON_1,
			training_type_id: TRAINING_TYPE,
			completion_date: '2026-01-01'
		};
		ctx.store.seed('personnel_trainings', [record]);

		const result = await handleUseCaseRequest(_deleteConfig, ctx, { id }, () => ctx);
		const response = _deleteConfig.formatOutput!(result);
		expect(response.status).toBe(training === 'operate' ? 202 : 200);
		expect(await response.json()).toEqual(training === 'operate' ? { requiresApproval: true } : { success: true });
		expect(await ctx.store.findMany('personnel_trainings', ctx.auth.orgId)).toEqual(
			training === 'operate' ? [record] : []
		);
	});

	it('authorizes Training record writes through policy decisions before use-case scoped checks', async () => {
		let legacyEditCalled = false;
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				requireEdit() {
					legacyEditCalled = true;
					throw new Error('legacy Training edit flag should not decide record writes');
				}
			}
		});

		ctx.store.seed('personnel', [
			{
				id: PERSON_1,
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				group_id: null,
				archived_at: null
			}
		]);
		ctx.store.seed('training_types', [
			{
				id: TRAINING_TYPE,
				organization_id: ctx.auth.orgId,
				expiration_months: null,
				expiration_date_only: false
			}
		]);

		await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				personnelId: PERSON_1,
				trainingTypeId: TRAINING_TYPE,
				completionDate: '2026-01-01',
				notes: null,
				certificateUrl: null
			},
			() => ctx
		);

		expect(legacyEditCalled).toBe(false);
		const stored = await ctx.store.findMany('personnel_trainings', ctx.auth.orgId);
		expect(stored).toHaveLength(1);
	});

	it('preserves omitted saved completion fields through the configured POST use case', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [{ id: PERSON_1, organization_id: ctx.auth.orgId, group_id: null }]);
		ctx.store.seed('training_types', [
			{ id: TRAINING_TYPE, organization_id: ctx.auth.orgId, expiration_months: 12, expiration_date_only: false }
		]);
		ctx.store.seed('personnel_trainings', [
			{
				id: RECORD,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_1,
				training_type_id: TRAINING_TYPE,
				completion_date: '2025-03-15',
				expiration_date: '2026-03-15',
				notes: 'Saved notes',
				certificate_url: 'https://example.test/saved-certificate',
				created_at: '2025-03-15T12:00:00.000Z'
			}
		]);

		const result = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, notes: 'Changed notes' },
			() => ctx
		);
		expect(result).toEqual({
			id: RECORD,
			personnelId: PERSON_1,
			trainingTypeId: TRAINING_TYPE,
			completionDate: '2025-03-15',
			expirationDate: '2026-03-15',
			notes: 'Changed notes',
			certificateUrl: 'https://example.test/saved-certificate',
			organization_id: ctx.auth.orgId,
			created_at: '2025-03-15T12:00:00.000Z',
			updated_at: expect.any(String)
		});
		expect(await ctx.store.findMany('personnel_trainings', ctx.auth.orgId)).toEqual([
			{
				id: RECORD,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_1,
				training_type_id: TRAINING_TYPE,
				completion_date: '2025-03-15',
				expiration_date: '2026-03-15',
				notes: 'Changed notes',
				certificate_url: 'https://example.test/saved-certificate',
				created_at: '2025-03-15T12:00:00.000Z',
				updated_at: expect.any(String)
			}
		]);
	});

	it.each([
		['an empty body', {}, 'Choose a Person; Choose a Training type'],
		[
			'an impossible completion date',
			{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2026-02-30' },
			'Use a valid date (YYYY-MM-DD)'
		],
		[
			'two impossible dates',
			{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2026-02-30', expirationDate: 'soon' },
			'Use a valid date (YYYY-MM-DD)'
		]
	])('answers 400 for %s and saves nothing', async (_label, input, message) => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [{ id: PERSON_1, organization_id: ctx.auth.orgId, group_id: null }]);
		ctx.store.seed('training_types', [
			{ id: TRAINING_TYPE, organization_id: ctx.auth.orgId, expiration_months: 12, expiration_date_only: false }
		]);

		await expect(handleUseCaseRequest(_postConfig, ctx, input, () => ctx)).rejects.toMatchObject({
			status: 400,
			message
		});
		expect(await ctx.store.findMany('personnel_trainings', ctx.auth.orgId)).toEqual([]);
	});

	it('denies personnel training writes before executing the use case when Training policy is missing', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'view',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					personnelId: PERSON_1,
					trainingTypeId: TRAINING_TYPE,
					completionDate: '2026-01-01',
					notes: null,
					certificateUrl: null
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'training.recordCompletions'
			})
		]);
	});

	it('marks the read private and non-cacheable', () => {
		const response = _getConfig.formatOutput!([]);

		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
	});
});
