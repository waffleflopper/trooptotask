import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { GroupEntity } from '$lib/server/entities/group';
import { createCrudUseCases } from './crud';

const useCases = createCrudUseCases({
	entity: GroupEntity,
	permission: GroupEntity.permission!,
	auditResource: (GroupEntity.audit as { resourceType: string }).resourceType
});

describe('Group CRUD use case', () => {
	it('creates a group, persists it, and audits', async () => {
		const ctx = createWritePortsContext();

		const result = (await useCases.create(ctx, { name: 'Alpha Team', sortOrder: 1 })) as {
			name: string;
			sortOrder: number;
		};

		expect(result).toMatchObject({ name: 'Alpha Team', sortOrder: 1 });

		const stored = await ctx.store.findMany('groups', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'group.created',
			resourceType: 'group'
		});
	});

	it('updates a group name and audits', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('groups', [{ id: 'g-1', name: 'Old Name', sort_order: 0, organization_id: 'test-org' }]);

		const result = (await useCases.update(ctx, { id: 'g-1', name: 'New Name' })) as {
			name: string;
		};
		expect(result.name).toBe('New Name');

		expect(ctx.audit.events[0]).toMatchObject({
			action: 'group.updated',
			resourceId: 'g-1'
		});
	});

	it('deletes a group and audits', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('groups', [{ id: 'g-1', name: 'Doomed', sort_order: 0, organization_id: 'test-org' }]);

		await useCases.remove(ctx, 'g-1');

		const stored = await ctx.store.findOne('groups', 'test-org', { id: 'g-1' });
		expect(stored).toBeNull();

		expect(ctx.audit.events[0]).toMatchObject({
			action: 'group.deleted',
			resourceId: 'g-1'
		});
	});

	it('rejects create when read-only', async () => {
		const ctx = createWritePortsContext({ readOnly: true });

		await expect(useCases.create(ctx, { name: 'Nope' })).rejects.toMatchObject({ status: 403 });
	});
});
