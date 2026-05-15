import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig, _postConfig } from './+server';

function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [
		{
			id: 'person-1',
			organization_id: ctx.auth.orgId,
			group_id: null
		}
	]);
}

describe('/api/personnel/[id]/leader-notes', () => {
	it('lists and creates leader notes through the API configs', async () => {
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
		seedPersonnel(ctx);

		await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'person-1',
			text: 'Won the monthly Soldier board.'
		});
		const notes = await handleUseCaseRequest(_getConfig, ctx, { personnelId: 'person-1' });

		expect(notes).toHaveLength(1);
		expect(notes[0]).toMatchObject({
			author: 'test-user',
			text: 'Won the monthly Soldier board.'
		});
	});

	it('derives the Personnel id from the route param and rejects mismatched bodies', async () => {
		await expect(
			_postConfig.parseInput?.({
				params: { id: 'person-1' },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ personnelId: 'person-2', text: 'Mismatch' })
				})
			} as never)
		).rejects.toMatchObject({ status: 400 });

		await expect(
			_postConfig.parseInput?.({
				params: { id: 'person-1' },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ text: 'Observation' })
				})
			} as never)
		).resolves.toMatchObject({ personnelId: 'person-1', text: 'Observation' });
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
		seedPersonnel(ctx);

		await expect(handleUseCaseRequest(_getConfig, ctx, { personnelId: 'person-1' })).rejects.toMatchObject({
			status: 403
		});
	});
});
