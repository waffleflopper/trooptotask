import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createAvailability, deleteAvailability, updateAvailability } from './availabilityOperations.server';

describe('Calendar availability operations', () => {
	it('reports missing entries to Organization operators without disclosing them to Group members', async () => {
		const organization = createTestContext();
		await expect(updateAvailability(organization, { id: 'missing', note: 'Updated' })).rejects.toMatchObject({
			status: 404
		});
		await expect(deleteAvailability(organization, 'missing')).rejects.toMatchObject({ status: 404 });

		const scoped = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'operate',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
			}
		});
		await expect(updateAvailability(scoped, { id: 'missing', note: 'Updated' })).rejects.toMatchObject({ status: 403 });
		await expect(deleteAvailability(scoped, 'missing')).rejects.toMatchObject({ status: 403 });
	});

	it('keeps a saved status attached to its Person and audits the single-record lifecycle', async () => {
		const ctx = createTestContext();
		const auditLog = vi.spyOn(ctx.audit, 'log');
		ctx.store.seed('personnel', [
			{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null },
			{ id: 'person-2', organization_id: ctx.auth.orgId, group_id: null }
		]);
		const created = (await createAvailability(ctx, {
			personnelId: 'person-1',
			statusTypeId: 'status-1',
			startDate: '2026-09-26',
			endDate: '2026-09-27'
		})) as { id: string; personnelId: string };
		await expect(
			updateAvailability(ctx, { id: created.id, personnelId: 'person-2', statusTypeId: 'status-2' })
		).rejects.toMatchObject({ status: 400 });
		const updated = await updateAvailability(ctx, { id: created.id, statusTypeId: 'status-2' });
		expect(updated).toMatchObject({ id: created.id, personnelId: 'person-1', statusTypeId: 'status-2' });
		await deleteAvailability(ctx, created.id);
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toHaveLength(0);
		expect(auditLog.mock.calls.map(([event]) => event.action)).toEqual([
			'availability.created',
			'availability.updated',
			'availability.deleted'
		]);
	});
});
