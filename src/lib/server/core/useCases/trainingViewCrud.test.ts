import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { TrainingViewEntity } from '$lib/server/entities/trainingView';
import { getEntityAuditResource } from '$lib/server/entitySchema';
import { createCrudUseCases } from '$lib/server/core/useCases/crud';

const useCases = createCrudUseCases({
	entity: TrainingViewEntity,
	auditResource: getEntityAuditResource(TrainingViewEntity),
	policyAction: TrainingViewEntity.policyAction!
});

describe('TrainingView CRUD use case', () => {
	it('creates a training view and audits', async () => {
		const ctx = createWritePortsContext();

		const result = (await useCases.create(ctx, {
			name: 'Default View',
			columnIds: ['col-1', 'col-2']
		})) as { name: string; columnIds: string[] };

		expect(result).toMatchObject({ name: 'Default View', columnIds: ['col-1', 'col-2'] });

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'training_view.created',
			resourceType: 'training_view'
		});
	});

	it('denies saved-view configuration without Training configure capability', async () => {
		const ctx = createWritePortsContext({
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
				}
			}
		});

		await expect(
			useCases.create(ctx, {
				name: 'Default View',
				columnIds: ['col-1', 'col-2']
			})
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'training_view',
				details: expect.objectContaining({
					policyAction: 'training.configureRequirements',
					reasonCode: 'denied:missing-capability'
				}),
				severity: 'warning'
			})
		);
	});
});
