import { describe, expect, it, vi } from 'vitest';
import {
	createInMemoryDataStore,
	createQueryPortsContext
} from '$features/training/server/trainingPersistence.test-support.server';
import { listTrainingCompletions } from './trainingCompletionRead.server';

describe('Training completion reads', () => {
	it('maps stored identity, nullable dates and certificate details only from the request Organization', async () => {
		const ctx = createQueryPortsContext();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		store.seed('personnel_trainings', [
			{
				id: 'completion-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				training_type_id: 'type-1',
				completion_date: null,
				expiration_date: null,
				notes: 'Complete without a date',
				certificate_url: 'https://example.test/certificate'
			},
			{
				id: 'foreign-completion',
				organization_id: 'other-org',
				personnel_id: 'foreign-person',
				training_type_id: 'foreign-type'
			}
		]);
		const findMany = vi.spyOn(ctx.store, 'findMany');

		await expect(listTrainingCompletions(ctx)).resolves.toMatchObject([
			{
				id: 'completion-1',
				personnelId: 'person-1',
				trainingTypeId: 'type-1',
				completionDate: null,
				expirationDate: null,
				notes: 'Complete without a date',
				certificateUrl: 'https://example.test/certificate'
			}
		]);
		// Hydration, reports and Dashboard each retain one completion scan with no roster lookup.
		expect(findMany).toHaveBeenCalledTimes(1);
	});

	it('denies a reader without Training authority before reading stored completions', async () => {
		const ctx = createQueryPortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'configure',
					ratingScheme: 'none'
				}
			}
		});
		const findMany = vi.spyOn(ctx.store, 'findMany');
		await expect(listTrainingCompletions(ctx)).rejects.toMatchObject({ status: 403 });
		expect(findMany).not.toHaveBeenCalled();
	});
});
