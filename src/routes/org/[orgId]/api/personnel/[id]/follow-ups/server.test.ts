import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import type { PersonnelFollowUp } from '$features/personnel/personnel-detail.types';
import { _getConfig, _postConfig } from './+server';
import { _patchConfig } from './[followUpId]/+server';

function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [
		{
			id: 'person-1',
			organization_id: ctx.auth.orgId,
			group_id: null
		}
	]);
}

describe('/api/personnel/[id]/follow-ups', () => {
	it('lists, creates, updates, toggles, and archives follow-ups through API configs', async () => {
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

		const created = (await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'person-1',
			title: 'Complete BLC packet'
		})) as PersonnelFollowUp;
		const completed = (await handleUseCaseRequest(_patchConfig, ctx, {
			personnelId: 'person-1',
			followUpId: created.id,
			status: 'completed'
		})) as PersonnelFollowUp;
		const edited = (await handleUseCaseRequest(_patchConfig, ctx, {
			personnelId: 'person-1',
			followUpId: created.id,
			title: 'Updated packet follow-up',
			notes: 'Bring forms to the training room',
			dueDate: '2026-06-15'
		})) as PersonnelFollowUp;
		const followUps = (await handleUseCaseRequest(_getConfig, ctx, { personnelId: 'person-1' })) as PersonnelFollowUp[];
		const archived = (await handleUseCaseRequest(_patchConfig, ctx, {
			personnelId: 'person-1',
			followUpId: created.id,
			status: 'archived'
		})) as PersonnelFollowUp;
		const restored = (await handleUseCaseRequest(_patchConfig, ctx, {
			personnelId: 'person-1',
			followUpId: created.id,
			action: 'restore'
		})) as PersonnelFollowUp;

		expect(created).toMatchObject({ title: 'Complete BLC packet', status: 'open' });
		expect(completed).toMatchObject({ id: created.id, status: 'completed' });
		expect(edited).toMatchObject({
			id: created.id,
			title: 'Updated packet follow-up',
			notes: 'Bring forms to the training room',
			dueDate: '2026-06-15'
		});
		expect(followUps).toHaveLength(1);
		expect(archived.status).toBe('archived');
		expect(restored.status).toBe('open');
	});

	it('derives the Personnel id from the route param and rejects mismatched bodies', async () => {
		await expect(
			_postConfig.parseInput?.({
				params: { id: 'person-1' },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ personnelId: 'person-2', title: 'Mismatch' })
				})
			} as never)
		).rejects.toMatchObject({ status: 400 });

		await expect(
			_postConfig.parseInput?.({
				params: { id: 'person-1' },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ title: 'Follow up' })
				})
			} as never)
		).resolves.toMatchObject({ personnelId: 'person-1', title: 'Follow up' });
	});

	it('rejects mixed status and edit payloads instead of silently dropping fields', async () => {
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

		const created = (await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'person-1',
			title: 'Complete BLC packet'
		})) as PersonnelFollowUp;

		await expect(
			handleUseCaseRequest(_patchConfig, ctx, {
				personnelId: 'person-1',
				followUpId: created.id,
				title: 'Updated packet follow-up',
				status: 'open'
			})
		).rejects.toMatchObject({ status: 400 });
	});

	it('rejects unknown follow-up action and status payloads', async () => {
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
		const created = (await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'person-1',
			title: 'Complete BLC packet'
		})) as PersonnelFollowUp;

		await expect(
			handleUseCaseRequest(_patchConfig, ctx, {
				personnelId: 'person-1',
				followUpId: created.id,
				action: 'publish'
			})
		).rejects.toMatchObject({ status: 400 });
		await expect(
			handleUseCaseRequest(_patchConfig, ctx, {
				personnelId: 'person-1',
				followUpId: created.id,
				status: 'pending'
			})
		).rejects.toMatchObject({ status: 400 });
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
