import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig } from './+server';

describe('single-record Calendar availability', () => {
	it('rejects a foreign Person before a Calendar-only Organization operator writes', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'organization' },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.store.seed('personnel', [{ id: 'foreign-person', organization_id: 'another-org', group_id: 'g-1' }]);

		await expect(
			handleUseCaseRequest(_postConfig, ctx, {
				personnelId: 'foreign-person',
				statusTypeId: 'status-1',
				startDate: '2026-09-26',
				endDate: '2026-09-26'
			})
		).rejects.toMatchObject({ status: 404, message: 'Person not found' });
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toHaveLength(0);
	});

	it('lets a Calendar-only Group operator write in scope and rejects other and unassigned People', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.store.seed('personnel', [
			{ id: 'person-alpha', organization_id: ctx.auth.orgId, group_id: 'group-alpha' },
			{ id: 'person-bravo', organization_id: ctx.auth.orgId, group_id: 'group-bravo' },
			{ id: 'person-unassigned', organization_id: ctx.auth.orgId, group_id: null },
			{ id: 'person-foreign', organization_id: 'another-org', group_id: 'group-alpha' }
		]);

		const entry = {
			personnelId: 'person-alpha',
			statusTypeId: 'status-1',
			startDate: '2026-09-26',
			endDate: '2026-09-26'
		};
		const created = (await handleUseCaseRequest(_postConfig, ctx, entry)) as { id: string };
		const bravoEntryId = '00000000-0000-4000-8000-000000000002';
		for (const personnelId of ['person-bravo', 'person-unassigned', 'person-foreign']) {
			await expect(handleUseCaseRequest(_postConfig, ctx, { ...entry, personnelId })).rejects.toMatchObject({
				status: 403
			});
		}
		ctx.store.seed('availability_entries', [
			{
				id: bravoEntryId,
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-bravo',
				status_type_id: 'status-1',
				start_date: '2026-09-26',
				end_date: '2026-09-26'
			}
		]);
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: bravoEntryId })).rejects.toMatchObject({
			status: 403
		});
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: created.id })).resolves.toBeDefined();
		expect(await ctx.rawStore.findOne('availability_entries', ctx.auth.orgId, { id: bravoEntryId })).not.toBeNull();
	});
});
