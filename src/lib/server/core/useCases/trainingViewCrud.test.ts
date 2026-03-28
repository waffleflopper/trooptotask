import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { TrainingViewEntity } from '$lib/server/entities/trainingView';
import { createCrudUseCases } from './crud';

const useCases = createCrudUseCases({
	entity: TrainingViewEntity,
	permission: TrainingViewEntity.permission!,
	auditResource: (TrainingViewEntity.audit as { resourceType: string }).resourceType,
	requireFullEditor: TrainingViewEntity.requireFullEditor
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
});
