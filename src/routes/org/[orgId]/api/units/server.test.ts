import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig, _putConfig } from './+server';

const deniedCapabilities = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

describe('/api/units', () => {
	it('denies unit mutations through the policy decision', async () => {
		const configs = [_postConfig, _putConfig, _deleteConfig];

		for (const config of configs) {
			const ctx = createTestContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					canManageMembers: false,
					capabilityMap: deniedCapabilities,
					scopeSet: { kind: 'organization' }
				}
			});

			await expect(handleUseCaseRequest(config, ctx, { id: 'unit-1', name: 'Alpha' })).rejects.toMatchObject({
				status: 403
			});
			expect(ctx.auditPort.events).toEqual([
				expect.objectContaining({
					action: 'policy.denied',
					resourceType: 'personnel.manageUnits'
				})
			]);
		}
	});

	it('creates, updates, and deletes units for an authorized unit manager', async () => {
		const ctx = createTestContext();

		const created = (await handleUseCaseRequest(_postConfig, ctx, { name: 'Alpha', sortOrder: 2 })) as {
			id: string;
			name: string;
			sortOrder: number;
		};

		expect(created).toMatchObject({ name: 'Alpha', sortOrder: 2 });

		const updated = await handleUseCaseRequest(_putConfig, ctx, {
			id: created.id,
			name: 'Bravo',
			sortOrder: 4
		});
		expect(updated).toMatchObject({ id: created.id, name: 'Bravo', sortOrder: 4 });

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: created.id })).resolves.toEqual({ success: true });
		await expect(ctx.store.findMany('units', ctx.auth.orgId)).resolves.toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({ action: 'unit.created', resourceType: 'unit', resourceId: created.id }),
			expect.objectContaining({ action: 'unit.updated', resourceType: 'unit', resourceId: created.id }),
			expect.objectContaining({ action: 'unit.deleted', resourceType: 'unit', resourceId: created.id })
		]);
	});
});
