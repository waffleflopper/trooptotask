import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const PERSON_1 = '00000000-0000-4000-8000-000000002001';
const TRAINING_TYPE = '00000000-0000-4000-8000-000000002002';

describe('/api/personnel-trainings/batch route config', () => {
	it('uses a policy-first route config for Training batch import', () => {
		expect('permission' in _postConfig).toBe(false);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.recordCompletions);
		expect(_postConfig.policyResource).toEqual({ kind: 'unscoped' });
	});

	it('authorizes batch import through policy decisions before use-case scoped checks', async () => {
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
					throw new Error('legacy Training edit flag should not decide batch imports');
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
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: []
			}
		]);

		const result = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				records: [
					{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2026-01-01', status: 'completed' }
				]
			},
			() => ctx
		);

		expect(legacyEditCalled).toBe(false);
		expect(result).toMatchObject({ errors: [] });
	});

	it('denies batch imports before use-case execution when Training policy is missing', async () => {
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
					records: [
						{ personnelId: PERSON_1, trainingTypeId: TRAINING_TYPE, completionDate: '2026-01-01', status: 'completed' }
					]
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
});
