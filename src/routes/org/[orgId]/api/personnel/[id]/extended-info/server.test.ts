import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _putConfig } from './+server';

describe('/api/personnel/[id]/extended-info', () => {
	it('persists Soldier Data Sheet fields through the API use-case config', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: ctx.auth.orgId,
				group_id: null,
				rank: 'SGT',
				last_name: 'Rivera',
				first_name: 'Monica'
			}
		]);

		const result = await handleUseCaseRequest(_putConfig, ctx, {
			personnelId: 'person-1',
			bloodType: 'AB+',
			basd: '2018-03-01',
			dateOfRank: '2022-10-01',
			numberOfDependents: 1,
			children: [{ name: 'Avery', age: 7 }],
			militaryEducation: ['BLC', 'Airborne'],
			emergencyContactName: 'Jamie Rivera'
		});

		expect(result).toMatchObject({
			bloodType: 'AB+',
			basd: '2018-03-01',
			dateOfRank: '2022-10-01',
			numberOfDependents: 1,
			children: [{ name: 'Avery', age: 7 }],
			militaryEducation: ['BLC', 'Airborne'],
			emergencyContactName: 'Jamie Rivera'
		});
	});

	it('requires Personnel operate capability', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: ctx.auth.orgId,
				group_id: null
			}
		]);

		await expect(handleUseCaseRequest(_putConfig, ctx, { personnelId: 'person-1' })).rejects.toMatchObject({
			status: 403
		});
	});

	it('derives the Personnel id from the route param and rejects mismatched bodies', async () => {
		await expect(
			_putConfig.parseInput?.({
				params: { id: 'person-1' },
				request: new Request('http://localhost', {
					method: 'PUT',
					body: JSON.stringify({ personnelId: 'person-2' })
				})
			} as never)
		).rejects.toMatchObject({ status: 400 });

		await expect(
			_putConfig.parseInput?.({
				params: { id: 'person-1' },
				request: new Request('http://localhost', {
					method: 'PUT',
					body: JSON.stringify({ bloodType: 'O+' })
				})
			} as never)
		).resolves.toMatchObject({ personnelId: 'person-1', bloodType: 'O+' });
	});
});
